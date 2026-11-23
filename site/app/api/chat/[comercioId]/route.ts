import { NextResponse } from 'next/server';
import { z } from 'zod';

import { loadPublicMenuByIdentifier } from '../../menu/_lib/load-public-menu';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import {
  allowsLocalOfflineChatbotCommerce,
  assertChatbotCommerceAccess,
  CommerceAccessError,
} from '../_lib/commerce-auth';
import {
  CHATBOT_UNAVAILABLE_MSG,
  getChatbotConfig,
  isChatbotRuntimeAllowed,
} from '../_lib/config';
import {
  GeminiChatError,
  liveBudgetPublicSnapshot,
  runChatWithGemini,
  runDeterministicCartSummary,
  runDeterministicDeliveryInfo,
} from '../_lib/gemini';
import {
  ChatbotQuotaError,
  recordChatbotTokensAsync,
  reserveChatbotRequestAsync,
} from '../_lib/quota';
import {
  chatRequestSchema,
  createRequestId,
  createSessionId,
} from '../_lib/schema';
import {
  isGeminiSimulationEnabled,
  runSimulatedChat,
} from '../_lib/simulate-gemini';
import type { ChatToolContext } from '../_lib/tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Re-check supervision after a (possibly long) Gemini/simulator turn.
 * Takeover mid-flight must not deliver the automatic reply to the consumer.
 */
async function discardInFlightAssistantReply(input: {
  commerceId: string;
  sessionId: string;
  attentionVersionAtStart: number | null;
}): Promise<boolean> {
  try {
    const { shouldSkipGemini } = await import('../_lib/supervision');
    const { shouldDiscardInFlightAssistant } = await import(
      '../_lib/supervision-shared'
    );
    const { getChatSupervisionConfig } = await import('../_lib/supervision-config');
    const gate = await shouldSkipGemini(input.commerceId, input.sessionId);
    return shouldDiscardInFlightAssistant({
      humanTakeoverEnabled: getChatSupervisionConfig().humanTakeover,
      status: gate.conversation?.status,
      attentionVersionAtStart: input.attentionVersionAtStart,
      attentionVersionNow: gate.conversation?.attention_version ?? null,
    });
  } catch {
    return false;
  }
}

function publicError(
  status: number,
  code: string,
  clientMessage = CHATBOT_UNAVAILABLE_MSG,
  extra?: Record<string, unknown>,
) {
  return json(
    {
      ok: false,
      error: code,
      message: clientMessage,
      reply: clientMessage,
      fallback: {
        useTraditionalMenu: true,
        hint: 'Puedes usar el menú tradicional o WhatsApp del restaurante.',
      },
      ...extra,
    },
    status,
  );
}

