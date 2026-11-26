/**
 * Direct Wasender sends for the platform WA operator inbox.
 * Bypasses the text-only wasender_message_queue so humans can send
 * media / voice / quoted replies / reactions like WhatsApp Web.
 */

const WASENDER_BASE = 'https://www.wasenderapi.com';

export type WaMessageKey = {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
};

export type WasenderSendResult = {
  ok: boolean;
  msgId?: number | string | null;
  error?: string;
  raw?: unknown;
};

function apiKey(): string {
  return (process.env.WASENDER_API_KEY || '').trim();
}

function toE164(digits: string): string {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('+') ? d : `+${d}`;
}

async function wasenderFetch(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const key = apiKey();
  if (!key) throw new Error('WASENDER_API_KEY not configured');
  const res = await fetch(`${WASENDER_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
}

/** Upload media; returns a temporary publicUrl (≈24h). */
export async function uploadWasenderMedia(input: {
  base64: string;
  mimetype?: string;
}): Promise<{ publicUrl: string }> {
  const raw = String(input.base64 || '').trim();
  if (!raw) throw new Error('media_base64_required');
  const body: Record<string, string> = {};
  // Strip codecs params — Wasender rejects e.g. audio/webm;codecs=opus at upload.
  const mime = (input.mimetype || '').split(';')[0]!.trim() || undefined;
  if (raw.startsWith('data:')) {
    // Normalize data-URL mime if codecs were embedded.
    const normalized = mime
      ? raw.replace(/^data:[^;]+/, `data:${mime}`)
      : raw;
    body.base64 = normalized;
    if (mime) body.mimetype = mime;
  } else {
    body.base64 = raw;
    if (mime) body.mimetype = mime;
  }
  const { ok, status, json } = await wasenderFetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const publicUrl = String(json.publicUrl || '').trim();
  if (!ok || !publicUrl) {
    throw new Error(
      `wasender_upload_failed:${status}:${String(json.error || json.message || 'unknown')}`,
    );
  }
  return { publicUrl };
}

/**
 * Decrypt an inbound WhatsApp media message (voice note / photo) into a temporary
 * public URL. Returns null on any failure (never throws).
 */
export async function decryptWasenderMedia(input: {
  key: unknown;
  message: unknown;
}): Promise<{ publicUrl: string } | null> {
  try {
    const call = wasenderFetch('/api/decrypt-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { messages: { key: input.key, message: input.message } } }),
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000));
    const res = await Promise.race([call, timeout]);
    if (!res || !res.ok) return null;
    const direct = String(res.json.publicUrl || '').trim();
    const nested =
      res.json.data && typeof res.json.data === 'object'
        ? String((res.json.data as Record<string, unknown>).publicUrl || '').trim()
        : '';
    const publicUrl = direct || nested;
    return publicUrl ? { publicUrl } : null;
  } catch {
    return null;
  }
}

export async function sendWasenderDirect(input: {
  toDigits: string;
  text?: string;
  imageUrl?: string;
  documentUrl?: string;
  audioUrl?: string;
  /** Wasender integer msgId to quote (when known). */
  replyToMsgId?: number | null;
}): Promise<WasenderSendResult> {
  const to = toE164(input.toDigits);
  if (!to) return { ok: false, error: 'recipient_required' };

  const payload: Record<string, unknown> = { to };
  const text = String(input.text || '').trim();
  if (text) payload.text = text;
  if (input.imageUrl) payload.imageUrl = input.imageUrl;
  if (input.documentUrl) payload.documentUrl = input.documentUrl;
  if (input.audioUrl) payload.audioUrl = input.audioUrl;
  if (
    input.replyToMsgId != null &&
    Number.isFinite(Number(input.replyToMsgId)) &&
    Number(input.replyToMsgId) > 0
  ) {
    payload.replyTo = Number(input.replyToMsgId);
  }

  if (!payload.text && !payload.imageUrl && !payload.documentUrl && !payload.audioUrl) {
    return { ok: false, error: 'empty_payload' };
  }

  const { ok, status, json } = await wasenderFetch('/api/send-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data =
    json.data && typeof json.data === 'object'
      ? (json.data as Record<string, unknown>)
      : json;
  const msgId = data.msgId ?? data.id ?? null;
  if (!ok || json.success === false) {
    return {
      ok: false,
      error: `wasender_send_failed:${status}:${String(json.error || json.message || 'unknown')}`,
      raw: json,
    };
  }
  return { ok: true, msgId: msgId as number | string | null, raw: json };
}

export async function reactWasenderMessage(input: {
  key: WaMessageKey;
  emoji: string;
}): Promise<WasenderSendResult> {
  const key = input.key;
  if (!key?.id || !key.remoteJid) {
    return { ok: false, error: 'wa_key_required' };
  }
  const body: Record<string, unknown> = {
    key: {
      id: key.id,
      remoteJid: key.remoteJid,
      fromMe: Boolean(key.fromMe),
      ...(key.participant ? { participant: key.participant } : {}),
    },
    text: String(input.emoji || ''),
  };
  const { ok, status, json } = await wasenderFetch('/api/messages/react', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!ok || json.success === false) {
    return {
      ok: false,
      error: `wasender_react_failed:${status}:${String(json.error || json.message || 'unknown')}`,
      raw: json,
    };
  }
  return { ok: true, raw: json };
}
