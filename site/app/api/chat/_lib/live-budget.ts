/**
 * Optional process-wide hard caps for controlled live Gemini smokes.
 *
 * Enabled only when CHATBOT_LIVE_HARD_CAPS=1 (local smoke). Never enable in production.
 * Counts EVERY HTTP call to generateContent (primary, fallback, tool rounds, retries).
 *
 * Persistence: when enabled, counters are stored under CHATBOT_LIVE_BUDGET_FILE
 * (default: <cwd>/.data/chatbot-live-budget.json) so a Next restart does NOT reset
 * an in-progress authorized smoke. Reset with CHATBOT_LIVE_BUDGET_RESET=1 once.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LiveBudgetCallNote = {
  requestId: string;
  seq: number;
  kind: string;
  model: string;
  outcome: string;
  httpStatus: number | null;
  tokensIn: number;
  tokensOut: number;
  at: string;
};

export type LiveBudgetState = {
  enabled: boolean;
  maxGeminiHttpCalls: number;
  maxEstimatedCostUsd: number;
  geminiHttpCalls: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  /** Cost from API-reported usage (when available). */
  reportedCostUsd: number;
  priceInputPer1M: number;
  priceAudioInputPer1M: number;
  priceOutputPer1M: number;
  /** Media sub-cap (included in global). */
  maxMediaHttpCalls: number;
  maxMediaCostUsd: number;
  mediaHttpCalls: number;
  mediaEstimatedCostUsd: number;
  persistPath: string | null;
  /** Ring buffer of recent attributed calls (no secrets). */
  recentCalls: LiveBudgetCallNote[];
  /**
   * Honest caveat: Gemini bills after accept; we stop via preflight + post-usage.
   * One in-flight call may still complete after we decide to stop.
   */
  hardGuarantee: false;
};

const MAX_RECENT_CALLS = 32;

const state: LiveBudgetState = {
  enabled: false,
  maxGeminiHttpCalls: 6,
  maxEstimatedCostUsd: 0.02,
  geminiHttpCalls: 0,
  tokensInput: 0,
  tokensOutput: 0,
  estimatedCostUsd: 0,
  reportedCostUsd: 0,
  priceInputPer1M: 0.25,
  priceAudioInputPer1M: 0.5,
  priceOutputPer1M: 1.5,
  maxMediaHttpCalls: 6,
  maxMediaCostUsd: 0.03,
  mediaHttpCalls: 0,
  mediaEstimatedCostUsd: 0,
  persistPath: null,
  recentCalls: [],
  hardGuarantee: false,
};

export class LiveBudgetExceededError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'LiveBudgetExceededError';
    this.code = code;
  }
}

function defaultPersistPath() {
  return join(process.cwd(), '.data', 'chatbot-live-budget.json');
}

