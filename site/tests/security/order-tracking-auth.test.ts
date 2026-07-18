import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  generatePublicTrackingToken,
  hashPublicTrackingToken,
  maskTrackingToken,
  verifyPublicTrackingToken,
} from '../../app/api/_lib/order-tracking-token';
import {
  assertCustomerStatusTransition,
  customerOrderActionSchema,
} from '../../app/api/_lib/order-customer-actions';
import { toPublicOrderTrackingResponse } from '../../app/api/_lib/public-order';
import { validateComprobanteFile } from '../../app/api/_lib/comprobante-upload';
import { resetRateLimitStoreForTests } from '../../app/api/_lib/rate-limit';
import {
  resolveSafeTrackingUrl,
  sendOrderRequestSchema,
} from '../../app/api/_lib/send-order-validation';

const SERVICE_ROLE = 'service-role-secret-for-tests-only';
const ANON_KEY = 'anon-key-for-tests-only';

function buildPedido(overrides?: {
  orderId?: string;
  token?: string;
  email?: string;
  phone?: string;
  address?: string;
  estado?: string;
}) {
  const orderId = overrides?.orderId ?? 'comercio-demo-1710000000000';
  const token = overrides?.token ?? generatePublicTrackingToken();
  const hash = hashPublicTrackingToken(token);
  return {
    token,
    hash,
    row: {
      id: 'row-1',
      comercio_id: 'comercio-demo',
      estado: overrides?.estado ?? 'pendiente',
      created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      total: 25,
      costo_delivery: 2,
      public_tracking_token_hash: hash,
      cliente_email: overrides?.email ?? 'secret@example.com',
      telefono_cliente: overrides?.phone ?? '+573001112233',
      detalles: {
        order_id: orderId,
        public_tracking_token_hash: hash,
        cliente_email: overrides?.email ?? 'secret@example.com',
        telefono_cliente: overrides?.phone ?? '+573001112233',
        subtotal: 23,
        items: [{ nombre: 'Arepa', cantidad: 2, precio: 10 }],
        delivery: {
          mode: 'delivery',
          address: overrides?.address ?? 'Calle secreta 123',
        },
        notifications: { whatsapp_enabled: true },
      },
    },
  };
}

describe('public tracking token crypto', () => {
  it('generates high-entropy tokens and verifies hashed storage', () => {
    const token = generatePublicTrackingToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    const hash = hashPublicTrackingToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPublicTrackingToken(token, hash)).toBe(true);
    expect(verifyPublicTrackingToken('wrong', hash)).toBe(false);
    expect(maskTrackingToken(token)).not.toContain(token);
  });
});

describe('public order response scrubbing', () => {
  it('does not expose email, phone, tokens, address, coords, or payment proof', () => {
    const { token, row } = buildPedido();
    const publicOrder = toPublicOrderTrackingResponse(row, 'comercio-demo-1710000000000', {
      nombre: 'Demo',
      slug: 'demo',
      whatsapp: '+57000000000',
      direccion: 'Pickup',
    });

    const serialized = JSON.stringify(publicOrder);
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('+573001112233');
    expect(serialized).not.toContain('Calle secreta 123');
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(row.public_tracking_token_hash);
    expect(serialized).not.toContain('comprobante');
    expect(serialized).not.toMatch(/"lat"\s*:/);
    expect(serialized).not.toMatch(/"lng"\s*:/);
    expect('delivery' in publicOrder).toBe(false);
    expect(publicOrder.locationHint).toBeTruthy();
    expect(publicOrder.items[0]?.name).toBe('Arepa');
  });
});