/**
 * GET — authorization status for the UI (no secrets).
 * Does not enable Gemini by itself; POST still enforces full gates + quota.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const config = getChatbotConfig();
  const gate = isChatbotRuntimeAllowed(config);
  const { comercioId: rawId } = await context.params;
  const pathId = decodeURIComponent(rawId || '').trim();

  return json({
    ok: true,
    pathComercioId: pathId || null,
    authorized: gate.ok,
    reason: gate.ok ? null : gate.reason || 'chatbot_disabled',
    allowlistConfigured: config.allowedCommerceIds.size > 0,
    requireCommerceFlag: config.requireCommerceFlag,
    quotaBackend: config.quotaBackend,
    model: config.model,
    modelFallback: config.modelFallback,
    // Never echo API keys, allowlist UUIDs, or internal paths
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ comercioId: string }> },
) {
  const config = getChatbotConfig();
  const gate = isChatbotRuntimeAllowed(config);
  if (!gate.ok) {
    return publicError(403, gate.reason || 'chatbot_disabled');
  }

  const { comercioId: rawId } = await context.params;
  const pathComercioId = decodeURIComponent(rawId || '').trim();
  if (!pathComercioId || pathComercioId.length > 120) {
    return publicError(400, 'missing_comercio');
  }

  const ip = getClientIp(request);
  const rate = consumeRateLimit(
    `chatbot:ip:${ip}`,
    config.rateLimitPerIpPerMinute,
    60_000,
  );
  if (!rate.ok) {
    return publicError(429, 'ip_rate_limit');
  }

  let body: z.infer<typeof chatRequestSchema>;
  try {
    const raw = await request.json();
    body = chatRequestSchema.parse(raw);
  } catch {
    return publicError(400, 'invalid_body', 'Mensaje inválido. Intenta de nuevo.');
  }

  const spoofCandidate = (body.comercio_id || body.commerce_id || '').trim();
  if (spoofCandidate && spoofCandidate !== pathComercioId) {
    return publicError(403, 'tenant_spoof_rejected');
  }

  const messages = body.messages
    .slice(-Math.min(config.maxMessagesPerRequest, config.maxHistoryMessages))
    .map((m) => ({
      role: m.role,
      text: m.text.slice(0, config.maxMessageChars),
    }));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return publicError(400, 'last_message_must_be_user');
  }

  const last = messages[messages.length - 1];
  if (!last.text.trim()) {
    return publicError(400, 'empty_message');
  }

  const sessionId = body.sessionId || createSessionId();
  const requestId = createRequestId();

  let menu;
  try {
    menu = await loadPublicMenuByIdentifier(pathComercioId);
  } catch {
    return publicError(502, 'menu_load_failed');
  }

  if (!menu) {
    return publicError(404, 'comercio_not_found');
  }

  const commerceId = menu.resolvedComercioId;
  const comercio = menu.comercio as {
    nombre?: string;
    moneda?: string;
    en_linea?: boolean;
    whatsapp?: string | null;
  };

  const isOnline = comercio.en_linea === true || menu.isOnline === true;
  if (
    !isOnline &&
    !allowsLocalOfflineChatbotCommerce({ commerceId })
  ) {
    return publicError(403, 'commerce_offline');
  }

  let supabase = null;
  try {
    if (config.quotaBackend === 'postgres' || config.requireCommerceFlag) {
      supabase = getServiceSupabaseClient();
    }
  } catch {
    return publicError(503, 'quota_unavailable');
  }

  try {
    await assertChatbotCommerceAccess({
      config,
      commerceId,
      supabase,
    });
  } catch (err) {
    if (err instanceof CommerceAccessError) {
      return publicError(err.status, err.code);
    }
    return publicError(403, 'commerce_access_denied');
  }

  const toolCtx: ChatToolContext = {
    menu,
    commerceId,
    cartSnapshot: (body.cart_snapshot || []).map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      selection: (l.selection || {}) as import('../_lib/cart-proposals').ChatCartSnapshotLine['selection'],
    })),
    pendingActions: [],
    pendingCards: [],
    pendingConfiguration: null,
  };

  // Merchant supervision — best-effort. Failures never block the consumer chat.
  let supervisionConversationId: string | null = null;
  let attentionVersionAtStart: number | null = null;
  let skipGeminiForHuman = false;
  let supervisionFeedToken: string | null = null;
  try {
    const {
      persistConsumerTurn,
      shouldSkipGemini,
      mintSupervisionFeedToken,
    } = await import('../_lib/supervision');
    const persisted = await persistConsumerTurn({
      comercioId: commerceId,
      commerceName: String(comercio.nombre || ''),
      sessionId,
      text: last.text,
      publicWhatsapp: comercio.whatsapp || null,
    });
    if (persisted.ok && persisted.conversationId) {
      supervisionConversationId = persisted.conversationId;
      attentionVersionAtStart = persisted.attentionVersion ?? null;
    }
    const humanGate = await shouldSkipGemini(commerceId, sessionId);
    skipGeminiForHuman = humanGate.skip;
    if (humanGate.conversation) {
      supervisionConversationId = humanGate.conversation.id;
      attentionVersionAtStart = humanGate.conversation.attention_version;
    }
    if (supervisionConversationId) {
      supervisionFeedToken = mintSupervisionFeedToken(commerceId, sessionId);
    }
  } catch {
    /* supervision optional */
  }

  const supervisionPayload = (mode: string) =>
    supervisionConversationId
      ? {
          mode,
          conversationId: supervisionConversationId,
          ...(supervisionFeedToken ? { feedToken: supervisionFeedToken } : {}),
        }
      : undefined;

  if (skipGeminiForHuman) {
    return json({
      ok: true,
      reply:
        'Un miembro del restaurante está atendiendo esta conversación. Te responderán por aquí en breve 😊',
      sessionId,
      model: 'human_handoff',
      commerceId,
      requestId,
      skipped_llm: true,
      supervision: supervisionPayload('human_handling'),
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: 0,
        geminiHttpCalls: 0,
      },
      cart_actions: [],
      product_cards: [],
      pending_configuration: null,
      category_cards: [],
      order_actions: [],
    });
  }

  const persistAssistantReply = async (text: string, extra?: Record<string, unknown>) => {
    if (!supervisionConversationId || !text.trim()) return;
    try {
      const { persistAssistantOrStaffMessage } = await import('../_lib/supervision');
      await persistAssistantOrStaffMessage({
        conversationId: supervisionConversationId,
        comercioId: commerceId,
        role: 'assistant',
        text,
        attentionVersionAtStart,
        payload: extra,
      });
    } catch {
      /* ignore */
    }
  };

  // Local Gemini simulator — zero Google HTTP (Phase 3.1 visual/integration).
  if (isGeminiSimulationEnabled()) {
    const simulated = runSimulatedChat({
      menu,
      commerceId,
      messages,
      cartSnapshot: toolCtx.cartSnapshot,
      pendingConfiguration: body.pending_configuration
        ? {
            product_id: body.pending_configuration.product_id,
            product_name: body.pending_configuration.product_name || '',
            combine_with_product_id:
              body.pending_configuration.combine_with_product_id,
            combine_with_product_name:
              body.pending_configuration.combine_with_product_name || '',
            quantity: body.pending_configuration.quantity,
            option_labels: body.pending_configuration.option_labels,
            exclude_ingredients: body.pending_configuration.exclude_ingredients,
            missing_attribute: 'size',
            size_choices: [],
          }
        : null,
    });
    const discardedSim = await discardInFlightAssistantReply({
      commerceId,
      sessionId,
      attentionVersionAtStart,
    });
    if (discardedSim) {
      return json({
        ok: true,
        reply:
          'Un miembro del restaurante está atendiendo esta conversación. Te responderán por aquí en breve 😊',
        sessionId,
        model: 'human_handoff',
        commerceId,
        requestId,
        skipped_llm: true,
        simulated: true,
        supervision: supervisionPayload('human_handling'),
        usage: {
          tokensInput: 0,
          tokensOutput: 0,
          toolCalls: 0,
          geminiHttpCalls: 0,
        },
        cart_actions: [],
        product_cards: [],
        pending_configuration: null,
        category_cards: [],
        order_actions: [],
      });
    }
    await persistAssistantReply(simulated.text, {
      cart_actions: simulated.cartActions,
      product_cards: simulated.productCards,
      category_cards: [],
    });
    return json({
      ok: true,
      reply: simulated.text,
      sessionId,
      model: simulated.model,
      commerceId,
      requestId,
      skipped_llm: true,
      simulated: true,
      ...(supervisionPayload('ai_handling')
        ? { supervision: supervisionPayload('ai_handling') }
        : {}),
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: simulated.toolCalls,
        geminiHttpCalls: 0,
      },
      cart_actions: simulated.cartActions,
      product_cards: simulated.productCards,
      pending_configuration: simulated.pendingConfiguration ?? null,
      category_cards: [],
      order_actions: [],
    });
  }

  const humanHandoffJson = (extra?: Record<string, unknown>) =>
    json({
      ok: true,
      reply:
        'Un miembro del restaurante está atendiendo esta conversación. Te responderán por aquí en breve 😊',
      sessionId,
      model: 'human_handoff',
      commerceId,
      requestId,
      skipped_llm: true,
      supervision: supervisionPayload('human_handling'),
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: 0,
        geminiHttpCalls: 0,
      },
      cart_actions: [],
      product_cards: [],
      pending_configuration: null,
      category_cards: [],
      order_actions: [],
      ...extra,
    });

  // Deterministic paths — zero Gemini HTTP (cost control).
  if (body.deterministic_action === 'complete_pending_config') {
    const discardedDet = await discardInFlightAssistantReply({
      commerceId,
      sessionId,
      attentionVersionAtStart,
    });
    if (discardedDet) return humanHandoffJson();
    const pending = body.pending_configuration;
    if (!pending) {
      return publicError(400, 'missing_pending_configuration');
    }
    const { prepareCartLineProposal } = await import('../_lib/cart-proposals');
    const lastText = messages[messages.length - 1]?.text || '';
    const sizeHint = /\b(grande|normal|mediana|familiar)\b/i.exec(lastText)?.[1];
    const optionLabels = [
      ...(pending.option_labels || []),
      ...(sizeHint ? [sizeHint] : []),
    ];
    const result = prepareCartLineProposal(menu, commerceId, {
      product_id: pending.product_id,
      product_name: pending.product_name,
      combine_with_product_id: pending.combine_with_product_id,
      combine_with_product_name: pending.combine_with_product_name,
      quantity: pending.quantity || 1,
      option_labels: optionLabels,
      exclude_ingredients: pending.exclude_ingredients,
    });
    const cartActions =
      result.status === 'ready' ? [result.action] : [];
    const productCards =
      result.status === 'ready'
        ? [result.action.product_card]
        : result.status === 'needs_options' && !result.ask_attribute_only
          ? result.product_card
            ? [result.product_card]
            : []
          : [];
    const detReply =
      result.status === 'ready'
        ? result.message
        : result.message || 'Necesito un dato más para armar la combinación.';
    await persistAssistantReply(detReply, {
      cart_actions: cartActions,
      product_cards: productCards,
      category_cards: [],
    });
    return json({
      ok: true,
      reply: detReply,
      sessionId,
      model: 'deterministic',
      commerceId,
      requestId,
      skipped_llm: true,
      ...(supervisionPayload('ai_handling')
        ? { supervision: supervisionPayload('ai_handling') }
        : {}),
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: 1,
        geminiHttpCalls: 0,
      },
      cart_actions: cartActions,
      product_cards: productCards,
      pending_configuration:
        result.status === 'needs_options'
          ? result.pending_configuration || null
          : null,
      category_cards: [],
      order_actions: [],
    });
  }
  if (body.deterministic_action === 'summarize_cart') {
    const discardedDet = await discardInFlightAssistantReply({
      commerceId,
      sessionId,
      attentionVersionAtStart,
    });
    if (discardedDet) return humanHandoffJson();
    const result = runDeterministicCartSummary({ toolCtx, requestId });
    await persistAssistantReply(result.text, {
      cart_actions: result.cartActions,
      product_cards: result.productCards,
      category_cards: result.categoryCards || [],
    });
    return json({
      ok: true,
      reply: result.text,
      sessionId,
      model: result.model,
      commerceId,
      requestId,
      skipped_llm: true,
      ...(supervisionPayload('ai_handling')
        ? { supervision: supervisionPayload('ai_handling') }
        : {}),
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: result.toolCalls,
        geminiHttpCalls: 0,
      },
      attribution: result.attribution,
      cart_actions: result.cartActions,
      product_cards: result.productCards,
      category_cards: result.categoryCards,
      order_actions: [],
    });
  }
  if (body.deterministic_action === 'delivery_info') {
    const discardedDet = await discardInFlightAssistantReply({
      commerceId,
      sessionId,
      attentionVersionAtStart,
    });
    if (discardedDet) return humanHandoffJson();
    const result = runDeterministicDeliveryInfo({ toolCtx, requestId });
    await persistAssistantReply(result.text);
    return json({
      ok: true,
      reply: result.text,
      sessionId,
      model: result.model,
      commerceId,
      requestId,
      skipped_llm: true,
      ...(supervisionPayload('ai_handling')
        ? { supervision: supervisionPayload('ai_handling') }
        : {}),
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: result.toolCalls,
        geminiHttpCalls: 0,
      },
      attribution: result.attribution,
      cart_actions: [],
      product_cards: [],
      category_cards: [],
      order_actions: [],
    });
  }

  try {
    await reserveChatbotRequestAsync({
      config,
      commerceId,
      sessionId,
      supabase,
      isNewConversation: messages.filter((m) => m.role === 'user').length <= 1,
    });
  } catch (err) {
    if (err instanceof ChatbotQuotaError) {
      return publicError(err.status, err.code);
    }
    return publicError(503, 'quota_unavailable');
  }

  try {
    const result = await runChatWithGemini({
      config,
      toolCtx,
      businessName: String(comercio.nombre || 'el restaurante'),
      currency: (comercio.moneda || 'COP').toString().trim().toUpperCase() || 'COP',
      messages,
      requestId,
    });

    await recordChatbotTokensAsync({
      config,
      commerceId,
      supabase,
      model: result.model,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
    });

    const discardedLive = await discardInFlightAssistantReply({
      commerceId,
      sessionId,
      attentionVersionAtStart,
    });
    if (discardedLive) {
      return json({
        ok: true,
        reply:
          'Un miembro del restaurante está atendiendo esta conversación. Te responderán por aquí en breve 😊',
        sessionId,
        model: 'human_handoff',
        commerceId,
        requestId,
        skipped_llm: true,
        supervision: supervisionPayload('human_handling'),
        usage: {
          tokensInput: result.tokensInput,
          tokensOutput: result.tokensOutput,
          toolCalls: result.toolCalls,
          geminiHttpCalls: result.geminiHttpCalls,
        },
        attribution: result.attribution,
        live_budget: liveBudgetPublicSnapshot(),
        cart_actions: [],
        product_cards: [],
        pending_configuration: null,
        category_cards: [],
        order_actions: [],
      });
    }

    await persistAssistantReply(result.text, {
      cart_actions: result.cartActions,
      product_cards: result.productCards,
      category_cards: result.categoryCards || [],
    });

    return json({
      ok: true,
      reply: result.text,
      sessionId,
      model: result.model,
      commerceId,
      requestId,
      ...(supervisionPayload('ai_handling')
        ? { supervision: supervisionPayload('ai_handling') }
        : {}),
      usage: {
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        toolCalls: result.toolCalls,
        geminiHttpCalls: result.geminiHttpCalls,
      },
      attribution: result.attribution,
      live_budget: liveBudgetPublicSnapshot(),
      cart_actions: result.cartActions,
      product_cards: result.productCards,
      pending_configuration: toolCtx.pendingConfiguration ?? null,
      category_cards: result.categoryCards,
      // Never create orders from chat in Phase 3.
      order_actions: [],
    });
  } catch (err) {
    try {
      await recordChatbotTokensAsync({
        config,
        commerceId,
        supabase,
        model: config.model,
        tokensInput: 0,
        tokensOutput: 0,
        error: true,
      });
    } catch {
      /* ignore secondary quota failure */
    }

    if (err instanceof GeminiChatError) {
      return publicError(err.status, err.code, CHATBOT_UNAVAILABLE_MSG, {
        requestId,
        usage: err.partial,
        attribution: err.attribution,
        live_budget: liveBudgetPublicSnapshot(),
        cart_actions: [],
        product_cards: [],
        category_cards: [],
        order_actions: [],
      });
    }
    return publicError(502, 'chat_failed', CHATBOT_UNAVAILABLE_MSG, {
      requestId,
      live_budget: liveBudgetPublicSnapshot(),
    });
  }
}
