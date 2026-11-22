import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  humanLocalReplyMs,
  humanReadBeatMs,
  humanTypingMinMs,
} from '../app/v/[id]/_components/chat/chat-timing';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('chat human timing', () => {
  it('keeps typing on screen for a human-feel minimum', () => {
    expect(humanTypingMinMs(20)).toBeGreaterThanOrEqual(950);
    expect(humanTypingMinMs(20)).toBeLessThanOrEqual(2800);
    expect(humanTypingMinMs(200)).toBeGreaterThan(humanTypingMinMs(10) - 400);
    expect(humanLocalReplyMs()).toBeGreaterThanOrEqual(700);
    expect(humanReadBeatMs()).toBeGreaterThanOrEqual(320);
  });

  it('wires delays into the assistant turn and voice pending spinner', () => {
    const view = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatAssistantView.tsx'),
      'utf8',
    );
    const bubble = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatMessageBubble.tsx'),
      'utf8',
    );
    const voice = readFileSync(
      path.join(root, 'app/v/[id]/_components/chat/ChatVoiceNote.tsx'),
      'utf8',
    );
    expect(view).toMatch(/humanTypingMinMs/);
    expect(view).toMatch(/humanReadBeatMs/);
    expect(view).toMatch(/voicePending:\s*true/);
    expect(view).toMatch(/data-chat-shell/);
    expect(view).toMatch(/max-w-5xl/);
    expect(bubble).toMatch(/pending=\{message\.voicePending\}/);
    expect(voice).toMatch(/data-chat-voice-pending/);
    expect(voice).toMatch(/animate-spin/);
  });
});
