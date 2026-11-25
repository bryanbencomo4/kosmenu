import { beforeEach, describe, expect, it } from 'vitest';

import {
  __resetConfirmNoncesForTests,
  consumeConfirmNonce,
  issueConfirmToken,
  verifyConfirmToken,
} from '../app/api/asistente-negocio/_lib/confirm';
import { parseBusinessIntent } from '../app/api/asistente-negocio/_lib/intents';

describe('business assistant confirm tokens', () => {
  beforeEach(() => {
    __resetConfirmNoncesForTests();
  });

  it('issues and verifies scoped token', () => {
    const issued = issueConfirmToken(
      {
        op: 'set_price',
        userId: 'user-1',
        comercioId: 'shop-1',
        data: { productId: 'p1', newPrice: 12 },
      },
      60_000,
      1_000,
    );
    const ok = verifyConfirmToken(
      issued.token,
      { userId: 'user-1', comercioId: 'shop-1' },
      1_500,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.payload.data.newPrice).toBe(12);
      expect(ok.nonce).toBeTruthy();
    }
  });

  it('rejects wrong user/comercio and replay', () => {
    const issued = issueConfirmToken(
      {
        op: 'set_en_linea',
        userId: 'user-1',
        comercioId: 'shop-1',
        data: { enLinea: true },
      },
      60_000,
      1_000,
    );
    const wrong = verifyConfirmToken(
      issued.token,
      { userId: 'user-2', comercioId: 'shop-1' },
      1_500,
    );
    expect(wrong.ok).toBe(false);

    const first = verifyConfirmToken(
      issued.token,
      { userId: 'user-1', comercioId: 'shop-1' },
      1_500,
    );
    expect(first.ok).toBe(true);
    if (first.ok) consumeConfirmNonce(first.nonce, first.expiresAt);
    const replay = verifyConfirmToken(
      issued.token,
      { userId: 'user-1', comercioId: 'shop-1' },
      1_600,
    );
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.error).toBe('replay');
  });

  it('rejects expired tokens', () => {
    const issued = issueConfirmToken(
      {
        op: 'set_hours',
        userId: 'user-1',
        comercioId: 'shop-1',
        data: { hoursText: '10-22' },
      },
      1_000,
      1_000,
    );
    const expired = verifyConfirmToken(
      issued.token,
      { userId: 'user-1', comercioId: 'shop-1' },
      5_000,
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toBe('expired');
  });
});

describe('business assistant intents', () => {
  it('parses admin intents without food-discovery wording', () => {
    expect(parseBusinessIntent('ver menú').kind).toBe('list_menu');
    expect(parseBusinessIntent('cambiar precio margarita a 12').kind).toBe(
      'propose_price',
    );
    expect(parseBusinessIntent('cerrar local').kind).toBe('propose_en_linea');
    expect(parseBusinessIntent('pedidos recientes').kind).toBe('recent_orders');
    expect(parseBusinessIntent('confirmar').kind).toBe('confirm_apply');
  });
});
