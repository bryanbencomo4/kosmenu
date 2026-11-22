import { describe, expect, it } from 'vitest';

import {
  buildChatbotDemoReply,
  buildChatbotWelcomeMessage,
  isChatbotPreviewEnabled,
  isChatbotQueryEnabled,
  shouldOpenChatbotFromQuery,
} from '../app/_lib/chatbot-preview';

describe('chatbot preview gate', () => {
  it('enables preview outside production by default', () => {
    expect(
      isChatbotPreviewEnabled({ nodeEnv: 'development', publicPreviewFlag: null }),
    ).toBe(true);
    expect(
      isChatbotPreviewEnabled({ nodeEnv: 'test', publicPreviewFlag: undefined }),
    ).toBe(true);
  });

  it('keeps production off unless NEXT_PUBLIC_CHATBOT_PREVIEW is set', () => {
    expect(
      isChatbotPreviewEnabled({ nodeEnv: 'production', publicPreviewFlag: null }),
    ).toBe(false);
    expect(
      isChatbotPreviewEnabled({ nodeEnv: 'production', publicPreviewFlag: '0' }),
    ).toBe(false);
    expect(
      isChatbotPreviewEnabled({ nodeEnv: 'production', publicPreviewFlag: '1' }),
    ).toBe(true);
  });

  it('only treats chatbot=1 as the open signal', () => {
    expect(isChatbotQueryEnabled('1')).toBe(true);
    expect(isChatbotQueryEnabled('true')).toBe(false);
    expect(isChatbotQueryEnabled(null)).toBe(false);
  });

  it('opens the assistant when preview is on and there is no conflicting mode', () => {
    expect(
      shouldOpenChatbotFromQuery({
        chatbot: '1',
        mode: null,
        catalogForced: false,
        previewEnabled: true,
      }),
    ).toEqual({ open: true });
  });

  it('gives assisted and catalog priority over chatbot=1', () => {
    expect(
      shouldOpenChatbotFromQuery({
        chatbot: '1',
        mode: 'assisted',
        catalogForced: false,
        previewEnabled: true,
      }),
    ).toEqual({ open: false, reason: 'assisted_priority' });

    expect(
      shouldOpenChatbotFromQuery({
        chatbot: '1',
        mode: null,
        catalogForced: true,
        previewEnabled: true,
      }),
    ).toEqual({ open: false, reason: 'catalog_priority' });
  });

  it('does not open in production when the preview flag is off', () => {
    expect(
      shouldOpenChatbotFromQuery({
        chatbot: '1',
        previewEnabled: false,
      }),
    ).toEqual({ open: false, reason: 'preview_disabled' });
  });

  it('builds welcome and demo copy from the real restaurant name', () => {
    const welcome = buildChatbotWelcomeMessage('Lunetz');
    expect(welcome).toContain('Lunetz');
    expect(welcome).toMatch(/asistente virtual/i);
    expect(welcome).not.toMatch(/solo se agregan al carrito/i);
    expect(welcome).not.toContain('Napoles');

    const reply = buildChatbotDemoReply('¿Cuánto cuesta la pizza?', 'Lunetz');
    expect(reply).toContain('Lunetz');
    expect(reply).toContain('¿Cuánto cuesta la pizza?');
    expect(reply.toLowerCase()).toContain('inteligencia artificial');
    expect(reply.toLowerCase()).toContain('demostración');
    expect(reply).not.toMatch(/\$\s*\d/);
  });
});