describe('customer PATCH schema / transitions', () => {
  it('rejects mass assignment and unknown fields', () => {
    const parsed = customerOrderActionSchema.safeParse({
      action: 'cancel',
      source: 'cliente',
      estado: 'entregado',
      total: 1,
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects arbitrary status changes from customer machine', () => {
    expect(assertCustomerStatusTransition('entregado', 'pendiente').ok).toBe(false);
    expect(assertCustomerStatusTransition('pendiente', 'cancelado').ok).toBe(true);
  });
});

describe('GET/PATCH /api/orders/[orderId] authorization', () => {
  beforeEach(() => {
    resetRateLimitStoreForTests();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadRouteWithMock(pedidoA: ReturnType<typeof buildPedido>, pedidoB?: ReturnType<typeof buildPedido>) {
    const rows = [pedidoA.row, ...(pedidoB ? [pedidoB.row] : [])];

    const updateEq = vi.fn(async () => ({
      data: { ...pedidoA.row, estado: 'cancelado' },
      error: null,
    }));
    const updateSelect = vi.fn(() => ({ maybeSingle: updateEq, eq: updateEq, neq: () => ({ select: updateSelect, maybeSingle: updateEq }) }));
    const updateChain = {
      eq: vi.fn(() => ({
        select: updateSelect,
        neq: vi.fn(() => ({
          select: updateSelect,
          maybeSingle: updateEq,
        })),
        maybeSingle: updateEq,
      })),
      select: updateSelect,
    };

    const pedidosListResult = { data: rows, error: null };
    const listQuery = {
      eq: vi.fn(async () => pedidosListResult),
      then: (resolve: (value: typeof pedidosListResult) => unknown) => resolve(pedidosListResult),
    };

    const from = vi.fn((table: string) => {
      if (table === 'pedidos') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => listQuery),
            })),
          })),
          update: vi.fn(() => updateChain),
        };
      }

      if (table === 'comercios') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { nombre: 'Demo', slug: 'demo', whatsapp: null, telefono: null, direccion: null },
                error: null,
              })),
            })),
          })),
        };
      }

      return {
        update: vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })) })),
        rpc: vi.fn(),
      };
    });

    vi.doMock('../../app/api/_lib/supabase-server', () => ({
      getServiceSupabaseClient: () => ({ from, rpc: vi.fn(async () => ({ error: null })) }),
    }));

    return import('../../app/api/orders/[orderId]/route');
  }

  it('rejects GET without token', async () => {
    const pedido = buildPedido();
    const { GET } = await loadRouteWithMock(pedido);
    const response = await GET(new Request('http://localhost/api/orders/x'), {
      params: Promise.resolve({ orderId: pedido.row.detalles.order_id as string }),
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(SERVICE_ROLE);
    expect(JSON.stringify(body)).not.toContain(ANON_KEY);
    expect(JSON.stringify(body)).not.toContain('secret@example.com');
  });

  it('rejects GET with invalid token', async () => {
    const pedido = buildPedido();
    const { GET } = await loadRouteWithMock(pedido);
    const orderId = pedido.row.detalles.order_id as string;
    const response = await GET(new Request(`http://localhost/api/orders/${orderId}?t=invalid-token`), {
      params: Promise.resolve({ orderId }),
    });
    expect(response.status).toBe(404);
  });

  it('returns minimal public payload with valid token', async () => {
    const pedido = buildPedido();
    const { GET } = await loadRouteWithMock(pedido);
    const orderId = pedido.row.detalles.order_id as string;
    const response = await GET(
      new Request(`http://localhost/api/orders/${orderId}?t=${encodeURIComponent(pedido.token)}`),
      { params: Promise.resolve({ orderId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    expect(body.data.orderId).toBe(orderId);
    expect(body.data.items[0].name).toBe('Arepa');
    expect(serialized).not.toContain('secret@example.com');
    expect(serialized).not.toContain('+573001112233');
    expect(serialized).not.toContain(pedido.token);
    expect(serialized).not.toContain(SERVICE_ROLE);
  });

  it('does not allow token A to access order B', async () => {
    const pedidoA = buildPedido({ orderId: 'comercio-a-1' });
    const pedidoB = buildPedido({ orderId: 'comercio-b-2', email: 'other@example.com' });
    const { GET } = await loadRouteWithMock(pedidoA, pedidoB);
    const response = await GET(
      new Request(`http://localhost/api/orders/comercio-b-2?t=${encodeURIComponent(pedidoA.token)}`),
      { params: Promise.resolve({ orderId: 'comercio-b-2' }) },
    );
    expect(response.status).toBe(404);
  });

  it('rejects PATCH mass assignment and status rewrite', async () => {
    const pedido = buildPedido();
    const { PATCH } = await loadRouteWithMock(pedido);
    const orderId = pedido.row.detalles.order_id as string;
    const response = await PATCH(
      new Request(`http://localhost/api/orders/${orderId}?t=${encodeURIComponent(pedido.token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          source: 'cliente',
          total: 0,
          estado: 'entregado',
          items: [{ nombre: 'hack', cantidad: 99 }],
        }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(response.status).toBe(400);
  });

  it('rejects client cancel before timeout window', async () => {
    const pedido = buildPedido();
    pedido.row.created_at = new Date().toISOString();
    const { PATCH } = await loadRouteWithMock(pedido);
    const orderId = pedido.row.detalles.order_id as string;
    const response = await PATCH(
      new Request(`http://localhost/api/orders/${orderId}?t=${encodeURIComponent(pedido.token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', source: 'cliente' }),
      }),
      { params: Promise.resolve({ orderId }) },
    );
    expect(response.status).toBe(409);
  });
});

describe('comprobante upload validation', () => {
  it('rejects SVG/HTML and oversized files', () => {
    expect(
      validateComprobanteFile({
        fileName: 'x.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: 100,
      }).ok,
    ).toBe(false);

    expect(
      validateComprobanteFile({
        fileName: 'x.html',
        mimeType: 'text/html',
        sizeBytes: 100,
      }).ok,
    ).toBe(false);

    expect(
      validateComprobanteFile({
        fileName: 'big.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 6 * 1024 * 1024,
      }).ok,
    ).toBe(false);

    expect(
      validateComprobanteFile({
        fileName: 'ok.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1200,
        storagePath: '../etc/passwd',
      }).ok,
    ).toBe(false);

    expect(
      validateComprobanteFile({
        fileName: 'ok.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1200,
        storagePath: 'comercio/ok.jpg',
      }).ok,
    ).toBe(true);
  });
});

describe('tracking URL with token', () => {
  it('preserves only the tracking token query param', () => {
    const site = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://elmenuxfa.com').replace(
      /\/$/,
      '',
    );
    const candidate = `${site}/orders/ORDER-1?t=abc123&utm=evil`;
    const safe = resolveSafeTrackingUrl(candidate, 'ORDER-1', null);
    expect(safe).toContain('t=abc123');
    expect(safe).not.toContain('utm=evil');
  });

  it('requires explicit regenerateTrackingLink for token rotation schema', () => {
    expect(
      sendOrderRequestSchema.safeParse({
        clientEmail: 'cliente@example.com',
        orderId: 'demo-ORDER-123456',
      }).success,
    ).toBe(true);
    expect(
      sendOrderRequestSchema.safeParse({
        clientEmail: 'cliente@example.com',
        orderId: 'demo-ORDER-123456',
        regenerateTrackingLink: true,
      }).success,
    ).toBe(true);
    expect(
      sendOrderRequestSchema.safeParse({
        clientEmail: 'cliente@example.com',
        orderId: 'demo-ORDER-123456',
        regenerateTrackingLink: false,
      }).success,
    ).toBe(false);
  });
});
