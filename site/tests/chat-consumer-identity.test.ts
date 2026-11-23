import { describe, expect, it } from 'vitest';

import {
  buildConsumerLabel,
  buildSoftIdentityAskText,
  extractNameFromText,
  extractWhatsappFromText,
  matchIdentityDecline,
  parseIdentityReply,
  shouldAskForIdentity,
} from '../app/v/[id]/_components/chat/chat-consumer-identity';
import { buildChatbotWelcomeMessage } from '../app/_lib/chatbot-preview';

describe('chat consumer identity', () => {
  it('asks softly and personalizes welcome when name is known', () => {
    expect(buildSoftIdentityAskText()).toMatch(/WhatsApp/i);
    expect(buildSoftIdentityAskText()).toMatch(/si prefieres no/i);
    expect(buildChatbotWelcomeMessage('Trueno', { guestName: 'María' })).toMatch(
      /Hola, María/,
    );
    expect(buildChatbotWelcomeMessage('Trueno')).toMatch(/¡Hola!/);
  });

  it('parses name, phone and declines', () => {
    expect(extractNameFromText('Me llamo Bryan')).toBe('Bryan');
    expect(extractNameFromText('María López')).toBe('María López');
    expect(extractWhatsappFromText('04141234567')).toMatch(/^\+58414/);
    expect(extractWhatsappFromText('mi wa es +58 414 1234567')).toMatch(
      /^\+58414/,
    );
    expect(matchIdentityDecline('luego, gracias')).toBe(true);
    expect(matchIdentityDecline('quiero una hawaiana')).toBe(false);

    const parsed = parseIdentityReply('Soy Ana 04141234567');
    expect(parsed.name).toBe('Ana');
    expect(parsed.whatsapp).toMatch(/^\+58/);
    expect(buildConsumerLabel(parsed)).toMatch(/Ana/);
  });

  it('only asks when name is missing and not declined', () => {
    expect(shouldAskForIdentity(null)).toBe(true);
    expect(
      shouldAskForIdentity({
        name: '',
        whatsapp: '',
        askedAt: new Date().toISOString(),
      }),
    ).toBe(false);
    expect(
      shouldAskForIdentity({
        name: 'Ana',
        whatsapp: '',
      }),
    ).toBe(false);
    expect(
      shouldAskForIdentity({
        name: '',
        whatsapp: '',
        declinedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });
});
