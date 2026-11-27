/**
 * Master Gemini agent — live path for pilot.
 * Requires PLATFORM_WA_MASTER_ALLOW_GEMINI=1 + SIMULATE=0 + GEMINI_API_KEY + quota.
 * Default remains simulate. Hard HTTP budget prevents runaway cost.
 */

import { extractDiscoveryGeminiUsage } from '../../asistente/_lib/gemini-usage';
import { resolveChatbotModelPair } from '../../chat/_lib/models';
import type { WaMasterConfig } from './config';
import type {
  WaMasterDiscoveryCtx,
  WaMasterDiscoveryExecute,
} from './discovery-bridge';
import { formatMemoryForPrompt, WA_MASTER_TURN_CAP } from './memory';
import { PLATFORM_WHAT_IS, formatPublishedPricing } from './knowledge/platform';
import { WA_MASTER_PERSONALITY } from './personality';
import type { WaMasterQuotaStore } from './quota';
import { WaMasterQuotaError, waMasterQuotaMonth } from './quota';
import type { WaMasterIdentity, WaMasterIntent, WaMasterMemory, WaMasterSpecialist } from './types';

export type WaMasterAgentMode = 'simulate' | 'live_refused' | 'live' | 'fallback';

export type WaMasterAgentResult = {
  mode: WaMasterAgentMode;
  suggestedIntents: WaMasterIntent[];
  specialist: WaMasterSpecialist | null;
  naturalPreface: string | null;
  /** When Gemini composed a full user-facing reply (still must not invent facts). */
  composedReply: string | null;
  error?: string;
  tokensInput?: number;
  tokensOutput?: number;
  geminiHttpCalls?: number;
  model?: string;
};

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
};

const MASTER_TOOL_DECLARATIONS = [
  {
    name: 'search_restaurants',
    description: 'Search public restaurant directory by food/query/region.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING' },
        category: { type: 'STRING' },
        region: { type: 'STRING' },
        limit: { type: 'NUMBER' },
      },
    },
  },
  {
    name: 'prepare_restaurant_links',
    description: 'Build public menu URL for a restaurant slug.',
    parameters: {
      type: 'OBJECT',
      properties: { slug: { type: 'STRING' } },
      required: ['slug'],
    },
  },
] as const;

async function callGemini(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<Response> {
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
  } finally {
    clearTimeout(timer);
  }
}

function buildSystemPrompt(
  identity: WaMasterIdentity,
  memory: WaMasterMemory,
  opts?: { omitMemoryPrompt?: boolean; maxTurnsInPrompt?: number },
): string {
  const shops = identity.comercios.map((c) => c.publicName).join(', ') || '—';
  const lines = [
    WA_MASTER_PERSONALITY,
    '',
    'Base de conocimiento (plataforma):',
    PLATFORM_WHAT_IS,
    formatPublishedPricing('https://business.elmenuxfa.com/'),
    '',
    `Contacto: roles=${identity.role}; comercios_señal=${shops}; consumer_signal=${identity.possibleConsumer}; notes=${identity.provenanceNotes.join(',')}`,
    'IMPORTANTE: coincidencia telefónica ≠ autorización para modificar menús.',
    'No inventes restaurantes, precios, planes, ciudad/zona, productos ni acciones completadas.',
    'Nunca asumas la ciudad del usuario. Solo menciona zona si está en HECHOS o en el mensaje actual.',
    'Si te dan HECHOS verificados, responde solo con esos hechos. No agregues locales inventados.',
    'Resuelve en WhatsApp primero. Los asistentes web son ayudantes, no el camino por defecto.',
    'Nunca pidas usuario/contraseña. Panel admin: app.elmenuxfa.com.',
    'Si hay comercios_señal y piden tasa/precios/productos: triaje + escala al asistente del negocio.',
    'Si el mensaje es confuso/typo: “Disculpa, no te entendí. Explícame mejor qué necesitas, porfa.”',
    'Prohibido: “error al escribir”, “ortografía”, “mensaje mal escrito”.',
    'Responde en español breve, natural, sin markdown pesado.',
  ];
  if (!opts?.omitMemoryPrompt) {
    lines.push('', formatMemoryForPrompt(memory, opts?.maxTurnsInPrompt ?? WA_MASTER_TURN_CAP));
  }
  return lines.join('\n');
}

