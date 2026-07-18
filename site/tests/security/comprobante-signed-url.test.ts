import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractComprobanteObjectPath } from '../../app/api/_lib/comprobante-path';
import { resetRateLimitStoreForTests } from '../../app/api/_lib/rate-limit';

describe('comprobante path validation', () => {
  it('accepts controlled storage refs', () => {
    const path = extractComprobanteObjectPath(
      'storage://comprobantes/11111111-1111-1111-1111-111111111111/abc123-proof.jpg',
    );
    expect(path).toBe('11111111-1111-1111-1111-111111111111/abc123-proof.jpg');
  });

  it('rejects other buckets, traversal, and external URLs', () => {
    expect(extractComprobanteObjectPath('storage://other/x/y.jpg')).toBeNull();
    expect(extractComprobanteObjectPath('storage://comprobantes/../etc/passwd')).toBeNull();
    expect(extractComprobanteObjectPath('storage://comprobantes//etc/passwd')).toBeNull();
    expect(extractComprobanteObjectPath('https://evil.example/x.jpg')).toBeNull();
    expect(extractComprobanteObjectPath('storage://comprobantes/')).toBeNull();
    expect(extractComprobanteObjectPath('')).toBeNull();
  });
});

describe('GET /api/business/orders/[orderId]/comprobante', () => {
  const SERVICE_ROLE = 'service-role-secret-for-tests-only';
  const ANON = 'anon-key-for-tests-only';

  beforeEach(() => {
    resetRateLimitStoreForTests();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadRoute(opts: {
    userId?: string | null;
    orderOwnerId?: string;
    orderComercioId?: string;
    storageRef?: string | null;
  }) {
    const userId = opts.userId;
    const orderComercioId = opts.orderComercioId ?? 'comercio-a';
    const orderOwnerId = opts.orderOwnerId ?? 'user-owner';
    const storageRef =
      opts.storageRef === undefined
        ? `storage://comprobantes/${orderComercioId}/file-proof.jpg`
        : opts.storageRef;

    vi.doMock('../../app/api/_lib/supabase-user-auth', () => ({
      getUserFromBearerRequest: async () => (userId ? { id: userId } : null),
    }));

    const signedUrl = 'https://example.supabase.co/storage/v1/object/sign/comprobantes/x?token=test';
    vi.doMock('../../app/api/_lib/comprobante-storage', async () => {
      const actual = await vi.importActual<typeof import('../../app/api/_lib/comprobante-storage')>(
        '../../app/api/_lib/comprobante-storage',
      );
      return {
        ...actual,
        createComprobanteSignedUrl: async () => signedUrl,
        COMPROBANTE_SIGNED_URL_TTL_SEC: 300,
      };
    });

    const rows = [
      {
        id: 'row-1',
        comercio_id: orderComercioId,
        detalles: {
          order_id: 'comercio-a-1710000000000',
          comprobante_url: storageRef,
        },
      },
    ];

    const listQuery = {
      eq: vi.fn(async () => ({ data: rows, error: null })),
      then: (resolve: (v: { data: typeof rows; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };

    vi.doMock('../../app/api/_lib/supabase-server', () => ({
      getServiceSupabaseClient: () => ({
        from: (table: string) => {
          if (table === 'pedidos') {
            return {
              select: () => ({
                order: () => ({
                  limit: () => listQuery,
                }),
              }),
            };
          }
          if (table === 'comercios') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: orderComercioId, owner_id: orderOwnerId },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      }),
    }));

    return import('../../app/api/business/orders/[orderId]/comprobante/route');
  }

  it('rejects unauthenticated users', async () => {
    const { GET } = await loadRoute({ userId: null });
    const response = await GET(new Request('http://localhost/api/business/orders/x/comprobante'), {
      params: Promise.resolve({ orderId: 'comercio-a-1710000000000' }),
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(SERVICE_ROLE);
    expect(JSON.stringify(body)).not.toContain(ANON);
  });

  it('rejects wrong owner with generic 404', async () => {
    const { GET } = await loadRoute({ userId: 'other-user', orderOwnerId: 'user-owner' });
    const response = await GET(
      new Request('http://localhost/api/business/orders/comercio-a-1710000000000/comprobante', {
        headers: { Authorization: 'Bearer test-token-abcdefghijklmnopqrstuvwxyz' },
      }),
      { params: Promise.resolve({ orderId: 'comercio-a-1710000000000' }) },
    );
    expect(response.status).toBe(404);
  });

  it('rejects other-bucket storage refs', async () => {
    const { GET } = await loadRoute({
      userId: 'user-owner',
      storageRef: 'storage://product-images/x/y.jpg',
    });
    const response = await GET(
      new Request('http://localhost/api/business/orders/comercio-a-1710000000000/comprobante', {
        headers: { Authorization: 'Bearer test-token-abcdefghijklmnopqrstuvwxyz' },
      }),
      { params: Promise.resolve({ orderId: 'comercio-a-1710000000000' }) },
    );
    expect(response.status).toBe(404);
  });

  it('returns short-lived signed url for owner', async () => {
    const { GET } = await loadRoute({ userId: 'user-owner' });
    const response = await GET(
      new Request('http://localhost/api/business/orders/comercio-a-1710000000000/comprobante', {
        headers: { Authorization: 'Bearer test-token-abcdefghijklmnopqrstuvwxyz' },
      }),
      { params: Promise.resolve({ orderId: 'comercio-a-1710000000000' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.expiresInSec).toBeLessThanOrEqual(300);
    expect(body.data.url).toContain('https://');
    expect(JSON.stringify(body)).not.toContain(SERVICE_ROLE);
  });
});
