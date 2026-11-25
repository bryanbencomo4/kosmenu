import { afterEach, describe, expect, it } from 'vitest';

import {
  __setBusinessGeminiClassifierForTests,
  isBusinessGeminiEnabled,
  mapGeminiClassifyToTurn,
} from '../app/api/asistente-negocio/_lib/gemini-nlu';
import { isConcreteBusinessIntent, parseBusinessIntent } from '../app/api/asistente-negocio/_lib/intents';

describe('business gemini nlu', () => {
  afterEach(() => {
    __setBusinessGeminiClassifierForTests(null);
  });

  it('stays off without API key', () => {
    expect(isBusinessGeminiEnabled({ GEMINI_API_KEY: '', BUSINESS_ASSISTANT_GEMINI: '1' })).toBe(
      false,
    );
  });

  it('can be disabled explicitly even with key', () => {
    expect(
      isBusinessGeminiEnabled({
        GEMINI_API_KEY: 'x',
        BUSINESS_ASSISTANT_GEMINI: '0',
      }),
    ).toBe(false);
  });

  it('maps propose_price safely', () => {
    const turn = mapGeminiClassifyToTurn({
      intent: 'propose_price',
      productHint: 'Margarita',
      newPrice: 12,
    });
    expect(turn?.intent).toEqual({
      kind: 'propose_price',
      productHint: 'Margarita',
      newPrice: 12,
    });
  });

  it('maps chat reply and strips urls', () => {
    const turn = mapGeminiClassifyToTurn({
      intent: 'chat',
      reply: 'Dale 😊 mira https://app.elmenuxfa.com/panel la barra',
    });
    expect(turn?.intent.kind).toBe('chat');
    expect(turn?.reply).toMatch(/Dale/);
    expect(turn?.reply).not.toMatch(/https?:\/\//);
  });

  it('rejects unknown intents', () => {
    expect(mapGeminiClassifyToTurn({ intent: 'delete_database' })).toBeNull();
  });

  it('rules stay concrete for chip phrases (Gemini skipped)', () => {
    expect(isConcreteBusinessIntent(parseBusinessIntent('ver menú'))).toBe(true);
    expect(isConcreteBusinessIntent(parseBusinessIntent('cambiar precio'))).toBe(true);
    expect(isConcreteBusinessIntent(parseBusinessIntent('hola qué tal'))).toBe(false);
  });

  it('does not open menu for “otro menú / otro negocio”', () => {
    expect(
      parseBusinessIntent('es posible crear otro menú para mi otro negocio ?').kind,
    ).toBe('register');
    expect(parseBusinessIntent('quiero otro negocio').kind).toBe('register');
  });

  it('maps help with reply to chat; bare help stays help (no escalate)', () => {
    const withReply = mapGeminiClassifyToTurn({
      intent: 'help',
      reply: 'Puedo ayudarte con menú y precios 😊',
    });
    expect(withReply?.intent.kind).toBe('chat');
    expect(mapGeminiClassifyToTurn({ intent: 'help' })?.intent.kind).toBe('help');
  });

  it('maps account intent', () => {
    expect(mapGeminiClassifyToTurn({ intent: 'account', mode: 'password' })?.intent).toEqual({
      kind: 'account',
      mode: 'password',
    });
  });
});
