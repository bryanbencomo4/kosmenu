/**
 * Per-request Gemini HTTP attribution (no secrets).
 * Explains smoke vs budget mismatches: every generateContent attempt is logged
 * with requestId even when the HTTP response never returns `usage` to the client.
 */

export type GeminiCallKind = 'primary' | 'fallback';

export type GeminiCallOutcome =
  | 'ok'
  | 'http_error'
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'unavailable'
  | 'aborted_cap'
  | 'unknown';

export type GeminiCallAttribution = {
  seq: number;
  requestId: string;
  kind: GeminiCallKind;
  model: string;
  outcome: GeminiCallOutcome;
  httpStatus: number | null;
  tokensIn: number;
  tokensOut: number;
  /** ms since request start when the call was recorded */
  atMs: number;
};

export type RequestCallLedger = {
  requestId: string;
  startedAt: number;
  calls: GeminiCallAttribution[];
  tokensInput: number;
  tokensOutput: number;
  toolCalls: number;
};

let activeLedger: RequestCallLedger | null = null;

export function beginRequestCallLedger(requestId: string): RequestCallLedger {
  activeLedger = {
    requestId,
    startedAt: Date.now(),
    calls: [],
    tokensInput: 0,
    tokensOutput: 0,
    toolCalls: 0,
  };
  return activeLedger;
}

export function getActiveRequestCallLedger(): RequestCallLedger | null {
  return activeLedger;
}

export function endRequestCallLedger(): RequestCallLedger | null {
  const snap = activeLedger;
  activeLedger = null;
  return snap;
}

export function recordAttributedGeminiCall(params: {
  kind: GeminiCallKind;
  model: string;
  outcome?: GeminiCallOutcome;
  httpStatus?: number | null;
}): GeminiCallAttribution | null {
  if (!activeLedger) return null;
  const row: GeminiCallAttribution = {
    seq: activeLedger.calls.length + 1,
    requestId: activeLedger.requestId,
    kind: params.kind,
    model: params.model,
    outcome: params.outcome || 'unknown',
    httpStatus: params.httpStatus ?? null,
    tokensIn: 0,
    tokensOut: 0,
    atMs: Date.now() - activeLedger.startedAt,
  };
  activeLedger.calls.push(row);
  return row;
}

export function finalizeAttributedGeminiCall(params: {
  outcome: GeminiCallOutcome;
  httpStatus?: number | null;
  tokensIn?: number;
  tokensOut?: number;
}) {
  if (!activeLedger || activeLedger.calls.length === 0) return;
  const row = activeLedger.calls[activeLedger.calls.length - 1];
  row.outcome = params.outcome;
  if (params.httpStatus != null) row.httpStatus = params.httpStatus;
  if (params.tokensIn != null) {
    row.tokensIn = Math.max(0, Math.floor(params.tokensIn));
    activeLedger.tokensInput += row.tokensIn;
  }
  if (params.tokensOut != null) {
    row.tokensOut = Math.max(0, Math.floor(params.tokensOut));
    activeLedger.tokensOutput += row.tokensOut;
  }
}

export function bumpAttributedToolCalls(n = 1) {
  if (!activeLedger) return;
  activeLedger.toolCalls += Math.max(0, Math.floor(n));
}

/** Public, non-sensitive summary for API error/success payloads. */
export function publicCallAttribution(ledger: RequestCallLedger | null) {
  if (!ledger) return null;
  return {
    requestId: ledger.requestId,
    geminiHttpCalls: ledger.calls.length,
    tokensInput: ledger.tokensInput,
    tokensOutput: ledger.tokensOutput,
    toolCalls: ledger.toolCalls,
    calls: ledger.calls.map((c) => ({
      seq: c.seq,
      kind: c.kind,
      model: c.model,
      outcome: c.outcome,
      httpStatus: c.httpStatus,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
    })),
  };
}
