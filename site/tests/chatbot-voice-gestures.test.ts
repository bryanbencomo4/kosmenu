import { describe, expect, it } from 'vitest';

import {
  REPLY_SWIPE_THRESHOLD_PX,
  VOICE_CANCEL_THRESHOLD_PX,
  VOICE_LOCK_THRESHOLD_PX,
  buildChatReplyRef,
  buildReplyContextLine,
  prefixTextWithReplyContext,
  classifyReplySwipe,
  isReplyGestureBlockedTarget,
  isReplySwipeArmed,
  isVoiceTap,
  replySwipeOffset,
  resolveVoiceHoldSlide,
} from '../app/v/[id]/_components/chat/chat-gestures';

describe('voice hold gesture thresholds', () => {
  it('stays in hold below thresholds', () => {
    expect(resolveVoiceHoldSlide(-10, -5).intent).toBe('hold');
    expect(resolveVoiceHoldSlide(0, 0).intent).toBe('hold');
  });

  it('cancels when sliding left past threshold', () => {
    expect(resolveVoiceHoldSlide(-VOICE_CANCEL_THRESHOLD_PX, 0).intent).toBe('cancel');
    expect(resolveVoiceHoldSlide(-VOICE_CANCEL_THRESHOLD_PX + 1, 0).intent).toBe('hold');
  });

  it('locks when sliding up past threshold', () => {
    expect(resolveVoiceHoldSlide(0, -VOICE_LOCK_THRESHOLD_PX).intent).toBe('lock');
    expect(resolveVoiceHoldSlide(0, -VOICE_LOCK_THRESHOLD_PX + 1).intent).toBe('hold');
  });

  it('uses the dominant axis so a diagonal cannot do both', () => {
    const up = resolveVoiceHoldSlide(-20, -60);
    expect(up.intent).toBe('lock');
    expect(up.cancelProgress).toBe(0);
    const left = resolveVoiceHoldSlide(-70, -20);
    expect(left.intent).toBe('cancel');
    expect(left.lockProgress).toBe(0);
  });

  it('ignores rightward / downward movement', () => {
    expect(resolveVoiceHoldSlide(200, 200).intent).toBe('hold');
  });

  it('detects taps: short and stationary only', () => {
    expect(isVoiceTap(120, 2)).toBe(true);
    expect(isVoiceTap(250, 2)).toBe(false);
    expect(isVoiceTap(120, 30)).toBe(false);
  });
});

describe('reply swipe', () => {
  it('only a horizontal rightward drag becomes a swipe', () => {
    expect(classifyReplySwipe(3, 3)).toBe('pending');
    expect(classifyReplySwipe(30, 4)).toBe('swipe');
    expect(classifyReplySwipe(4, 30)).toBe('ignore'); // vertical scroll
    expect(classifyReplySwipe(-30, 2)).toBe('ignore'); // leftward
  });

  it('arms at the threshold and damps beyond it', () => {
    expect(isReplySwipeArmed(REPLY_SWIPE_THRESHOLD_PX - 1)).toBe(false);
    expect(isReplySwipeArmed(REPLY_SWIPE_THRESHOLD_PX)).toBe(true);
    expect(replySwipeOffset(-10)).toBe(0);
    expect(replySwipeOffset(20)).toBe(20);
    expect(replySwipeOffset(400)).toBeLessThanOrEqual(72);
  });

  it('blocks gestures that start in carousels or controls', () => {
    const matches = (hit: boolean) => ({ closest: () => (hit ? {} : null) });
    expect(isReplyGestureBlockedTarget(matches(true))).toBe(true);
    expect(isReplyGestureBlockedTarget(matches(false))).toBe(false);
    expect(isReplyGestureBlockedTarget(null)).toBe(false);
  });
});

describe('buildChatReplyRef', () => {
  const base = { id: 'm1', role: 'assistant' as const, text: '' };

  it('clamps long text to one flat line', () => {
    const ref = buildChatReplyRef({ ...base, text: `hola\n\n${'a'.repeat(300)}` });
    expect(ref.messageId).toBe('m1');
    expect(ref.role).toBe('assistant');
    expect(ref.preview.length).toBeLessThanOrEqual(120);
    expect(ref.preview.endsWith('â€¦')).toBe(true);
    expect(ref.preview).not.toMatch(/\n/);
  });

  it('falls back to a label for media-only messages', () => {
    expect(buildChatReplyRef({ ...base, voiceUrl: 'blob:x' }).preview).toMatch(/voz/i);
    expect(buildChatReplyRef({ ...base, location: { lat: 1, lng: 2 } }).preview).toMatch(
      /ubicaci/i,
    );
    expect(buildChatReplyRef(base).preview).toBe('Mensaje');
  });
});

describe('reply context for API payload', () => {
  const history = [
    { id: 'a1', role: 'assistant' as const, text: 'La Hawaiana cuesta 10 USD' },
    { id: 'u1', role: 'user' as const, text: 'esa' },
  ];

  it('prefers history text over the client preview', () => {
    const line = buildReplyContextLine(
      { messageId: 'a1', role: 'assistant', preview: 'tampered' },
      history,
    );
    expect(line).toBe('(Respondiendo a [assistant]: "La Hawaiana cuesta 10 USD")\n');
  });

  it('falls back to the preview and prefixes the text', () => {
    const out = prefixTextWithReplyContext(
      'sí',
      { messageId: 'gone', role: 'assistant', preview: 'Algo' },
      history,
    );
    expect(out).toBe('(Respondiendo a [assistant]: "Algo")\nsí');
    expect(prefixTextWithReplyContext('sí', null, history)).toBe('sí');
  });

  it('keeps the result within the API cap', () => {
    const out = prefixTextWithReplyContext(
      'x'.repeat(2000),
      { messageId: 'a1', role: 'assistant', preview: 'p' },
      history,
    );
    expect(out.length).toBe(2000);
  });
});
