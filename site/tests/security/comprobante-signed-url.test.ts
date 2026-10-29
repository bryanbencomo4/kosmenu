import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { extractComprobanteObjectPath } from '../../app/api/_lib/comprobante-path';
import { planComprobanteView } from '../../app/api/_lib/comprobante-storage';
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

describe('comprobante view plan', () => {
  it('previews images and keeps pdfs as the original file', () => {
    const image = planComprobanteView('comercio/proof.jpg', 'ORD-1');
    expect(image.preview).toEqual({ width: 800, quality: 66 });
    expect(image.downloadName).toBe('comprobante-ORD-1.jpg');

    const pdf = planComprobanteView('comercio/proof.pdf', 'pedido 99');
    expect(pdf.preview).toBeNull();
    expect(pdf.downloadName).toBe('comprobante-pedido99.pdf');
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

  it('returns same-origin proxied media urls for owner', async () => {
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
    expect(body.data.url).toContain('/api/business/orders/');
    expect(body.data.url).toContain('v=file');
    expect(body.data.url).not.toContain('supabase.co');
    expect(body.data.previewUrl).toContain('v=preview');
    expect(body.data.downloadUrl).toContain('v=download');
    expect(body.data.url).toContain('sig=');
    expect(JSON.stringify(body)).not.toContain(SERVICE_ROLE);
  });

  it('does not attach an image preview to pdf proofs', async () => {
    const { GET } = await loadRoute({
      userId: 'user-owner',
      storageRef: 'storage://comprobantes/comercio-a/file-proof.pdf',
    });
    const response = await GET(
      new Request('http://localhost/api/business/orders/comercio-a-1710000000000/comprobante', {
        headers: { Authorization: 'Bearer test-token-abcdefghijklmnopqrstuvwxyz' },
      }),
      { params: Promise.resolve({ orderId: 'comercio-a-1710000000000' }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.previewUrl).toBeUndefined();
    expect(body.data.url).toContain('v=file');
    expect(body.data.downloadUrl).toContain('v=download');
    expect(body.data.url).not.toContain('supabase.co');
  });

  it('allows the merchant app to preflight the signed-url request', async () => {
    const { OPTIONS } = await loadRoute({ userId: 'user-owner' });
    const response = await OPTIONS(
      new Request('http://localhost/api/business/orders/x/comprobante', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.elmenuxfa.com',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization',
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.elmenuxfa.com',
    );
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'authorization',
    );
  });

  it('does not reflect an untrusted origin', async () => {
    const { OPTIONS } = await loadRoute({ userId: 'user-owner' });
    const response = await OPTIONS(
      new Request('http://localhost/api/business/orders/x/comprobante', {
        method: 'OPTIONS',
        headers: { Origin: 'https://untrusted.example' },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('includes CORS headers on the authorized signed-url response', async () => {
    const { GET } = await loadRoute({ userId: 'user-owner' });
    const response = await GET(
      new Request('http://localhost/api/business/orders/comercio-a-1710000000000/comprobante', {
        headers: {
          Authorization: 'Bearer test-token-abcdefghijklmnopqrstuvwxyz',
          Origin: 'https://app.elmenuxfa.com',
        },
      }),
      { params: Promise.resolve({ orderId: 'comercio-a-1710000000000' }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.elmenuxfa.com',
    );
  });
});
