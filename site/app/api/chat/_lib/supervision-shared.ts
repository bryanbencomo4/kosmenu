import { createHmac } from 'node:crypto';

import { publicSiteUrl } from '../../_lib/public-site-url';

export function sessionPepper(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.CHAT_SUPERVISION_SESSION_PEPPER?.trim() ||
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'local-dev-pepper'
  );
}

export function hashConsumerSession(
  comercioId: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return createHmac('sha256', sessionPepper(env))
    .update(`${comercioId.trim()}:${sessionId.trim()}`)
    .digest('hex');
}

/**
 * WaSender deep link → Next merchant panel (same deploy as chat APIs).
 * Flutter native inbox remains available via Settings / app.elmenuxfa.com.
 */
export function merchantConversationHref(conversationId: string) {
  const base = publicSiteUrl.replace(/\/$/, '');
  return `${base}/panel/conversaciones/${encodeURIComponent(conversationId)}`;
}

export const ESCALATION_RE =
  /\b(humano|hablar con|encargad[oa]|reclamo|queja|no me est[aá]s entendiendo|pedido (lleg[oó]|vino) mal|atenci[oó]n)\b/i;

export function detectNeedsHuman(text: string) {
  return ESCALATION_RE.test(text);
}

/** Max WaSender delivery attempts for a supervision notify event. */
export const SUPERVISION_NOTIFY_MAX_ATTEMPTS = 3;

const SUPERVISION_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

/**
 * After `failedAttempts` recorded failures, when to try again.
 * `failedAttempts=1` → 1m, `2` → 5m; at max attempts returns null (stop).
 */
export function nextSupervisionRetryAt(
  failedAttempts: number,
  nowMs = Date.now(),
): string | null {
  if (
    !Number.isFinite(failedAttempts) ||
    failedAttempts < 1 ||
    failedAttempts >= SUPERVISION_NOTIFY_MAX_ATTEMPTS
  ) {
    return null;
  }
  const delay =
    SUPERVISION_RETRY_DELAYS_MS[
      Math.min(failedAttempts - 1, SUPERVISION_RETRY_DELAYS_MS.length - 1)
    ];
  return new Date(nowMs + delay).toISOString();
}

export function shouldRetrySupervisionNotify(
  meta: { attempts?: unknown; next_retry_at?: unknown } | null | undefined,
  nowMs = Date.now(),
): boolean {
  const attempts = Number(meta?.attempts || 0);
  if (!Number.isFinite(attempts) || attempts >= SUPERVISION_NOTIFY_MAX_ATTEMPTS) {
    return false;
  }
  const next = meta?.next_retry_at;
  if (next == null || String(next).trim() === '') return true;
  const at = Date.parse(String(next));
  return Number.isFinite(at) && at <= nowMs;
}
