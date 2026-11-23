/**
 * Pure helpers for chat voice hold gestures and swipe-to-reply.
 * No DOM / React imports so they stay trivially unit-testable.
 */
import type { ChatMessage, ChatReplyRef } from './chat-types';

/** Slide left (px) past this while holding the mic → cancel the recording. */
export const VOICE_CANCEL_THRESHOLD_PX = 56;
/** Slide up (px) past this while holding the mic → lock recording (hands-free). */
export const VOICE_LOCK_THRESHOLD_PX = 48;
/** Press shorter than this (and basically stationary) is a "tap" → toggle mode. */
export const VOICE_TAP_MAX_MS = 200;
/** Movement allowed for a press to still count as a tap. */
export const VOICE_TAP_SLOP_PX = 8;

/** Swipe-right distance on a bubble that triggers reply. */
export const REPLY_SWIPE_THRESHOLD_PX = 48;
/** Visual cap for the bubble translate while swiping. */
export const REPLY_SWIPE_MAX_OFFSET_PX = 72;
/** Movement before we decide whether a bubble gesture is horizontal or vertical. */
export const REPLY_SWIPE_SLOP_PX = 10;
/** Touch long-press duration on a bubble to start a reply. */
export const REPLY_LONG_PRESS_MS = 520;

export const CHAT_REPLY_PREVIEW_MAX = 120;

/**
 * Elements inside a bubble that own their own pointer gestures. Swipe/long-press
 * to reply must never start from these (audio scrubber, links, carousels…).
 */
export const REPLY_GESTURE_BLOCK_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'audio',
  'video',
  '[role="button"]',
  '[role="slider"]',
  '[data-chat-h-scroll]',
  '[data-chat-no-swipe]',
].join(',');

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export type VoiceHoldIntent = 'hold' | 'cancel' | 'lock';

export type VoiceHoldSlide = {
  intent: VoiceHoldIntent;
  /** 0..1 toward the cancel threshold (left slide). */
  cancelProgress: number;
  /** 0..1 toward the lock threshold (up slide). */
  lockProgress: number;
};

/**
 * Resolve the hold gesture from the pointer delta since pointerdown.
 * Only the dominant axis counts, so a diagonal wobble can't cancel AND lock.
 */
export function resolveVoiceHoldSlide(dx: number, dy: number): VoiceHoldSlide {
  const left = Math.max(0, -dx);
  const up = Math.max(0, -dy);
  const horizontal = left >= up;
  const cancelProgress = horizontal ? clamp01(left / VOICE_CANCEL_THRESHOLD_PX) : 0;
  const lockProgress = horizontal ? 0 : clamp01(up / VOICE_LOCK_THRESHOLD_PX);
  const intent: VoiceHoldIntent =
    cancelProgress >= 1 ? 'cancel' : lockProgress >= 1 ? 'lock' : 'hold';
  return { intent, cancelProgress, lockProgress };
}

/** True when a press is short + stationary enough to be a tap (toggle-mode start). */
export function isVoiceTap(heldMs: number, movedPx: number): boolean {
  return heldMs < VOICE_TAP_MAX_MS && movedPx <= VOICE_TAP_SLOP_PX;
}

export type ReplySwipePhase = 'pending' | 'swipe' | 'ignore';

/**
 * Classify a bubble pointer gesture: only a clearly horizontal, rightward drag is a
 * reply swipe. Anything else (vertical scroll, left drag) is ignored so the chat
 * scrolls normally.
 */
export function classifyReplySwipe(dx: number, dy: number): ReplySwipePhase {
  if (Math.abs(dx) < REPLY_SWIPE_SLOP_PX && Math.abs(dy) < REPLY_SWIPE_SLOP_PX) {
    return 'pending';
  }
  return dx > 0 && Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'ignore';
}

