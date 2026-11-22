/**
 * Client-side chat history for Phase 2 — sessionStorage only, keyed by commerce.
 */
import { isPersistedMediaUrl } from '../v/[id]/_components/chat/chat-media-persist';
import type { ChatMessage } from '../v/[id]/_components/chat/chat-types';

const PREFIX = 'elmenuxfa:chat-v1:';
const SESSION_ID_PREFIX = 'elmenuxfa:chat-sid-v1:';
const FEED_TOKEN_PREFIX = 'elmenuxfa:chat-feed-token-v1:';
const FEED_SEQ_PREFIX = 'elmenuxfa:chat-feed-seq-v1:';
const DEFAULT_MAX = 40;

function storageKey(comercioId: string) {
  return `${PREFIX}${comercioId.trim()}`;
}

function sessionIdKey(comercioId: string) {
  return `${SESSION_ID_PREFIX}${comercioId.trim()}`;
}

function feedTokenKey(comercioId: string) {
  return `${FEED_TOKEN_PREFIX}${comercioId.trim()}`;
}

function feedSeqKey(comercioId: string) {
  return `${FEED_SEQ_PREFIX}${comercioId.trim()}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

export function loadChatSessionId(comercioId: string): string | null {
  if (!canUseStorage() || !comercioId.trim()) return null;
  try {
    return sessionStorage.getItem(sessionIdKey(comercioId));
  } catch {
    return null;
  }
}

export function saveChatSessionId(comercioId: string, sessionId: string) {
  if (!canUseStorage() || !comercioId.trim() || !sessionId.trim()) return;
  try {
    sessionStorage.setItem(sessionIdKey(comercioId), sessionId.trim());
  } catch {
    /* ignore quota */
  }
}

export function ensureChatSessionId(comercioId: string): string {
  const existing = loadChatSessionId(comercioId);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? `s_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
      : `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  saveChatSessionId(comercioId, id);
  return id;
}

export function loadSupervisionFeedToken(comercioId: string): string | null {
  if (!canUseStorage() || !comercioId.trim()) return null;
  try {
    return sessionStorage.getItem(feedTokenKey(comercioId));
  } catch {
    return null;
  }
}

export function saveSupervisionFeedToken(comercioId: string, token: string) {
  if (!canUseStorage() || !comercioId.trim() || !token.trim()) return;
  try {
    sessionStorage.setItem(feedTokenKey(comercioId), token.trim());
  } catch {
    /* ignore */
  }
}

export function clearSupervisionFeedToken(comercioId: string) {
  if (!canUseStorage() || !comercioId.trim()) return;
  try {
    sessionStorage.removeItem(feedTokenKey(comercioId));
  } catch {
    /* ignore */
  }
}

export function loadSupervisionAfterSeq(comercioId: string): number {
  if (!canUseStorage() || !comercioId.trim()) return 0;
  try {
    const n = Number(sessionStorage.getItem(feedSeqKey(comercioId)) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveSupervisionAfterSeq(comercioId: string, seq: number) {
  if (!canUseStorage() || !comercioId.trim()) return;
  try {
    sessionStorage.setItem(feedSeqKey(comercioId), String(Math.max(0, seq)));
  } catch {
    /* ignore */
  }
}

export function loadChatHistory(
  comercioId: string,
  maxMessages = DEFAULT_MAX,
): ChatMessage[] | null {
  if (!canUseStorage() || !comercioId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(comercioId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
          typeof m.text === 'string',
      )
      .slice(-maxMessages);
  } catch {
    return null;
  }
}

export function saveChatHistory(
  comercioId: string,
  messages: ChatMessage[],
  maxMessages = DEFAULT_MAX,
) {
  if (!canUseStorage() || !comercioId.trim()) return;
  try {
    const slim = messages.slice(-maxMessages).map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      createdAt: m.createdAt,
      demo: m.demo,
      isWelcome: m.isWelcome,
      welcomeVersion: m.welcomeVersion,
      deliveryStatus: m.deliveryStatus,
      voiceDurationMs: m.voiceDurationMs,
      // Keep proposal cards across remounts so confirm UI does not vanish.
      productCards: m.productCards,
      cartActions: m.cartActions,
      // Cited reply + sticker are tiny/serializable. Catalog carousels are
      // rebuilt from the live catalog, so they are intentionally not persisted.
      replyTo: m.replyTo ?? undefined,
      sticker: m.sticker ?? undefined,
      // GPS share (serializable).
      location: m.location
        ? {
            lat: m.location.lat,
            lng: m.location.lng,
            label: m.location.label,
            kind: m.location.kind,
            address: m.location.address,
            mapsUrl: m.location.mapsUrl,
            directionsUrl: m.location.directionsUrl,
          }
        : null,
      attachments: (m.attachments || [])
        .filter((a) => a.kind === 'image' || a.kind === 'file' || a.kind === 'audio')
        .map((a) => ({
          id: a.id,
          kind: a.kind,
          name: a.name,
          mime: a.mime,
          size: a.size,
          // Persist data:/https images; blob: URLs die on remount.
          url: isPersistedMediaUrl(a.url) ? a.url : '',
          analysis: a.analysis ?? null,
        })),
      // voiceUrl is a blob: URL — do not persist across reloads.
    }));
    sessionStorage.setItem(storageKey(comercioId), JSON.stringify(slim));
  } catch {
    /* ignore */
  }
}

export function clearChatHistory(comercioId: string) {
  if (!canUseStorage() || !comercioId.trim()) return;
  try {
    sessionStorage.removeItem(storageKey(comercioId));
    sessionStorage.removeItem(sessionIdKey(comercioId));
    sessionStorage.removeItem(feedTokenKey(comercioId));
    sessionStorage.removeItem(feedSeqKey(comercioId));
  } catch {
    /* ignore */
  }
}
