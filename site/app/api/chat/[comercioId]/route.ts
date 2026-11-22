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
      selection: l.selection || {},
    })),
    pendingActions: [],
    pendingCards: [],
  };

  // Local Gemini simulator — zero Google HTTP (Phase 3.1 visual/integration).
  if (isGeminiSimulationEnabled()) {
    const simulated = runSimulatedChat({
      menu,
      commerceId,
      messages,
      cartSnapshot: toolCtx.cartSnapshot,
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
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: simulated.toolCalls,
        geminiHttpCalls: 0,
      },
      cart_actions: simulated.cartActions,
      product_cards: simulated.productCards,
      order_actions: [],
    });
  }

  // Deterministic paths — zero Gemini HTTP (cost control).
  if (body.deterministic_action === 'summarize_cart') {
    const result = runDeterministicCartSummary({ toolCtx, requestId });
    return json({
      ok: true,
      reply: result.text,
      sessionId,
      model: result.model,
      commerceId,
      requestId,
      skipped_llm: true,
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: result.toolCalls,
        geminiHttpCalls: 0,
      },
      attribution: result.attribution,
      cart_actions: result.cartActions,
      product_cards: result.productCards,
      order_actions: [],
    });
  }
  if (body.deterministic_action === 'delivery_info') {
    const result = runDeterministicDeliveryInfo({ toolCtx, requestId });
    return json({
      ok: true,
      reply: result.text,
      sessionId,
      model: result.model,
      commerceId,
      requestId,
      skipped_llm: true,
      usage: {
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls: result.toolCalls,
        geminiHttpCalls: 0,
      },
      attribution: result.attribution,
      cart_actions: [],
      product_cards: [],
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
      currency: comercio.moneda || 'USD',
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

    return json({
      ok: true,
      reply: result.text,
      sessionId,
      model: result.model,
      commerceId,
      requestId,
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
        order_actions: [],
      });
    }
    return publicError(502, 'chat_failed', CHATBOT_UNAVAILABLE_MSG, {
      requestId,
      live_budget: liveBudgetPublicSnapshot(),
    });
  }
}
