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

/**
 * After Gemini finishes, discard the reply if takeover/close bumped attention
 * or moved the conversation to human handling while the model was running.
 */
export function shouldDiscardInFlightAssistant(input: {
  humanTakeoverEnabled: boolean;
  status: string | null | undefined;
  attentionVersionAtStart: number | null | undefined;
  attentionVersionNow: number | null | undefined;
}): boolean {
  if (!input.humanTakeoverEnabled) return false;
  const status = String(input.status || '');
  if (status === 'human_handling' || status === 'closed') return true;
  if (
    input.attentionVersionAtStart != null &&
    input.attentionVersionNow != null &&
    Number(input.attentionVersionNow) !== Number(input.attentionVersionAtStart)
  ) {
    return true;
  }
  return false;
}

/** True when this turn newly marks the conversation as needing a human. */
export function didEscalateToNeedsAttention(
  previousStatus: string | null | undefined,
  nextStatus: string,
  consumerText: string,
): boolean {
  if (!detectNeedsHuman(consumerText)) return false;
  if (nextStatus !== 'needs_attention') return false;
  const prev = String(previousStatus || '');
  return prev !== 'needs_attention' && prev !== 'human_handling';
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

/** Platform support digits — never a supervision notify destination. */
export const PLATFORM_SUPPORT_WHATSAPP_DIGITS = '584220451906';

/**
 * Merchant WaSender notify destination from config only.
 * Does NOT fall back to the public menu WhatsApp — that number may be for
 * diners, not staff alerts. Set config_negocio.supervision_whatsapp (preferred)
 * or notify_whatsapp / whatsapp_avisos.
 */
/** Idempotent WaSender key; version rises when a closed thread is reopened. */
export function newConversationNotifyDedupeKey(
  conversationId: string,
  attentionVersion = 1,
) {
  const version = Math.max(1, Number(attentionVersion) || 1);
  return `chat_supervision:new:${conversationId}:v${version}`;
}

export function pickSupervisionNotifyPhone(
  configNegocio: Record<string, unknown> | null | undefined,
): string | null {
  const cfg = configNegocio || {};
  const preferred = String(
    cfg.supervision_whatsapp ||
      cfg.notify_whatsapp ||
      cfg.whatsapp_avisos ||
      '',
  ).trim();
  if (!preferred) return null;
  const digits = preferred.replace(/\D/g, '');
  if (!digits || digits === PLATFORM_SUPPORT_WHATSAPP_DIGITS) return null;
  return preferred;
}
