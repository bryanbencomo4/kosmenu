import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('WhatsApp-like voice notes + jump-to-latest', () => {
  it('renders a custom voice player instead of native audio controls', () => {
    const voice = read('app/v/[id]/_components/chat/ChatVoiceNote.tsx');
    expect(voice).toMatch(/data-chat-voice="1"/);
    expect(voice).toMatch(/data-chat-voice-wave/);
    expect(voice).toMatch(/data-chat-voice-play/);
    expect(voice).toMatch(/data-chat-voice-avatar/);
    expect(voice).not.toMatch(/controls/);

    const bubble = read('app/v/[id]/_components/chat/ChatMessageBubble.tsx');
    expect(bubble).toMatch(/ChatVoiceNote/);
    expect(bubble).not.toMatch(/<audio[\s\S]*controls/);
  });

  it('shows a floating jump-to-latest control when scrolled up', () => {
    const list = read('app/v/[id]/_components/chat/ChatMessageList.tsx');
    expect(list).toMatch(/data-chat-jump-latest="1"/);
    expect(list).toMatch(/showJumpLatest/);
    expect(list).toMatch(/ChevronsDown/);
    expect(list).toMatch(/scrollToEnd\('smooth'\)/);
  });
});