function persistLiveBudget() {
  if (!state.enabled || !state.persistPath) return;
  try {
    const dir = dirname(state.persistPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload = {
      geminiHttpCalls: state.geminiHttpCalls,
      tokensInput: state.tokensInput,
      tokensOutput: state.tokensOutput,
      estimatedCostUsd: state.estimatedCostUsd,
      reportedCostUsd: state.reportedCostUsd,
      maxGeminiHttpCalls: state.maxGeminiHttpCalls,
      maxEstimatedCostUsd: state.maxEstimatedCostUsd,
      mediaHttpCalls: state.mediaHttpCalls,
      mediaEstimatedCostUsd: state.mediaEstimatedCostUsd,
      maxMediaHttpCalls: state.maxMediaHttpCalls,
      maxMediaCostUsd: state.maxMediaCostUsd,
      recentCalls: state.recentCalls.slice(-MAX_RECENT_CALLS),
      hardGuarantee: false,
      updatedAt: new Date().toISOString(),
    };
    const tmp = `${state.persistPath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
    renameSync(tmp, state.persistPath);
  } catch {
    /* best-effort */
  }
}

function loadPersistedCounters(path: string): Partial<LiveBudgetState> | null {
  try {
    if (!existsSync(path)) return null;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const recent = Array.isArray(raw.recentCalls)
      ? (raw.recentCalls as LiveBudgetCallNote[]).filter(
          (c) => c && typeof c === 'object' && typeof c.requestId === 'string',
        )
      : [];
    return {
      geminiHttpCalls: Number(raw.geminiHttpCalls) || 0,
      tokensInput: Number(raw.tokensInput) || 0,
      tokensOutput: Number(raw.tokensOutput) || 0,
      estimatedCostUsd: Number(raw.estimatedCostUsd) || 0,
      recentCalls: recent.slice(-MAX_RECENT_CALLS),
    };
  } catch {
    return null;
  }
}

export function configureLiveBudget(params: {
  enabled: boolean;
  maxGeminiHttpCalls?: number;
  maxEstimatedCostUsd?: number;
  priceInputPer1M?: number;
  priceAudioInputPer1M?: number;
  priceOutputPer1M?: number;
  maxMediaHttpCalls?: number;
  maxMediaCostUsd?: number;
  resetCounters?: boolean;
  persistPath?: string | null;
  /** When true, load counters from persistPath if present (unless resetCounters). */
  hydrateFromDisk?: boolean;
}) {
  state.enabled = params.enabled;
  if (params.maxGeminiHttpCalls != null) {
    state.maxGeminiHttpCalls = Math.max(1, Math.floor(params.maxGeminiHttpCalls));
  }
  if (params.maxEstimatedCostUsd != null) {
    state.maxEstimatedCostUsd = Math.max(0, params.maxEstimatedCostUsd);
  }
  if (params.priceInputPer1M != null) state.priceInputPer1M = params.priceInputPer1M;
  if (params.priceAudioInputPer1M != null) {
    state.priceAudioInputPer1M = params.priceAudioInputPer1M;
  }
  if (params.priceOutputPer1M != null) state.priceOutputPer1M = params.priceOutputPer1M;
  if (params.maxMediaHttpCalls != null) {
    state.maxMediaHttpCalls = Math.max(0, Math.floor(params.maxMediaHttpCalls));
  }
  if (params.maxMediaCostUsd != null) {
    state.maxMediaCostUsd = Math.max(0, params.maxMediaCostUsd);
  }
  if (params.persistPath !== undefined) state.persistPath = params.persistPath;

  if (params.resetCounters) {
    state.geminiHttpCalls = 0;
    state.tokensInput = 0;
    state.tokensOutput = 0;
    state.estimatedCostUsd = 0;
    state.reportedCostUsd = 0;
    state.mediaHttpCalls = 0;
    state.mediaEstimatedCostUsd = 0;
    state.recentCalls = [];
    persistLiveBudget();
    return;
  }

  if (
    params.hydrateFromDisk &&
    state.enabled &&
    state.persistPath &&
    existsSync(state.persistPath)
  ) {
    const loaded = loadPersistedCounters(state.persistPath);
    if (loaded) {
      state.geminiHttpCalls = loaded.geminiHttpCalls ?? 0;
      state.tokensInput = loaded.tokensInput ?? 0;
      state.tokensOutput = loaded.tokensOutput ?? 0;
      state.estimatedCostUsd = loaded.estimatedCostUsd ?? 0;
      const raw = loaded as Partial<LiveBudgetState>;
      state.reportedCostUsd = Number(raw.reportedCostUsd) || 0;
      state.mediaHttpCalls = Number(raw.mediaHttpCalls) || 0;
      state.mediaEstimatedCostUsd = Number(raw.mediaEstimatedCostUsd) || 0;
      state.recentCalls = Array.isArray((loaded as { recentCalls?: unknown }).recentCalls)
        ? ((loaded as { recentCalls: LiveBudgetCallNote[] }).recentCalls || []).slice(
            -MAX_RECENT_CALLS,
          )
        : [];
    }
  }
}

export function configureLiveBudgetFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const enabled =
    (env.CHATBOT_LIVE_HARD_CAPS ?? '').trim() === '1' ||
    (env.CHATBOT_LIVE_HARD_CAPS ?? '').trim().toLowerCase() === 'true';
  const maxCalls = Number(env.CHATBOT_LIVE_MAX_GEMINI_CALLS || 6);
  const maxCost = Number(env.CHATBOT_LIVE_MAX_COST_USD || 0.02);
  const priceIn = Number(env.CHATBOT_PRICE_INPUT_PER_1M || 0.25);
  const priceAudio = Number(env.CHATBOT_PRICE_AUDIO_INPUT_PER_1M || 0.5);
  const priceOut = Number(env.CHATBOT_PRICE_OUTPUT_PER_1M || 1.5);
  const maxMediaCalls = Number(env.CHATBOT_LIVE_MAX_MEDIA_CALLS || 6);
  const maxMediaCost = Number(env.CHATBOT_LIVE_MAX_MEDIA_COST_USD || 0.03);
  const reset =
    (env.CHATBOT_LIVE_BUDGET_RESET ?? '').trim() === '1' ||
    (env.CHATBOT_LIVE_BUDGET_RESET ?? '').trim().toLowerCase() === 'true';
  const persistPath =
    (env.CHATBOT_LIVE_BUDGET_FILE ?? '').trim() || defaultPersistPath();

  configureLiveBudget({
    enabled,
    maxGeminiHttpCalls: Number.isFinite(maxCalls) ? maxCalls : 6,
    maxEstimatedCostUsd: Number.isFinite(maxCost) ? maxCost : 0.02,
    priceInputPer1M: Number.isFinite(priceIn) ? priceIn : 0.25,
    priceAudioInputPer1M: Number.isFinite(priceAudio) ? priceAudio : 0.5,
    priceOutputPer1M: Number.isFinite(priceOut) ? priceOut : 1.5,
    maxMediaHttpCalls: Number.isFinite(maxMediaCalls) ? maxMediaCalls : 6,
    maxMediaCostUsd: Number.isFinite(maxMediaCost) ? maxMediaCost : 0.03,
    persistPath: enabled ? persistPath : null,
    resetCounters: reset,
    hydrateFromDisk: enabled && !reset,
  });
}

export function getLiveBudgetSnapshot(): LiveBudgetState {
  return { ...state };
}

export function assertLiveBudgetAllowsNextCall() {
  if (!state.enabled) return;
  if (state.geminiHttpCalls >= state.maxGeminiHttpCalls) {
    throw new LiveBudgetExceededError(
      `Live Gemini HTTP call cap reached (${state.maxGeminiHttpCalls})`,
      'live_gemini_call_cap',
    );
  }
  if (state.estimatedCostUsd >= state.maxEstimatedCostUsd) {
    throw new LiveBudgetExceededError(
      `Live Gemini cost cap reached ($${state.maxEstimatedCostUsd})`,
      'live_gemini_cost_cap',
    );
  }
}

export type LiveBudgetPreflightKind = 'text' | 'audio' | 'image' | 'file';

/**
 * Conservative preflight BEFORE issuing generateContent.
 * Stops early if this call would push past remaining budget (with headroom).
 * Does not claim a hard $ guarantee — Gemini bills after accept.
 */
export function assertLiveBudgetPreflight(params: {
  kind: LiveBudgetPreflightKind;
  /** Assumed input tokens (text/image/pdf). */
  assumedInputTokens?: number;
  /** Audio duration seconds (for audio kind). */
  audioDurationSec?: number;
  /** Max output tokens for this call. */
  maxOutputTokens?: number;
  isMedia?: boolean;
}) {
  if (!state.enabled) return;

  assertLiveBudgetAllowsNextCall();

  const isMedia = Boolean(params.isMedia || params.kind !== 'text');
  if (isMedia) {
    if (state.mediaHttpCalls >= state.maxMediaHttpCalls) {
      throw new LiveBudgetExceededError(
        `Live media HTTP call cap reached (${state.maxMediaHttpCalls})`,
        'live_media_call_cap',
      );
    }
    if (state.mediaEstimatedCostUsd >= state.maxMediaCostUsd) {
      throw new LiveBudgetExceededError(
        `Live media cost cap reached ($${state.maxMediaCostUsd})`,
        'live_media_cost_cap',
      );
    }
  }

  const outTok = Math.max(1, params.maxOutputTokens ?? 256);
  let inCost = 0;
  if (params.kind === 'audio') {
    const secs = Math.max(1, Math.ceil(params.audioDurationSec ?? 30));
    const audioTok = secs * 25;
    const textTok = Math.max(0, params.assumedInputTokens ?? 200);
    inCost =
      (audioTok / 1_000_000) * state.priceAudioInputPer1M +
      (textTok / 1_000_000) * state.priceInputPer1M;
  } else {
    const inTok = Math.max(
      1,
      params.assumedInputTokens ?? (params.kind === 'image' ? 2000 : 7000),
    );
    inCost = (inTok / 1_000_000) * state.priceInputPer1M;
  }
  const outCost = (outTok / 1_000_000) * state.priceOutputPer1M;
  const preflightUsd = inCost + outCost;

  // Leave headroom so one accepted call is less likely to blow the objective.
  const headroom = 0.005;
  if (state.estimatedCostUsd + preflightUsd > state.maxEstimatedCostUsd - headroom) {
    throw new LiveBudgetExceededError(
      `Preflight would exceed global cost objective (est +$${preflightUsd.toFixed(4)}; used $${state.estimatedCostUsd.toFixed(4)} / $${state.maxEstimatedCostUsd})`,
      'live_gemini_cost_preflight',
    );
  }
  if (
    isMedia &&
    state.mediaEstimatedCostUsd + preflightUsd > state.maxMediaCostUsd - headroom / 2
  ) {
    throw new LiveBudgetExceededError(
      `Preflight would exceed media cost sub-cap (est +$${preflightUsd.toFixed(4)})`,
      'live_media_cost_preflight',
    );
  }
}

export function recordLiveBudgetGeminiHttpCall(note?: {
  requestId?: string;
  seq?: number;
  kind?: string;
  model?: string;
  outcome?: string;
  httpStatus?: number | null;
  tokensIn?: number;
  tokensOut?: number;
}) {
  if (!state.enabled) return;
  state.geminiHttpCalls += 1;
  if (note?.requestId) {
    state.recentCalls.push({
      requestId: note.requestId,
      seq: note.seq ?? state.geminiHttpCalls,
      kind: note.kind || 'primary',
      model: (note.model || '').slice(0, 80),
      outcome: note.outcome || 'pending',
      httpStatus: note.httpStatus ?? null,
      tokensIn: note.tokensIn ?? 0,
      tokensOut: note.tokensOut ?? 0,
      at: new Date().toISOString(),
    });
    if (state.recentCalls.length > MAX_RECENT_CALLS) {
      state.recentCalls = state.recentCalls.slice(-MAX_RECENT_CALLS);
    }
  }
  persistLiveBudget();
}

/** Update the last recentCalls entry for this request (outcome/tokens). */
export function patchLiveBudgetLastCall(params: {
  requestId: string;
  outcome: string;
  httpStatus?: number | null;
  tokensIn?: number;
  tokensOut?: number;
}) {
  if (!state.enabled) return;
  for (let i = state.recentCalls.length - 1; i >= 0; i -= 1) {
    const row = state.recentCalls[i];
    if (row.requestId !== params.requestId) continue;
    row.outcome = params.outcome;
    if (params.httpStatus != null) row.httpStatus = params.httpStatus;
    if (params.tokensIn != null) row.tokensIn = params.tokensIn;
    if (params.tokensOut != null) row.tokensOut = params.tokensOut;
    persistLiveBudget();
    return;
  }
}

export function recordLiveBudgetUsage(
  tokensIn: number,
  tokensOut: number,
  options?: {
    isMedia?: boolean;
    audioInputTokens?: number;
    /** When true, tokensIn already includes audio; split via audioInputTokens. */
  },
) {
  if (!state.enabled) return;
  const tin = Math.max(0, Math.floor(tokensIn || 0));
  const tout = Math.max(0, Math.floor(tokensOut || 0));
  const audioIn = Math.max(0, Math.floor(options?.audioInputTokens || 0));
  const textIn = Math.max(0, tin - audioIn);
  state.tokensInput += tin;
  state.tokensOutput += tout;
  const callCost =
    (textIn / 1_000_000) * state.priceInputPer1M +
    (audioIn / 1_000_000) * state.priceAudioInputPer1M +
    (tout / 1_000_000) * state.priceOutputPer1M;
  state.estimatedCostUsd += callCost;
  state.reportedCostUsd += callCost;
  if (options?.isMedia) {
    state.mediaEstimatedCostUsd += callCost;
  }
  persistLiveBudget();
  if (state.estimatedCostUsd > state.maxEstimatedCostUsd) {
    throw new LiveBudgetExceededError(
      `Live Gemini cost cap exceeded after usage ($${state.maxEstimatedCostUsd})`,
      'live_gemini_cost_cap',
    );
  }
  if (
    options?.isMedia &&
    state.mediaEstimatedCostUsd > state.maxMediaCostUsd
  ) {
    throw new LiveBudgetExceededError(
      `Live media cost cap exceeded after usage ($${state.maxMediaCostUsd})`,
      'live_media_cost_cap',
    );
  }
}

/** Count a media HTTP call (including errors/retries) against media + global caps. */
export function recordLiveBudgetMediaHttpCall(note?: {
  requestId?: string;
  kind?: string;
  model?: string;
  outcome?: string;
  httpStatus?: number | null;
}) {
  if (!state.enabled) return;
  state.mediaHttpCalls += 1;
  recordLiveBudgetGeminiHttpCall({
    requestId: note?.requestId,
    kind: note?.kind || 'media',
    model: note?.model,
    outcome: note?.outcome,
    httpStatus: note?.httpStatus,
  });
}

/** Can we guarantee the $0.02 cap with the configured pricing? */
export function canGuaranteeCostCap(params: {
  maxGeminiHttpCalls: number;
  maxOutputTokensPerCall: number;
  /** Conservative upper bound for prompt+tools context per call */
  assumedMaxInputTokensPerCall: number;
  priceInputPer1M: number;
  priceOutputPer1M: number;
  maxEstimatedCostUsd: number;
}): { ok: boolean; worstCaseUsd: number; reason?: string } {
  const worstCaseUsd =
    params.maxGeminiHttpCalls *
    ((params.assumedMaxInputTokensPerCall / 1_000_000) * params.priceInputPer1M +
      (params.maxOutputTokensPerCall / 1_000_000) * params.priceOutputPer1M);
  if (worstCaseUsd > params.maxEstimatedCostUsd) {
    return {
      ok: false,
      worstCaseUsd,
      reason:
        `Worst-case estimate $${worstCaseUsd.toFixed(4)} exceeds cap $${params.maxEstimatedCostUsd.toFixed(2)}. ` +
        `Lower CHATBOT_MAX_OUTPUT_TOKENS and/or CHATBOT_LIVE_MAX_GEMINI_CALLS, or raise the owner-approved budget.`,
    };
  }
  return { ok: true, worstCaseUsd };
}
