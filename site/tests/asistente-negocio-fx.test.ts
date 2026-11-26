import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state: { row: Row; updates: Row[] } = { row: {}, updates: [] };

vi.mock('../app/api/_lib/supabase-server', () => ({
  getServiceSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
      update: (patch: Row) => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => {
              state.updates.push(patch);
              state.row = { ...state.row, ...patch };
              return { data: { id: 'shop-1', nombre: 'Pizzas El Trueno' }, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

import {
  detectFxCurrency,
  extractFxValue,
  parseLocaleNumber,
} from '../app/api/asistente-negocio/_lib/fx';
import {
  inferFollowUpIntent,
  parseBusinessIntent,
} from '../app/api/asistente-negocio/_lib/intents';
import { __resetConfirmNoncesForTests } from '../app/api/asistente-negocio/_lib/confirm';
import { proposeSetTasa } from '../app/api/asistente-negocio/_lib/propose-extended';
import { applyConfirm } from '../app/api/asistente-negocio/_lib/tools';

const shop = {
  comercioId: 'shop-1',
  nombre: 'Pizzas El Trueno',
  slug: 'pizzas-el-trueno',
  role: 'owner',
  moneda: 'USD',
  tasa: '3200',
  enLinea: true,
  horarios: null,
};

describe('fx parsing', () => {
  it('parses locale numbers', () => {
    expect(parseLocaleNumber('5000')).toBe(5000);
    expect(parseLocaleNumber('5.000')).toBe(5000);
    expect(parseLocaleNumber('5,000')).toBe(5000);
    expect(parseLocaleNumber('3.200,50')).toBe(3200.5);
    expect(parseLocaleNumber('42,5')).toBe(42.5);
    expect(parseLocaleNumber('42.5')).toBe(42.5);
  });
  it('extracts value and currency from natural phrases', () => {
    expect(extractFxValue('quiero recibir el peso a 5000')).toBe(5000);
    expect(detectFxCurrency('quiero recibir el peso a 5000', 'USD')).toBe('COP');
    expect(detectFxCurrency('el dólar a 45 bolívares', 'USD')).toBe('VES');
  });
});

describe('intents for the screenshot case', () => {
  it('routes "recibir el peso a 5000" to currency, not product price', () => {
    const intent = parseBusinessIntent('quiero recibir el peso a 5000', { pendingOp: 'edit_price' });
    expect(intent).toEqual({ kind: 'currency', setValue: 5000 });
  });
  it('does not force a product price on a greeting', () => {
    expect(parseBusinessIntent('hola', { pendingOp: 'edit_price' }).kind).not.toBe('propose_price');
  });
  it('keeps a price phrase as price', () => {
    expect(parseBusinessIntent('cambia el precio de la pizza margarita a 12 pesos').kind).toBe(
      'propose_price',
    );
  });
  it('continues a rate question with a bare number or currency', () => {
    expect(inferFollowUpIntent('5000', '💱 Dime el nuevo valor, por ejemplo: “pesos a 4.000”.')).toEqual({
      kind: 'currency',
      setValue: 5000,
    });
    expect(
      inferFollowUpIntent('en pesos', '¿La tasa de cuál moneda cambiamos a *5.000*?', [
        'quiero cambiar la tasa a 5000',
      ]),
    ).toEqual({ kind: 'currency', setValue: 5000 });
  });
});

describe('set rate flow (propose + apply)', () => {
  beforeEach(() => {
    __resetConfirmNoncesForTests();
    state.updates = [];
    state.row = {
      moneda: 'USD',
      exchange_rate_value: 3200,
      exchange_rate_mode: 'manual',
      exchange_rate_quote_currency: 'COP',
      tasa_cambio_pesos: 3200,
      branding_ia: { config_negocio: { checkout_currencies: ['USD', 'COP'], exchange_rates: { COP: 3200 } } },
    };
  });

  it('proposes COP 3.200 → 5.000 and applies it on the right fields', async () => {
    const res = await proposeSetTasa('user-1', shop, 'quiero recibir el peso a 5000', { value: 5000 });
    expect(res.proposal?.action).toBe('set_tasa');
    expect(res.text).toMatch(/3\.200/);
    expect(res.text).toMatch(/5\.000/);
    expect(res.text).toMatch(/COP/);

    const applied = await applyConfirm({
      userId: 'user-1',
      shops: [shop],
      token: res.proposal!.confirmToken,
    });
    expect(applied.text).toMatch(/Tasa actualizada/);
    const patch = state.updates[0]!;
    expect(patch.exchange_rate_value).toBe(5000);
    expect(patch.tasa_cambio_pesos).toBe(5000);
    expect(patch.exchange_rate_mode).toBe('manual');
    const cfg = (patch.branding_ia as { config_negocio: { exchange_rates: Record<string, number> } })
      .config_negocio;
    expect(cfg.exchange_rates.COP).toBe(5000);
  });

  it('asks for the value and lists current rates when none is given', async () => {
    const res = await proposeSetTasa('user-1', shop, 'cambiar la tasa');
    expect(res.proposal).toBeUndefined();
    expect(res.text).toMatch(/3\.200/);
  });

  it('does not touch anything when the value is already set', async () => {
    const res = await proposeSetTasa('user-1', shop, 'pesos a 3200', { value: 3200 });
    expect(res.proposal).toBeUndefined();
    expect(res.text).toMatch(/ya está/i);
  });
});
