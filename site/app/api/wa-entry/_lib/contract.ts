/**
 * WaSender inbound contract (normalized).
 *
 * Source of truth (provider docs, 2026-11):
 * - https://www.wasenderapi.com/api-docs/webhooks/webhook-message-upsert
 * - https://www.wasenderapi.com/api-docs/webhooks/webhook-message-received
 * - https://wasenderapi.com/api-docs/getting-started/how-to-receive-messages-and-media-from-wasenderapi
 * - https://www.wasenderapi.com/api-docs/webhooks/webhook-setup
 *
 * Auth (provider): header `X-Webhook-Signature` must equal the session webhook secret
 * (exact string match — NOT HMAC of the body).
 *
 * Payload notes:
 * - `messages.upsert`: `data.messages` is an **array** (incoming + outgoing).
 * - `messages.received` / `messages-personal.received`: `data.messages` is often a **single object**.
 * - Prefer `key.cleanedSenderPn` / `messageBody` / `key.id` / `key.fromMe`.
 * - `remoteJid` may be `@lid` — do not treat it as a phone number.
 *
 * Local fixtures may still use a simplified shape; the normalizer accepts both.
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
  /** Raw event type string from provider. */
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
  result: 'simulated_ok' | 'simulated_fail' | 'queued' | 'refused';
  atMs: number;
  attempt: number;
  /** Bot vs human: true when this module generated the outbound. */
  origin: 'wa_entry_bot' | 'external';
  textHash: string;
};

export type WaRouteDropReason =
  | 'kill_switch'
  | 'unauthenticated'
  | 'malformed'
  | 'from_me'
  | 'bot_echo'
  | 'group'
  | 'status'
  | 'duplicate'
  | 'rate_limited'
  | 'human_handling'
  | 'empty_text'
  | 'not_allowlisted';

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

export function hashOutboundText(text: string): string {
  // Lightweight stable hash without importing crypto in every caller path;
  // store layer may also SHA-256. This is for in-memory echo matching.
  let h = 2166136261;
  const s = (text || '').normalize('NFC');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv_${(h >>> 0).toString(16)}`;
}

/**
 * Normalize a WaSender webhook body (docs + legacy fixtures).
 * Returns null when messageId / chat identity cannot be resolved.
 */
export function normalizeWaInboundPayload(raw: unknown): WaNormalizedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const eventType = String(root.event ?? root.type ?? 'message').trim();

  const data =
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>)
      : root;

  const messageNode = pickMessageNode(data, root);
  if (!messageNode) return null;

  const key =
    messageNode.key && typeof messageNode.key === 'object'
      ? (messageNode.key as Record<string, unknown>)
      : {};

  const messageId = String(
    key.id ??
      messageNode.id ??
      messageNode.messageId ??
      root.messageId ??
      '',
  ).trim();
  if (!messageId) return null;

  const remoteJid = String(
    key.remoteJid ??
      messageNode.from ??
      messageNode.remoteJid ??
      root.from ??
      '',
  ).trim();

  const cleanedPn = String(
    key.cleanedSenderPn ??
      key.cleanedParticipantPn ??
      messageNode.cleanedSenderPn ??
      '',
  ).trim();

  const senderPn = String(key.senderPn ?? '').trim();
  const phoneSource = cleanedPn || senderPn.split('@')[0] || remoteJid.split('@')[0] || remoteJid;
  const fromDigits = digitsOnly(phoneSource);
  if (!fromDigits && !remoteJid) return null;

  const fromMe = Boolean(key.fromMe ?? messageNode.fromMe ?? root.fromMe ?? false);
  const isGroup =
    remoteJid.includes('@g.us') ||
    Boolean(messageNode.isGroup ?? root.isGroup ?? false) ||
    Boolean(key.cleanedParticipantPn && remoteJid.includes('@g.us'));
  const isStatus =
    remoteJid === 'status@broadcast' ||
    Boolean(messageNode.isStatus ?? root.isStatus ?? false);

  const text = extractText(messageNode, data, root);
  const tsRaw = Number(
    root.timestamp ??
      messageNode.timestamp ??
      messageNode.messageTimestamp ??
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

  return {
    provider: 'wasender',
    messageId,
    sessionId,
    from: remoteJid || `${fromDigits}@s.whatsapp.net`,
    fromDigits: fromDigits || digitsOnly(remoteJid),
    text,
    timestampMs,
    fromMe,
    isGroup,
    isStatus,
    eventType,
    raw,
  };
}

function pickMessageNode(
  data: Record<string, unknown>,
  root: Record<string, unknown>,
): Record<string, unknown> | null {
  const messages = data.messages ?? root.messages;
  if (Array.isArray(messages) && messages[0] && typeof messages[0] === 'object') {
    return messages[0] as Record<string, unknown>;
  }
  if (messages && typeof messages === 'object' && !Array.isArray(messages)) {
    return messages as Record<string, unknown>;
  }
  if (data.message && typeof data.message === 'object') {
    return data.message as Record<string, unknown>;
  }
  // Legacy fixture: data.message already flattened, or root is the message
  if (data.id || data.text || data.key) return data;
  if (root.id || root.text) return root;
  return null;
}

function extractText(
  message: Record<string, unknown>,
  data: Record<string, unknown>,
  root: Record<string, unknown>,
): string {
  const candidates = [
    message.messageBody,
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
