import { buildCatalogDigest } from './catalog-digest';
import type { ChatbotConfig } from './config';
import {
  beginRequestCallLedger,
  bumpAttributedToolCalls,
  endRequestCallLedger,
  finalizeAttributedGeminiCall,
  getActiveRequestCallLedger,
  publicCallAttribution,
  recordAttributedGeminiCall,
  type RequestCallLedger,
} from './call-attribution';
import type { ChatCartAction, ChatProductCard } from './cart-proposals';
import {
  assertLiveBudgetAllowsNextCall,
  assertLiveBudgetPreflight,
  configureLiveBudget,
  configureLiveBudgetFromEnv,
  getLiveBudgetSnapshot,
  LiveBudgetExceededError,
  patchLiveBudgetLastCall,
  recordLiveBudgetGeminiHttpCall,
  recordLiveBudgetUsage,
} from './live-budget';
import { buildChatSystemPrompt } from './prompt';
import { buildThinkingConfigForModel } from './thinking';
import {
  CHAT_TOOL_DECLARATIONS,
  collectProductCardsFromToolResult,
  executeChatTool,
  type ChatToolContext,
} from './tools';

let liveBudgetBootstrapped = false;
function ensureLiveBudgetBootstrapped() {
  if (liveBudgetBootstrapped) return;
  configureLiveBudgetFromEnv();
  liveBudgetBootstrapped = true;
}

/** Test helper — re-read env caps on next chat call. */
export function __resetLiveBudgetBootstrapForTests() {
  liveBudgetBootstrapped = false;
}

/** Test helper — disable live hard caps so unit mocks are not blocked by a prior smoke file. */
export function __disableLiveBudgetForTests() {
  liveBudgetBootstrapped = true;
  configureLiveBudget({
    enabled: false,
    persistPath: null,
    resetCounters: true,
  });
}

export type GeminiChatMessage = { role: 'user' | 'assistant'; text: string };

export type GeminiChatResult = {
  text: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  toolCalls: number;
  geminiHttpCalls: number;
  timedOut?: boolean;
  cartActions: ChatCartAction[];
  productCards: ChatProductCard[];
  attribution: ReturnType<typeof publicCallAttribution>;
  skippedLlm?: boolean;
};

export class GeminiChatError extends Error {
  status: number;
  code: string;
  attribution: ReturnType<typeof publicCallAttribution>;
  partial: {
    tokensInput: number;
    tokensOutput: number;
    toolCalls: number;
    geminiHttpCalls: number;
  } | null;

  constructor(
    message: string,
    status = 502,
    code = 'gemini_error',
    extras?: {
      attribution?: ReturnType<typeof publicCallAttribution>;
      partial?: GeminiChatError['partial'];
    },
  ) {
    super(message);
    this.name = 'GeminiChatError';
    this.status = status;
    this.code = code;
    this.attribution = extras?.attribution ?? null;
    this.partial = extras?.partial ?? null;
  }
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
  /** Opaque Gemini 3+ signature — must be echoed verbatim on tool rounds. */
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
};

type GeminiContent = { role: string; parts: GeminiPart[] };

function toGeminiContents(messages: GeminiChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));
}

function ledgerPartialFrom(ledger: RequestCallLedger | null) {
  if (!ledger) return null;
  return {
    tokensInput: ledger.tokensInput,
    tokensOutput: ledger.tokensOutput,
    toolCalls: ledger.toolCalls,
    geminiHttpCalls: ledger.calls.length,
  };
}