export async function runWaMasterAgentNlu(params: {
  config: WaMasterConfig;
  text: string;
  identity: WaMasterIdentity;
  memory: WaMasterMemory;
  quota: WaMasterQuotaStore;
  maxMonthlyRequests: number;
  forceSimulate?: boolean;
  forceFail?: boolean;
  requestId?: string;
  discoveryCtx?: WaMasterDiscoveryCtx;
  executeDiscovery?: WaMasterDiscoveryExecute;
  /** When false, no function calling — polish / soft replies only. */
  enableTools?: boolean;
  /** Skip prior-turn memory dump (use for facts-only polish). */
  omitMemoryPrompt?: boolean;
  maxHttpCalls?: number;
  timeoutMs?: number;
}): Promise<WaMasterAgentResult> {
  const { config, text, identity, memory, quota, maxMonthlyRequests } = params;

  if (params.forceFail) {
    return {
      mode: 'fallback',
      suggestedIntents: [],
      specialist: null,
      naturalPreface: null,
      composedReply: null,
      error: 'gemini_forced_fail',
      geminiHttpCalls: 0,
    };
  }

  const wantLive = config.allowGemini && !params.forceSimulate && !config.simulateAgent;
  if (!wantLive) {
    return {
      mode: 'simulate',
      suggestedIntents: [],
      specialist: null,
      naturalPreface: null,
      composedReply: null,
      geminiHttpCalls: 0,
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return {
      mode: 'live_refused',
      suggestedIntents: [],
      specialist: null,
      naturalPreface: null,
      composedReply: null,
      error: 'missing_gemini_api_key',
      geminiHttpCalls: 0,
    };
  }

  const requestId = params.requestId || `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const period = waMasterQuotaMonth();
  try {
    await quota.reserve(period, maxMonthlyRequests);
  } catch (e) {
    const code = e instanceof WaMasterQuotaError ? e.code : 'quota_error';
    return {
      mode: 'live_refused',
      suggestedIntents: [],
      specialist: null,
      naturalPreface: null,
      composedReply: null,
      error: code,
      geminiHttpCalls: 0,
    };
  }

  const models = resolveChatbotModelPair({
    primaryRaw: process.env.PLATFORM_WA_MASTER_GEMINI_MODEL || process.env.CHATBOT_GEMINI_MODEL,
    fallbackRaw:
      process.env.PLATFORM_WA_MASTER_GEMINI_MODEL_FALLBACK ||
      process.env.CHATBOT_GEMINI_MODEL_FALLBACK,
  });
  let modelUsed = models.model;
  const enableTools = Boolean(params.enableTools && params.executeDiscovery);
  const maxHttp = Math.max(1, Math.min(params.maxHttpCalls ?? (enableTools ? 3 : 1), 4));
  const timeoutMs = params.timeoutMs ?? 12_000;
  let geminiHttpCalls = 0;
  let tokensInput = 0;
  let tokensOutput = 0;

  const contents: Array<{ role: string; parts: GeminiPart[] }> = [
    { role: 'user', parts: [{ text }] },
  ];
  const tools = enableTools
    ? [
        {
          functionDeclarations: MASTER_TOOL_DECLARATIONS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ]
    : undefined;

  try {
    for (let round = 0; round < maxHttp; round += 1) {
      if (geminiHttpCalls >= maxHttp) break;
      geminiHttpCalls += 1;

      const body: Record<string, unknown> = {
        systemInstruction: {
          parts: [
            {
              text: buildSystemPrompt(identity, memory, {
                omitMemoryPrompt: Boolean(params.omitMemoryPrompt),
                maxTurnsInPrompt: config.maxTurnsInPrompt,
              }),
            },
          ],
        },
        contents,
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.4,
        },
      };
      if (tools) body.tools = tools;

      let res: Response;
      try {
        res = await callGemini({
          apiKey,
          model: modelUsed,
          timeoutMs,
          body,
        });
      } catch {
        if (modelUsed !== models.modelFallback) {
          modelUsed = models.modelFallback;
          continue;
        }
        await quota.recordTokens(period, tokensInput, tokensOutput, requestId);
        return {
          mode: 'fallback',
          suggestedIntents: [],
          specialist: null,
          naturalPreface: null,
          composedReply: null,
          error: 'gemini_network_error',
          tokensInput,
          tokensOutput,
          geminiHttpCalls,
          model: modelUsed,
        };
      }

      if (!res.ok) {
        if (modelUsed !== models.modelFallback) {
          modelUsed = models.modelFallback;
          continue;
        }
        await quota.recordTokens(period, tokensInput, tokensOutput, requestId);
        return {
          mode: 'fallback',
          suggestedIntents: [],
          specialist: null,
          naturalPreface: null,
          composedReply: null,
          error: `gemini_http_${res.status}`,
          tokensInput,
          tokensOutput,
          geminiHttpCalls,
          model: modelUsed,
        };
      }

      const json = (await res.json()) as {
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
      };
      const usage = extractDiscoveryGeminiUsage(json);
      tokensInput += usage.in;
      tokensOutput += usage.out;

      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const fnCalls = enableTools ? parts.filter((p) => p.functionCall?.name) : [];
      if (!fnCalls.length) {
        const textOut = parts
          .map((p) => p.text || '')
          .filter(Boolean)
          .join('\n')
          .trim();
        await quota.recordTokens(period, tokensInput, tokensOutput, requestId);
        return {
          mode: 'live',
          suggestedIntents: [],
          specialist: null,
          naturalPreface: textOut || null,
          composedReply: textOut || null,
          tokensInput,
          tokensOutput,
          geminiHttpCalls,
          model: modelUsed,
        };
      }

      contents.push({ role: 'model', parts });
      const responseParts: GeminiPart[] = [];
      const exec = params.executeDiscovery!;
      const ctx = params.discoveryCtx || { pageSize: 5 };
      for (const part of fnCalls) {
        const name = part.functionCall!.name;
        const args = (part.functionCall!.args || {}) as Record<string, unknown>;
        try {
          const result = await exec(name, args, ctx);
          responseParts.push({ functionResponse: { name, response: result } });
        } catch (err) {
          responseParts.push({
            functionResponse: {
              name,
              response: {
                ok: false,
                error: err instanceof Error ? err.message.slice(0, 160) : 'tool_failed',
              },
            },
          });
        }
      }
      contents.push({ role: 'user', parts: responseParts });
    }

    await quota.recordTokens(period, tokensInput, tokensOutput, requestId);
    return {
      mode: 'fallback',
      suggestedIntents: [],
      specialist: null,
      naturalPreface: null,
      composedReply: null,
      error: 'gemini_tool_rounds_exhausted',
      tokensInput,
      tokensOutput,
      geminiHttpCalls,
      model: modelUsed,
    };
  } catch (err) {
    return {
      mode: 'fallback',
      suggestedIntents: [],
      specialist: null,
      naturalPreface: null,
      composedReply: null,
      error: err instanceof Error ? err.message.slice(0, 120) : 'gemini_unknown_error',
      tokensInput,
      tokensOutput,
      geminiHttpCalls,
      model: modelUsed,
    };
  }
}
