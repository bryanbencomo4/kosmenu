import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateEq = vi.fn();
const updateSelect = vi.fn();
const updateMaybeSingle = vi.fn();

vi.mock('../app/api/_lib/supabase-server', () => ({
  getServiceSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'productos') {
        return {
          update: (payload: Record<string, unknown>) => {
            updateEq(payload);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => {
                    updateSelect();
                    return {
                      maybeSingle: async () => {
                        updateMaybeSingle();
                        return {
                          data: {
                            id: 'prod-1',
                            nombre: 'Margarita',
                            precio: 12,
                            disponible: true,
                          },
                          error: null,
                        };
                      },
                    };
                  },
                }),
              }),
            };
          },
        };
      }
      return {
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };
    },
  }),
}));

import {
  __resetConfirmNoncesForTests,
  issueConfirmToken,
} from '../app/api/asistente-negocio/_lib/confirm';
import { applyConfirm } from '../app/api/asistente-negocio/_lib/tools';

describe('business assistant applyConfirm', () => {
  beforeEach(() => {
    __resetConfirmNoncesForTests();
    updateEq.mockClear();
    updateSelect.mockClear();
    updateMaybeSingle.mockClear();
  });

  it('applies set_price only for member shop and consumes nonce', async () => {
    const issued = issueConfirmToken(
      {
        op: 'set_price',
        userId: 'user-1',
        comercioId: 'shop-1',
        data: { productId: 'prod-1', newPrice: 12, productName: 'Margarita' },
      },
      60_000,
    );

    const first = await applyConfirm({
      userId: 'user-1',
      shops: [
        {
          comercioId: 'shop-1',
          nombre: 'Trueno',
          slug: 'pizzas-el-trueno',
          role: 'owner',
          moneda: 'USD',
          tasa: null,
          enLinea: true,
          horarios: null,
        },
      ],
      token: issued.token,
    });
    expect(first.text).toMatch(/Listo|Margarita|12/i);
    expect(first.auditId).toBeTruthy();
    expect(updateEq).toHaveBeenCalled();

    const replay = await applyConfirm({
      userId: 'user-1',
      shops: [
        {
          comercioId: 'shop-1',
          nombre: 'Trueno',
          slug: 'pizzas-el-trueno',
          role: 'owner',
          moneda: 'USD',
          tasa: null,
          enLinea: true,
          horarios: null,
        },
      ],
      token: issued.token,
    });
    expect(replay.text).toMatch(/replay|nueva/i);
  });

  it('rejects apply for non-member comercio', async () => {
    const issued = issueConfirmToken(
      {
        op: 'set_price',
        userId: 'user-1',
        comercioId: 'shop-other',
        data: { productId: 'prod-1', newPrice: 9 },
      },
      60_000,
    );
    const result = await applyConfirm({
      userId: 'user-1',
      shops: [
        {
          comercioId: 'shop-1',
          nombre: 'Trueno',
          slug: 'pizzas-el-trueno',
          role: 'owner',
          moneda: 'USD',
          tasa: null,
          enLinea: true,
          horarios: null,
        },
      ],
      token: issued.token,
    });
    expect(result.text).toMatch(/no es válida|sesión|negocio/i);
    expect(updateEq).not.toHaveBeenCalled();
  });
});