/** Rubber-band translate for the bubble while swiping right. */
export function replySwipeOffset(dx: number): number {
  if (dx <= 0) return 0;
  const raw =
    dx <= REPLY_SWIPE_THRESHOLD_PX
      ? dx
      : REPLY_SWIPE_THRESHOLD_PX + (dx - REPLY_SWIPE_THRESHOLD_PX) * 0.3;
  return Math.min(raw, REPLY_SWIPE_MAX_OFFSET_PX);
}

export function isReplySwipeArmed(dx: number): boolean {
  return dx >= REPLY_SWIPE_THRESHOLD_PX;
}

/** Accepts anything with `closest` (Element, or a stub in tests). */
export function isReplyGestureBlockedTarget(
  target: { closest?: (selector: string) => unknown } | null | undefined,
): boolean {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest(REPLY_GESTURE_BLOCK_SELECTOR));
}

export function clampReplyPreview(text: string, max = CHAT_REPLY_PREVIEW_MAX): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Build the `replyTo` payload for a message. Falls back to a short label for
 * media-only bubbles so the quote is never empty.
 */
export function buildChatReplyRef(
  message: Pick<
    ChatMessage,
    | 'id'
    | 'role'
    | 'text'
    | 'voiceUrl'
    | 'attachments'
    | 'location'
    | 'productCards'
    | 'senderLabel'
  >,
  authorLabel?: string | null,
): ChatReplyRef {
  const image = message.attachments?.find((a) => a.kind === 'image' && a.url);
  const file = message.attachments?.find((a) => a.kind === 'file');
  const hasAudio = Boolean(message.voiceUrl) ||
    Boolean(message.attachments?.some((a) => a.kind === 'audio'));

  let kind: ChatReplyRef['kind'] = 'text';
  let preview = clampReplyPreview(message.text || '');
  let thumbUrl: string | null = null;

  if (hasAudio && (!preview || /^🎤/.test(preview))) {
    kind = 'audio';
    preview = preview || 'Nota de voz';
  } else if (image) {
    kind = 'image';
    thumbUrl = image.url;
    if (!preview || /^📷/.test(preview)) preview = 'Foto';
  } else if (file) {
    kind = 'file';
    if (!preview || /^📎/.test(preview)) preview = file.name || 'Archivo';
  } else if (message.location) {
    kind = 'location';
    preview = preview || 'Ubicación';
  } else if (!preview) {
    if (message.productCards?.[0]?.name) {
      preview = clampReplyPreview(message.productCards[0].name);
    } else {
      preview = 'Mensaje';
    }
  }

  return {
    messageId: message.id,
    role: message.role,
    preview,
    kind,
    ...(thumbUrl ? { thumbUrl } : {}),
    authorLabel:
      authorLabel ??
      message.senderLabel ??
      (message.role === 'user' ? 'Tú' : null),
  };
}

export const CHAT_API_TEXT_MAX = 2000;

/**
 * Context line prepended to the API copy of a user's reply, e.g.
 * `(Respondiendo a [assistant]: "La Hawaiana…")\n`. Prefers the text found in
 * history (by messageId) over the client preview; falls back to the preview.
 */
export function buildReplyContextLine(
  reply: ChatReplyRef,
  history: ReadonlyArray<Pick<ChatMessage, 'id' | 'role' | 'text'>>,
): string {
  const source = history.find((m) => m.id === reply.messageId);
  const fromHistory = source ? clampReplyPreview(source.text || '') : '';
  const preview = (fromHistory || reply.preview || 'Mensaje').replace(/"/g, "'");
  const role = source?.role ?? reply.role;
  return `(Respondiendo a [${role}]: "${preview}")\n`;
}

/** Prefix `text` with the reply context line, keeping the result within the API cap. */
export function prefixTextWithReplyContext(
  text: string,
  reply: ChatReplyRef | null | undefined,
  history: ReadonlyArray<Pick<ChatMessage, 'id' | 'role' | 'text'>>,
  maxLength = CHAT_API_TEXT_MAX,
): string {
  if (!reply) return text;
  return `${buildReplyContextLine(reply, history)}${text}`.slice(0, maxLength);
}
