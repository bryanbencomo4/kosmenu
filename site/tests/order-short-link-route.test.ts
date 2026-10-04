import { createHash } from 'node:crypto';

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  invitationStatus: null as string | null,
  invitationTokenHash: '',
  invitationPedidoId: '',
}));

vi.mock('server-only', () => ({}));
vi.mock('../app/api/_lib/supabase-server', () => ({
  getServiceSupabaseClient: () => ({
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        in: (column: string, values: string[]) => {
          filters[column] = values;
          return builder;
        },
        eq: (column: string, value: string) => {
          filters[column] = value;
          return builder;
        },
        limit: () => builder,
        maybeSingle: async () => {
          if (table === 'order_short_links') {
            return filters.code === 'AbCdEf1234'
              ? {
                  data: {
                    code: 'AbCdEf1234',
                    pedido_id: 'pedido-1',
                    order_id: 'EMXFA-000027',
                    comercio_id: 'comercio-1',
                    tracking_token_hash: 'x',
                  },
                  error: null,
                }
              : { data: null, error: null };
          }
          if (table === 'delivery_invitations') {
            const hashes = (filters.token_hash as string[]) ?? [];
            const matches =
              state.invitationStatus &&
              hashes.includes(state.invitationTokenHash) &&
              filters.pedido_id === state.invitationPedidoId;
            return { data: matches ? { status: state.invitationStatus } : null, error: null };
          }
          return { data: { detalles: {} }, error: null };
        },
      };
      return builder;
    },
  }),
}));

import { GET } from '../app/o/[code]/route';
import { GET as openProof } from '../app/p/[code]/route';
import { middleware } from '../middleware';

const TOKEN = 'courierTokenAbcdefghijklmnopqrstuvwxyz_0123';

function open(code: string, cookie?: string) {
  const request = new NextRequest(`https://elmenuxfa.com/o/${code}`, {
    headers: cookie ? { cookie } : {},
  });
  return GET(request, { params: Promise.resolve({ code }) });
}

describe('GET /o/[code]', () => {
  beforeEach(() => {
    state.invitationStatus = 'accepted';
    state.invitationTokenHash = createHash('sha256').update(TOKEN).digest('hex');
    state.invitationPedidoId = 'pedido-1';
  });

  it('sends the customer to tracking when no courier cookie exists', async () => {
    const response = await open('AbCdEf1234');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://elmenuxfa.com/orders/EMXFA-000027?s=AbCdEf1234',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('sends the accepted courier to the courier screen', async () => {
    const response = await open('AbCdEf1234', `elmenuxfa_courier=${TOKEN}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      `https://elmenuxfa.com/delivery/invite/${TOKEN}`,
    );
  });

  it('ignores a courier cookie from another order', async () => {
    state.invitationPedidoId = 'pedido-2';
    const response = await open('AbCdEf1234', `elmenuxfa_courier=${TOKEN}`);
    expect(response.headers.get('location')).toContain('/orders/EMXFA-000027?s=AbCdEf1234');
  });

  it('ignores a revoked courier and deletes only this link cookie', async () => {
    state.invitationStatus = 'revoked';
    const response = await open('AbCdEf1234', `elmenuxfa_courier=${TOKEN}`);
    expect(response.headers.get('location')).toContain('/orders/EMXFA-000027?s=AbCdEf1234');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('elmenuxfa_courier=;');
    expect(setCookie).toContain('Path=/o/AbCdEf1234');
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it('never touches cookies for active couriers or plain customers', async () => {
    expect((await open('AbCdEf1234', `elmenuxfa_courier=${TOKEN}`)).headers.get('set-cookie')).toBeNull();
    expect((await open('AbCdEf1234', 'elmenuxfa_order_AbCdEf1234=abc')).headers.get('set-cookie')).toBeNull();
  });

  it('returns 404 for unknown or malformed codes', async () => {
    expect((await open('ZZZZZZZZZZ')).status).toBe(404);
    expect((await open('%E0%A4%A')).status).toBe(404);
  });
});

describe('GET /p/[code]', () => {
  it('does not rewrite proof links to public menus', () => {
    const response = middleware(new NextRequest('https://elmenuxfa.com/p/AbCdEf1234'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
  it('redirects to the authenticated merchant viewer without exposing a proof URL', async () => {
    const response = await openProof(new Request('https://elmenuxfa.com/p/AbCdEf1234'), {
      params: Promise.resolve({ code: 'AbCdEf1234' }),
    });
    expect(response.status).toBe(302);
    const destination = new URL(response.headers.get('location')!);
    expect(destination.pathname).toBe('/orders/view/EMXFA-000027');
    expect(destination.searchParams.get('comprobante')).toBe('1');
    expect(destination.searchParams.get('shortCode')).toBe('AbCdEf1234');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(destination.toString()).not.toContain('storage');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('rejects unknown and malformed codes', async () => {
    for (const code of ['ZZZZZZZZZZ', 'bad', '%E0%A4%A']) {
      expect((await openProof(new Request('https://elmenuxfa.com/p/bad'), {
        params: Promise.resolve({ code }),
      })).status).toBe(404);
    }
  });
});
