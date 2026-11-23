/**
 * WaSender inbound contract (normalized).
 *
 * IMPORTANT: This repo historically had NO inbound WaSender handler.
 * Field names below follow common WaSender / WhatsApp-gateway conventions
 * and the fixtures under tests/fixtures/wa-entry/. Treat unverified fields
 * as provisional until a real ELMENUXFA1 capture replaces them.
 */

export type WaNormalizedEvent = {
  provider: 'wasender';
  /** Stable id for dedupe — required for processing. */
  messageId: string;
  sessionId: string;
  from: string;
  /** Digits-only E.164-ish key for thread storage. */
  fromDigits: string;
  text: string;
  timestampMs: number;
  fromMe: boolean;
  isGroup: boolean;
  isStatus: boolean;
  /** Raw event type string from provider (unverified taxonomy). */
  eventType: string;
  raw: unknown;
};

export type WaThreadState =
  | 'initial'
  | 'awaiting_audience'
  | 'awaiting_business_action'
  | 'consumer_link_sent'
  | 'business_link_sent'
  | 'human_handling'
  | 'closed';

export type WaThreadRecord = {
  fromDigits: string;
  state: WaThreadState;
  updatedAtMs: number;
  expiresAtMs: number;
  humanPausedUntilMs: number | null;
  repliesLastHour: number[];
  lastOutboundDedupeKey: string | null;
};

export type WaOutboundRecord = {
  id: string;
  to: string;
  text: string;
  eventId: string;
  dedupeKey: string;
  result: 'simulated_ok' | 'simulated_fail' | 'queued';
  atMs: number;
  attempt: number;
};

export type WaRouteDropReason =
  | 'kill_switch'
  | 'unauthenticated'
  | 'malformed'
  | 'from_me'
  | 'group'
  | 'status'
  | 'duplicate'
  | 'rate_limited'
  | 'human_handling'
  | 'empty_text';

export type WaRouteResult =
  | {
      action: 'drop';
      reason: WaRouteDropReason;
      nextState?: WaThreadState;
    }
  | {
      action: 'reply';
      replies: string[];
      nextState: WaThreadState;
      dedupeKey: string;
    };

/** Digits only, strip leading +. */
export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/**
 * Normalize a provisional WaSender-like webhook body.
 * Unverified fields are tolerated when missing; messageId+from are required.
 */
export function normalizeWaInboundPayload(raw: unknown): WaNormalizedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;

  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;

  const message =
    data.message && typeof data.message === 'object'
      ? (data.message as Record<string, unknown>)
      : data.messages && Array.isArray(data.messages) && data.messages[0]
        ? (data.messages[0] as Record<string, unknown>)
        : data;

  const key =
    message.key && typeof message.key === 'object'
      ? (message.key as Record<string, unknown>)
      : {};

  const messageId = String(
    message.id ??
      message.messageId ??
      key.id ??
      root.messageId ??
      '',
  ).trim();
  if (!messageId) return null;

  const remoteJid = String(
    message.from ??
      message.remoteJid ??
      key.remoteJid ??
      root.from ??
      '',
  ).trim();
  if (!remoteJid) return null;

  const fromMe = Boolean(
    message.fromMe ?? key.fromMe ?? root.fromMe ?? false,
  );
  const isGroup =
    remoteJid.includes('@g.us') ||
    Boolean(message.isGroup ?? root.isGroup ?? false);
  const isStatus =
    remoteJid === 'status@broadcast' ||
    Boolean(message.isStatus ?? root.isStatus ?? false);

  const text = extractText(message, data, root);
  const tsRaw = Number(
    message.timestamp ??
      message.messageTimestamp ??
      root.timestamp ??
      Date.now(),
  );
  const timestampMs =
    Number.isFinite(tsRaw) && tsRaw > 0
      ? tsRaw < 1e12
        ? Math.floor(tsRaw * 1000)
        : Math.floor(tsRaw)
      : Date.now();

  const sessionId = String(
    root.sessionId ??
      root.session ??
      data.sessionId ??
      data.session ??
      'unknown',
  ).trim();

  const eventType = String(root.event ?? root.type ?? data.event ?? 'message').trim();

  return {
    provider: 'wasender',
    messageId,
    sessionId,
    from: remoteJid,
    fromDigits: digitsOnly(remoteJid.split('@')[0] || remoteJid),
    text,
    timestampMs,
    fromMe,
    isGroup,
    isStatus,
    eventType,
    raw,
  };
}

function extractText(
  message: Record<string, unknown>,
  data: Record<string, unknown>,
  root: Record<string, unknown>,
): string {
  const candidates = [
    message.text,
    message.body,
    message.conversation,
    data.text,
    root.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  const msgContent =
    message.message && typeof message.message === 'object'
      ? (message.message as Record<string, unknown>)
      : null;
  if (msgContent) {
    if (typeof msgContent.conversation === 'string') {
      return msgContent.conversation.trim();
    }
    const ext = msgContent.extendedTextMessage;
    if (ext && typeof ext === 'object') {
      const t = (ext as { text?: unknown }).text;
      if (typeof t === 'string') return t.trim();
    }
  }
  return '';
}
