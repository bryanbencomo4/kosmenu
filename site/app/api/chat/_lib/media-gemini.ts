/**
 * Billable multimodal helpers for chat media (STT / image / PDF).
 * Always goes through live-budget preflight + counters (errors count).
 */
import { createRequestId } from './schema';
import {
  assertLiveBudgetPreflight,
  getLiveBudgetSnapshot,
  LiveBudgetExceededError,
  patchLiveBudgetLastCall,
  recordLiveBudgetMediaHttpCall,
  recordLiveBudgetUsage,
  configureLiveBudgetFromEnv,
} from './live-budget';
import { CHATBOT_PRIMARY_MODEL } from './models';

let bootstrapped = false;
function ensureBudget() {
  if (bootstrapped) return;
  configureLiveBudgetFromEnv();
  bootstrapped = true;
}

function extractText(json: unknown): string {
  const parts =
    (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> })
      ?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => p && !p.thought && typeof p.text === 'string')
    .map((p) => p.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractUsage(json: unknown): { in: number; out: number } {
  const u = (json as { usageMetadata?: Record<string, number> })?.usageMetadata ?? {};
  return {
    in: Number(u.promptTokenCount || 0) || 0,
    out: Number(u.candidatesTokenCount || 0) || 0,
  };
}

export type MediaGeminiResult = {
  ok: true;
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  requestId: string;
  geminiHttpCalls: number;
};

export type MediaGeminiFailure = {
  ok: false;
  error: string;
  message: string;
  requestId: string;
  geminiHttpCalls?: number;
};

export async function runMediaGemini(params: {
  apiKey: string;
  model?: string;
  mime: string;
  bytes: Buffer;
  kind: 'audio' | 'image' | 'file';
  prompt: string;
  maxOutputTokens?: number;
  audioDurationSec?: number;
  timeoutMs?: number;
}): Promise<MediaGeminiResult | MediaGeminiFailure> {
  ensureBudget();
  const requestId = createRequestId();
  const model = (params.model || process.env.CHATBOT_GEMINI_MODEL || CHATBOT_PRIMARY_MODEL).trim();
  const maxOut = params.maxOutputTokens ?? 256;

  try {
    assertLiveBudgetPreflight({
      kind: params.kind === 'audio' ? 'audio' : params.kind === 'image' ? 'image' : 'file',
      assumedInputTokens: params.kind === 'audio' ? 200 : params.kind === 'image' ? 2500 : 4000,
      audioDurationSec: params.audioDurationSec ?? 45,
      maxOutputTokens: maxOut,
      isMedia: true,
    });
  } catch (err) {
    if (err instanceof LiveBudgetExceededError) {
      return {
        ok: false,
        error: err.code,
        message: err.message,
        requestId,
        geminiHttpCalls: getLiveBudgetSnapshot().geminiHttpCalls,
      };
    }
    throw err;
  }

  recordLiveBudgetMediaHttpCall({
    requestId,
    kind: `media_${params.kind}`,
    model,
    outcome: 'pending',
  });

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: params.prompt },
          {
            inline_data: {
              mime_type: params.mime,
              data: params.bytes.toString('base64'),
            },
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxOut,
      temperature: 0.2,
    },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(params.apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 25_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const outcome =
      err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network';
    patchLiveBudgetLastCall({ requestId, outcome });
    return {
      ok: false,
      error: outcome === 'timeout' ? 'gemini_timeout' : 'gemini_network',
      message: 'No se pudo completar el análisis multimedia.',
      requestId,
      geminiHttpCalls: getLiveBudgetSnapshot().geminiHttpCalls,
    };
  } finally {
    clearTimeout(timer);
  }

  const json = await res.json().catch(() => null);
  const usage = extractUsage(json);
  const snapBefore = getLiveBudgetSnapshot().estimatedCostUsd;

  try {
    // Conservative: if kind=audio, attribute all prompt tokens at audio rate when unknown split.
    recordLiveBudgetUsage(usage.in, usage.out, {
      isMedia: true,
      audioInputTokens: params.kind === 'audio' ? usage.in : 0,
    });
  } catch (err) {
    patchLiveBudgetLastCall({
      requestId,
      outcome: 'cost_cap',
      httpStatus: res.status,
      tokensIn: usage.in,
      tokensOut: usage.out,
    });
    if (err instanceof LiveBudgetExceededError) {
      return {
        ok: false,
        error: err.code,
        message: err.message,
        requestId,
        geminiHttpCalls: getLiveBudgetSnapshot().geminiHttpCalls,
      };
    }
    throw err;
  }

  const costDelta = getLiveBudgetSnapshot().estimatedCostUsd - snapBefore;

  if (!res.ok) {
    patchLiveBudgetLastCall({
      requestId,
      outcome: 'http_error',
      httpStatus: res.status,
      tokensIn: usage.in,
      tokensOut: usage.out,
    });
    return {
      ok: false,
      error: 'gemini_http_error',
      message: `Gemini media HTTP ${res.status}`,
      requestId,
      geminiHttpCalls: getLiveBudgetSnapshot().geminiHttpCalls,
    };
  }

  const text = extractText(json);
  patchLiveBudgetLastCall({
    requestId,
    outcome: text ? 'ok' : 'empty',
    httpStatus: res.status,
    tokensIn: usage.in,
    tokensOut: usage.out,
  });

  if (!text) {
    return {
      ok: false,
      error: 'empty_media_response',
      message: 'Gemini no devolvió texto para el adjunto.',
      requestId,
      geminiHttpCalls: getLiveBudgetSnapshot().geminiHttpCalls,
    };
  }

  return {
    ok: true,
    text,
    model,
    tokensIn: usage.in,
    tokensOut: usage.out,
    estimatedCostUsd: costDelta,
    requestId,
    geminiHttpCalls: getLiveBudgetSnapshot().geminiHttpCalls,
  };
}
