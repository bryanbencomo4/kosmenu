import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  COURIER_ORDER_COOKIE,
  courierOrderCookie,
  resolveShortLinkAudience,
} from '../app/api/_lib/courier-order-link';

const COURIER_TOKEN = 'courierTokenAbcdefghijklmnopqrstuvwxyz_0123';
const CUSTOMER_TOKEN = 'customerTokenAbcdefghijklmnopqrstuvwxyz';
const PEDIDO_ID = '8f1c2a44-0000-4000-8000-000000000001';

function sha(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

type Invitation = { token_hash: string; pedido_id: string; status: string };

function fakeSupabase(options: {
  invitations?: Invitation[];
  customerHash?: string | null;
  invitationError?: boolean;
  throwOnInvitations?: boolean;
}) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const filters: { in?: [string, string[]]; eq: Array<[string, string]> } = { eq: [] };
      const builder = {
        select: () => builder,
        in: (column: string, values: string[]) => {
          filters.in = [column, values];
          return builder;
        },
        eq: (column: string, value: string) => {
          filters.eq.push([column, value]);
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => {
          if (table === 'delivery_invitations') {
            if (options.throwOnInvitations) throw new Error('network down');
            if (options.invitationError) return { data: null, error: { message: 'boom' } };
            const hashes = filters.in?.[1] ?? [];
            const pedidoId = filters.eq.find(([column]) => column === 'pedido_id')?.[1];
            const match = (options.invitations ?? []).find(
              (row) => hashes.includes(row.token_hash) && row.pedido_id === pedidoId,
            );
            return { data: match ? { status: match.status } : null, error: null };
          }
          if (table === 'pedidos') {
            return {
              data: { detalles: { customer_access_token_hash: options.customerHash ?? null } },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };
  return { supabase: client as unknown as SupabaseClient, calls };
}

const shortLink = { pedido_id: PEDIDO_ID };

describe('courierOrderCookie', () => {
  it('scopes the cookie to the single short link path', () => {
    expect(courierOrderCookie('AbCdEf1234', COURIER_TOKEN)).toEqual({
      name: COURIER_ORDER_COOKIE,
      value: COURIER_TOKEN,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/o/AbCdEf1234',
      maxAge: 60 * 60 * 48,
    });
  });

  it('refuses malformed short codes or tokens', () => {
    expect(courierOrderCookie('../evil', COURIER_TOKEN)).toBeNull();
    expect(courierOrderCookie('AbCdEf1234', 'short')).toBeNull();
    expect(courierOrderCookie('AbCdEf1234', 'bad;token=x'.padEnd(30, 'a'))).toBeNull();
  });
});

describe('resolveShortLinkAudience', () => {
  it('sends visitors without a courier cookie to the customer view without querying', async () => {
    const { supabase, calls } = fakeSupabase({});
    await expect(resolveShortLinkAudience({ supabase, shortLink })).resolves.toEqual({
      target: 'customer',
    });
    expect(calls).toEqual([]);
  });

  it.each(['accepted', 'arrived'])('sends an %s courier to the courier screen', async (status) => {
    const { supabase } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: PEDIDO_ID, status }],
    });
    await expect(
      resolveShortLinkAudience({ supabase, shortLink, courierToken: COURIER_TOKEN }),
    ).resolves.toEqual({ target: 'courier', token: COURIER_TOKEN });
  });

  it('prefers the courier screen even if the same browser also holds the customer cookie', async () => {
    const { supabase } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: PEDIDO_ID, status: 'accepted' }],
      customerHash: sha(CUSTOMER_TOKEN),
    });
    await expect(
      resolveShortLinkAudience({
        supabase,
        shortLink,
        courierToken: COURIER_TOKEN,
        customerToken: CUSTOMER_TOKEN,
      }),
    ).resolves.toEqual({ target: 'courier', token: COURIER_TOKEN });
  });

  it('ignores and clears a courier cookie that belongs to another order', async () => {
    const { supabase } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: 'other-pedido', status: 'accepted' }],
    });
    await expect(
      resolveShortLinkAudience({ supabase, shortLink, courierToken: COURIER_TOKEN }),
    ).resolves.toEqual({ target: 'customer', clearCourierCookie: true });
  });

  it.each(['pending', 'revoked', 'expired'])('ignores and clears a %s invitation', async (status) => {
    const { supabase } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: PEDIDO_ID, status }],
    });
    await expect(
      resolveShortLinkAudience({ supabase, shortLink, courierToken: COURIER_TOKEN }),
    ).resolves.toEqual({ target: 'customer', clearCourierCookie: true });
  });

  it('routes each concurrent delivery to its own courier screen', async () => {
    const tokenA = COURIER_TOKEN;
    const tokenB = 'secondCourierTokenAbcdefghijklmnopqrstuvwxyz';
    const { supabase } = fakeSupabase({
      invitations: [
        { token_hash: sha(tokenA), pedido_id: 'pedido-a', status: 'accepted' },
        { token_hash: sha(tokenB), pedido_id: 'pedido-b', status: 'arrived' },
      ],
    });

    await expect(
      resolveShortLinkAudience({ supabase, shortLink: { pedido_id: 'pedido-a' }, courierToken: tokenA }),
    ).resolves.toEqual({ target: 'courier', token: tokenA });
    await expect(
      resolveShortLinkAudience({ supabase, shortLink: { pedido_id: 'pedido-b' }, courierToken: tokenB }),
    ).resolves.toEqual({ target: 'courier', token: tokenB });
    await expect(
      resolveShortLinkAudience({ supabase, shortLink: { pedido_id: 'pedido-b' }, courierToken: tokenA }),
    ).resolves.toEqual({ target: 'customer', clearCourierCookie: true });
  });

  it('treats a courier as a normal customer on an order they placed themselves', async () => {
    const { supabase, calls } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: 'delivering-pedido', status: 'accepted' }],
      customerHash: sha(CUSTOMER_TOKEN),
    });
    await expect(
      resolveShortLinkAudience({
        supabase,
        shortLink: { pedido_id: 'own-pedido' },
        courierToken: null,
        customerToken: CUSTOMER_TOKEN,
      }),
    ).resolves.toEqual({ target: 'customer' });
    expect(calls).toEqual([]);
  });

  it('keeps a completed courier on the courier screen', async () => {
    const { supabase } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: PEDIDO_ID, status: 'completed' }],
      customerHash: sha(CUSTOMER_TOKEN),
    });
    await expect(
      resolveShortLinkAudience({ supabase, shortLink, courierToken: COURIER_TOKEN }),
    ).resolves.toEqual({ target: 'courier', token: COURIER_TOKEN });
  });

  it('lets the real customer see a completed order on a shared device', async () => {
    const { supabase } = fakeSupabase({
      invitations: [{ token_hash: sha(COURIER_TOKEN), pedido_id: PEDIDO_ID, status: 'completed' }],
      customerHash: sha(CUSTOMER_TOKEN),
    });
    await expect(
      resolveShortLinkAudience({
        supabase,
        shortLink,
        courierToken: COURIER_TOKEN,
        customerToken: CUSTOMER_TOKEN,
      }),
    ).resolves.toEqual({ target: 'customer' });
  });

  it('rejects malformed cookies without querying', async () => {
    const { supabase, calls } = fakeSupabase({});
    await expect(
      resolveShortLinkAudience({ supabase, shortLink, courierToken: 'x' }),
    ).resolves.toEqual({ target: 'customer', clearCourierCookie: true });
    expect(calls).toEqual([]);
  });

  it('falls back to the customer view on database errors without clearing the cookie', async () => {
    const errored = fakeSupabase({ invitationError: true });
    await expect(
      resolveShortLinkAudience({
        supabase: errored.supabase,
        shortLink,
        courierToken: COURIER_TOKEN,
      }),
    ).resolves.toEqual({ target: 'customer', clearCourierCookie: false });

    const thrown = fakeSupabase({ throwOnInvitations: true });
    await expect(
      resolveShortLinkAudience({
        supabase: thrown.supabase,
        shortLink,
        courierToken: COURIER_TOKEN,
      }),
    ).resolves.toEqual({ target: 'customer' });
  });
});
