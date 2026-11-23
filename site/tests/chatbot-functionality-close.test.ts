import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import {
  chatMediaLiveAllowed,
  resolveChatMediaMode,
  CHAT_MEDIA_MAX_AUDIO_BYTES,
} from '../app/api/chat/_lib/media-gates';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('functionality close — delivery receipts (honest)', () => {
  it('does not fake-advance ticks with a 180ms timeout', () => {
    const view = read('app/v/[id]/_components/chat/ChatAssistantView.tsx');
    expect(view).not.toMatch(/setTimeout\(\(\) => \{\s*setMessages\(\(prev\) => markUserMessages\(prev, 'delivered'\)\)/);
    expect(view).not.toMatch(/,\s*180\s*\)/);
    expect(view).toMatch(/markLatestUserMessage/);
    expect(view).toMatch(/Network failure before accept/);
  });

  it('typing indicator is tied only to isTyping during reply generation', () => {
    const view = read('app/v/[id]/_components/chat/ChatAssistantView.tsx');
    const header = read('app/v/[id]/_components/chat/ChatHeader.tsx');
    expect(view).toMatch(/setIsTyping\(true\)/);
    expect(view).toMatch(/setIsTyping\(false\)/);
    expect(header).toMatch(/isTyping \? 'escribiendo…'/);
  });
});

describe('functionality close — voice / media gates', () => {
  it('composer supports cancel, draft preview, Safari MIME candidates', () => {
    const composer = read('app/v/[id]/_components/chat/ChatComposer.tsx');
    expect(composer).toMatch(/data-chat-voice-cancel/);
    expect(composer).toMatch(/data-chat-voice-draft/);
    expect(composer).toMatch(/data-chat-voice-discard/);
    expect(composer).toMatch(/data-chat-voice-confirm/);
    expect(composer).toMatch(/audio\/mp4/);
    expect(composer).toMatch(/pickRecorderMime/);
  });

  it('media mode defaults to simulate; live locked without CHATBOT_MEDIA_LIVE', () => {
    expect(
      resolveChatMediaMode({
        NODE_ENV: 'development',
        CHATBOT_SIMULATE_GEMINI: '1',
      } as NodeJS.ProcessEnv),
    ).toBe('simulate');
    expect(
      resolveChatMediaMode({
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toBe('disabled');
    expect(
      resolveChatMediaMode({
        NODE_ENV: 'production',
        CHATBOT_SIMULATE_GEMINI: '0',
        CHATBOT_MEDIA_LIVE: '1',
        CHATBOT_VOICE_STT: '1',
      } as NodeJS.ProcessEnv),
    ).toBe('live');
    const blocked = chatMediaLiveAllowed({
      NODE_ENV: 'development',
      CHATBOT_SIMULATE_GEMINI: '0',
      CHATBOT_VOICE_STT: '1',
      GEMINI_API_KEY: 'x',
      CHATBOT_MEDIA_LIVE: '0',
    } as NodeJS.ProcessEnv);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('media_live_locked');
    expect(CHAT_MEDIA_MAX_AUDIO_BYTES).toBeGreaterThan(0);
  });

  it('media route gates production runtime and live budget', () => {
    const route = read('app/api/chat/[comercioId]/media/route.ts');
    expect(route).toMatch(/isChatbotRuntimeAllowed/);
    expect(route).toMatch(/production_blocked/);
    expect(route).toMatch(/runMediaGemini/);
    expect(route).toMatch(/hardGuarantee: false/);
    expect(route).toMatch(/chatMediaLiveAllowed/);
  });
});

describe('functionality close — images, location, emoji', () => {
  it('composer exposes image/file/location attach actions with mobile touch targets', () => {
    const composer = read('app/v/[id]/_components/chat/ChatComposer.tsx');
    expect(composer).toMatch(/data-chat-attach-image/);
    expect(composer).toMatch(/data-chat-attach-file/);
    expect(composer).toMatch(/data-chat-attach-location/);
    expect(composer).toMatch(/min-h-\[44px\]/);
    expect(composer).toMatch(/touch-manipulation/);
  });

  it('page wires shared location into delivery checkout', () => {
    const page = read('app/v/[id]/page.tsx');
    expect(page).toMatch(/onShareLocationForDelivery/);
    expect(page).toMatch(/setDeliveryMode\('delivery'\)/);
    expect(page).toMatch(/setDeliveryPointSource\('user'\)/);
    expect(page).toMatch(/openCheckoutSheet/);
  });

  it('bubble renders media + location blocks', () => {
    const bubble = read('app/v/[id]/_components/chat/ChatMessageBubble.tsx');
    expect(bubble).toMatch(/data-chat-media-image/);
    expect(bubble).toMatch(/data-chat-media-file/);
    expect(bubble).toMatch(/data-chat-location/);
  });
});

describe('functionality close — Gemini prompt naturalness (no live calls)', () => {
  it('prompt forbids repetitive greetings and invented catalog data', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'Trueno',
      currency: 'USD',
    });
    expect(prompt).toMatch(/NO vuelvas a saludar|historial/i);
    expect(prompt).toMatch(/1–3 frases/);
    expect(prompt).toMatch(/Nunca inventes productos/);
    expect(prompt).toMatch(/coordenadas|ubicación/i);
    expect(prompt).toMatch(/propose_open_checkout/);
  });
});