async function callGenerateContent(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  kind: 'primary' | 'fallback';
  requestId: string;
}): Promise<Response> {
  try {
    assertLiveBudgetAllowsNextCall();
    assertLiveBudgetPreflight({
      kind: 'text',
      assumedInputTokens: 7000,
      maxOutputTokens: 256,
      isMedia: false,
    });
  } catch (err) {
    if (err instanceof LiveBudgetExceededError) {
      const ledger = getActiveRequestCallLedger();
      throw new GeminiChatError(err.message, 429, err.code, {
        attribution: publicCallAttribution(ledger),
        partial: ledgerPartialFrom(ledger),
      });
    }
    throw err;
  }

  recordAttributedGeminiCall({
    kind: params.kind,
    model: params.model,
    outcome: 'unknown',
  });
  const ledger = getActiveRequestCallLedger();
  const seq = ledger?.calls.length || 0;
  recordLiveBudgetGeminiHttpCall({
    requestId: params.requestId,
    seq,
    kind: params.kind,
    model: params.model,
    outcome: 'pending',
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });
  } catch (err) {
    const outcome =
      err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network';
    finalizeAttributedGeminiCall({ outcome });
    patchLiveBudgetLastCall({
      requestId: params.requestId,
      outcome,
    });
    if (outcome === 'timeout') {
      throw new GeminiChatError('Gemini timeout', 504, 'gemini_timeout', {
        attribution: publicCallAttribution(getActiveRequestCallLedger()),
        partial: ledgerPartialFrom(getActiveRequestCallLedger()),
      });
    }
    throw new GeminiChatError('Gemini network error', 502, 'gemini_network', {
      attribution: publicCallAttribution(getActiveRequestCallLedger()),
      partial: ledgerPartialFrom(getActiveRequestCallLedger()),
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractUsage(json: any): { in: number; out: number } {
  const u = json?.usageMetadata ?? {};
  return {
    in: Number(u.promptTokenCount || 0) || 0,
    out: Number(u.candidatesTokenCount || 0) || 0,
  };
}

function extractModelText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p: GeminiPart) => p.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractFunctionCalls(json: any): Array<{ name: string; args: Record<string, unknown> }> {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const p of parts) {
    if (p.functionCall?.name) {
      calls.push({
        name: p.functionCall.name,
        args: (p.functionCall.args ?? {}) as Record<string, unknown>,
      });
    }
  }
  return calls;
}

export async function runChatWithGemini(params: {
  config: ChatbotConfig;
  toolCtx: ChatToolContext;
  businessName: string;
  currency?: string | null;
  messages: GeminiChatMessage[];
  requestId: string;
}): Promise<GeminiChatResult> {
  const { config, toolCtx, messages, requestId } = params;
  ensureLiveBudgetBootstrapped();
  beginRequestCallLedger(requestId);

  if (!config.geminiApiKey) {
    endRequestCallLedger();
    throw new GeminiChatError('GEMINI_API_KEY missing', 503, 'gemini_unconfigured');
  }

  const systemInstruction = {
    parts: [
      {
        text: buildChatSystemPrompt({
          businessName: params.businessName,
          currency: params.currency,
          catalogDigest: buildCatalogDigest(params.toolCtx.menu),
        }),
      },
    ],
  };

  const tools = [
    {
      functionDeclarations: CHAT_TOOL_DECLARATIONS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];

  const contents: GeminiContent[] = toGeminiContents(
    messages.slice(-config.maxHistoryMessages),
  );

  let model = config.model;
  let tokensInput = 0;
  let tokensOutput = 0;
  let toolCalls = 0;
  let geminiHttpCalls = 0;
  toolCtx.pendingActions = toolCtx.pendingActions || [];
  toolCtx.pendingCards = toolCtx.pendingCards || [];

  function bodyForModel(activeModel: string) {
    const id = activeModel.trim().toLowerCase();
    // Gemini 3 docs: keep temperature at default 1.0; lower values can degrade tool use.
    const temperature =
      id.startsWith('gemini-3') || id.startsWith('gemini-4') ? 1.0 : 0.4;
    return {
      systemInstruction,
      tools,
      generationConfig: {
        temperature,
        maxOutputTokens: config.maxOutputTokens,
        thinkingConfig: buildThinkingConfigForModel(activeModel),
      },
    };
  }

  function fail(err: GeminiChatError): never {
    err.attribution =
      err.attribution ?? publicCallAttribution(getActiveRequestCallLedger());
    err.partial =
      err.partial ?? ledgerPartialFrom(getActiveRequestCallLedger());
    endRequestCallLedger();
    throw err;
  }

  try {
    for (let round = 0; round <= config.maxToolRounds; round++) {
      let res = await callGenerateContent({
        apiKey: config.geminiApiKey,
        model,
        timeoutMs: config.timeoutMs,
        body: { ...bodyForModel(model), contents },
        kind: 'primary',
        requestId,
      });
      geminiHttpCalls += 1;

      // Fallback only on model-unavailable style errors — never escalate to a pricier model.
      if (
        !res.ok &&
        (res.status === 404 || res.status === 400) &&
        model !== config.modelFallback
      ) {
        finalizeAttributedGeminiCall({
          outcome: 'http_error',
          httpStatus: res.status,
        });
        patchLiveBudgetLastCall({
          requestId,
          outcome: 'http_error',
          httpStatus: res.status,
        });
        model = config.modelFallback;
        res = await callGenerateContent({
          apiKey: config.geminiApiKey,
          model,
          timeoutMs: config.timeoutMs,
          body: { ...bodyForModel(model), contents },
          kind: 'fallback',
          requestId,
        });
        geminiHttpCalls += 1;
      }

      if (res.status === 429) {
        finalizeAttributedGeminiCall({ outcome: 'rate_limited', httpStatus: 429 });
        patchLiveBudgetLastCall({
          requestId,
          outcome: 'rate_limited',
          httpStatus: 429,
        });
        fail(
          new GeminiChatError('Gemini rate limited', 429, 'gemini_rate_limited'),
        );
      }
      if (res.status === 503) {
        finalizeAttributedGeminiCall({ outcome: 'unavailable', httpStatus: 503 });
        patchLiveBudgetLastCall({
          requestId,
          outcome: 'unavailable',
          httpStatus: 503,
        });
        fail(
          new GeminiChatError('Gemini unavailable', 503, 'gemini_unavailable'),
        );
      }
      if (!res.ok) {
        finalizeAttributedGeminiCall({
          outcome: 'http_error',
          httpStatus: res.status,
        });
        patchLiveBudgetLastCall({
          requestId,
          outcome: 'http_error',
          httpStatus: res.status,
        });
        fail(
          new GeminiChatError(`Gemini HTTP ${res.status}`, 502, 'gemini_http'),
        );
      }

      const json = await res.json();
      const usage = extractUsage(json);
      tokensInput += usage.in;
      tokensOutput += usage.out;
      finalizeAttributedGeminiCall({
        outcome: 'ok',
        httpStatus: 200,
        tokensIn: usage.in,
        tokensOut: usage.out,
      });
      patchLiveBudgetLastCall({
        requestId,
        outcome: 'ok',
        httpStatus: 200,
        tokensIn: usage.in,
        tokensOut: usage.out,
      });
      try {
        recordLiveBudgetUsage(usage.in, usage.out);
      } catch (err) {
        if (err instanceof LiveBudgetExceededError) {
          fail(new GeminiChatError(err.message, 429, err.code));
        }
        throw err;
      }

      const calls = extractFunctionCalls(json);
      if (calls.length === 0) {
        const text = extractModelText(json);
        if (!text) {
          fail(new GeminiChatError('Empty Gemini response', 502, 'gemini_empty'));
        }
        const ledger = endRequestCallLedger();
        return {
          text,
          model,
          tokensInput,
          tokensOutput,
          toolCalls,
          geminiHttpCalls,
          cartActions: [...(toolCtx.pendingActions || [])],
          productCards: dedupeCards(toolCtx.pendingCards || []),
          attribution: publicCallAttribution(ledger),
        };
      }

      const lastToolRound = round >= config.maxToolRounds;

      // Echo the full model content parts (including thoughtSignature) — required for Gemini 3.
      const modelParts = (json?.candidates?.[0]?.content?.parts ?? []) as GeminiPart[];
      contents.push({
        role: 'model',
        parts: modelParts.length
          ? modelParts
          : calls.map((c) => ({
              functionCall: { name: c.name, args: c.args },
            })),
      });

      const responseParts: GeminiPart[] = [];
      for (const call of calls) {
        toolCalls += 1;
        bumpAttributedToolCalls(1);
        let result: unknown;
        try {
          result = executeChatTool(toolCtx, call.name, call.args || {});
          for (const card of collectProductCardsFromToolResult(
            toolCtx.menu,
            call.name,
            result,
          )) {
            toolCtx.pendingCards = toolCtx.pendingCards || [];
            toolCtx.pendingCards.push(card);
          }
        } catch (err) {
          result = {
            error: err instanceof Error ? err.message : 'tool_error',
          };
        }
        responseParts.push({
          functionResponse: {
            name: call.name,
            response: result,
          },
        });
      }
      contents.push({ role: 'user', parts: responseParts });

      if (lastToolRound) {
        // Soft recovery: execute this final tool batch, then return any proposals
        // instead of discarding them with a bare tool_round_limit 502.
        const pending = toolCtx.pendingActions || [];
        if (pending.length > 0) {
          const ledger = endRequestCallLedger();
          return {
            text:
              'Listo: preparé propuestas para confirmar en pantalla. Si algo del pedido no está en el menú, lo revisamos después.',
            model,
            tokensInput,
            tokensOutput,
            toolCalls,
            geminiHttpCalls,
            cartActions: [...pending],
            productCards: dedupeCards(toolCtx.pendingCards || []),
            attribution: publicCallAttribution(ledger),
          };
        }
        break;
      }
    }

    fail(new GeminiChatError('Too many tool rounds', 502, 'tool_round_limit'));
  } catch (err) {
    if (err instanceof GeminiChatError) throw err;
    endRequestCallLedger();
    throw err;
  }
}

function dedupeCards(cards: ChatProductCard[]): ChatProductCard[] {
  const seen = new Set<string>();
  const out: ChatProductCard[] = [];
  for (const c of cards) {
    if (seen.has(c.product_id)) continue;
    seen.add(c.product_id);
    out.push(c);
  }
  return out.slice(0, 8);
}

/** Deterministic cart summary without Gemini (client intent button / structured). */
export function runDeterministicCartSummary(params: {
  toolCtx: ChatToolContext;
  requestId: string;
}): GeminiChatResult {
  beginRequestCallLedger(params.requestId);
  const snap = executeChatTool(params.toolCtx, 'get_cart_snapshot', {}) as {
    subtotal_label?: string;
    item_count?: number;
    lines?: Array<{ label: string; line_total: number }>;
    currency?: string;
  };
  const lines = snap.lines || [];
  const text =
    lines.length === 0
      ? 'Tu carrito está vacío. Puedes pedir recomendaciones o abrir el menú.'
      : `Llevas ${snap.item_count} ítem(s). Subtotal ${snap.subtotal_label}.\n${lines
          .map((l) => `• ${l.label}`)
          .join('\n')}\n¿Quieres agregar algo más o continuar con el pago?`;
  const ledger = endRequestCallLedger();
  return {
    text,
    model: 'deterministic',
    tokensInput: 0,
    tokensOutput: 0,
    toolCalls: 1,
    geminiHttpCalls: 0,
    cartActions:
      lines.length > 0
        ? [
            {
              type: 'open_checkout',
              requires_confirmation: true,
              proposal_id: `checkout_det_${Date.now().toString(36)}`,
              catalog_fingerprint: null,
              label: 'Continuar con mi pedido',
            },
          ]
        : [],
    productCards: [],
    attribution: publicCallAttribution(ledger),
    skippedLlm: true,
  };
}

/** Deterministic delivery info without Gemini. */
export function runDeterministicDeliveryInfo(params: {
  toolCtx: ChatToolContext;
  requestId: string;
}): GeminiChatResult {
  beginRequestCallLedger(params.requestId);
  const d = executeChatTool(params.toolCtx, 'get_delivery_conditions', {}) as {
    delivery_enabled?: boolean;
    exact_fee_label?: string | null;
    fee_overview?: string[];
    requires_customer_address?: boolean;
    tariff_currency?: string;
    menu_currency?: string;
    warning?: string;
    note?: string;
  };
  let text: string;
  if (!d.delivery_enabled) {
    text =
      'Por ahora no tenemos delivery habilitado en el menú. Puedes elegir para llevar o comer aquí.';
  } else if (d.exact_fee_label) {
    text = `Sí, tenemos delivery. Tarifa verificada: ${d.exact_fee_label}. ${d.note || ''}`.trim();
  } else {
    const overview = (d.fee_overview || []).slice(0, 5).join('; ');
    text = [
      'Sí, tenemos delivery.',
      overview ? `Referencia de tarifas (${d.tariff_currency}): ${overview}.` : null,
      d.requires_customer_address
        ? 'El cargo exacto depende de tu dirección/zona y se confirma en el checkout.'
        : null,
      d.menu_currency &&
      d.tariff_currency &&
      d.menu_currency !== d.tariff_currency
        ? `Menú en ${d.menu_currency}; delivery en ${d.tariff_currency} (no se suman directamente).`
        : null,
    ]
      .filter(Boolean)
      .join(' ');
  }
  const ledger = endRequestCallLedger();
  return {
    text,
    model: 'deterministic',
    tokensInput: 0,
    tokensOutput: 0,
    toolCalls: 1,
    geminiHttpCalls: 0,
    cartActions: [],
    productCards: [],
    attribution: publicCallAttribution(ledger),
    skippedLlm: true,
  };
}

export function liveBudgetPublicSnapshot() {
  const s = getLiveBudgetSnapshot();
  if (!s.enabled) return null;
  return {
    geminiHttpCalls: s.geminiHttpCalls,
    maxGeminiHttpCalls: s.maxGeminiHttpCalls,
    estimatedCostUsd: s.estimatedCostUsd,
    maxEstimatedCostUsd: s.maxEstimatedCostUsd,
    recentCalls: s.recentCalls.slice(-8),
  };
}
