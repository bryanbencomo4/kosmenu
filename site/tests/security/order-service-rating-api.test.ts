import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TEST_ORDER_ID = 'EMXFA-000321';
const SERVICE_ROLE = 'service-role-rating-test-key';

function buildSupabaseMock(options?: {
  ownerId?: string;
  status?: string;
  deliveryStatus?: string;
  activeMember?: boolean;
}) {
  const order = {
    id: 'pedido-row-id',
    comercio_id: 'commerce-uuid',
    estado: options?.status ?? 'entregado',
    telefono_cliente: '+584121234567',
    detalles: {
      order_id: TEST_ORDER_ID,
      ...(options?.deliveryStatus
        ? { delivery_delegate: { status: options.deliveryStatus } }
        : {}),
    },
  };
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const orderQuery: Record<string, (...args: unknown[]) => unknown> = {};
  orderQuery.select = vi.fn(() => orderQuery);
  orderQuery.eq = vi.fn(() => orderQuery);
  orderQuery.order = vi.fn(() => orderQuery);
  orderQuery.limit = vi.fn(() => orderQuery);
  orderQuery.maybeSingle = vi.fn(async () => ({ data: order, error: null }));

  const commerceQuery = {
    maybeSingle: vi.fn(async () => ({
      data: { owner_id: options?.ownerId ?? 'merchant-user' },
      error: null,
    })),
  };
  const commerceEq = { eq: vi.fn(() => commerceQuery) };
  const commerceSelect = { select: vi.fn(() => commerceEq) };
  const memberQuery = {
    maybeSingle: vi.fn(async () => ({
      data: options?.activeMember ? { id: 'active-commerce-member' } : null,
      error: null,
    })),
  };
  const memberLimit = { limit: vi.fn(() => memberQuery) };
  const memberRole = { in: vi.fn(() => memberLimit) };
  const memberStatus = { eq: vi.fn(() => memberRole) };
  const memberUser = { eq: vi.fn(() => memberStatus) };
  const memberCommerce = { eq: vi.fn(() => memberUser) };
  const memberSelect = { select: vi.fn(() => memberCommerce) };

  const from = vi.fn((table: string) => {
    if (table === 'pedidos') return orderQuery;
    if (table === 'comercios') return commerceSelect;
    if (table === 'comercio_members') return memberSelect;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { from, rpc }, rpc };
}

describe('merchant order service rating API', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function loadRoute(mock: ReturnType<typeof buildSupabaseMock>, userId = 'merchant-user') {
    vi.doMock('../../app/api/_lib/supabase-server', () => ({
      getServiceSupabaseClient: () => mock.client,
    }));
    vi.doMock('../../app/api/_lib/supabase-user-auth', () => ({
      getUserFromBearerRequest: async () => ({ id: userId }),
    }));
    return import('../../app/api/business/orders/[orderId]/rating/route');
  }

  it('records an owner rating for a completed order', async () => {
    const mock = buildSupabaseMock();
    const { POST } = await loadRoute(mock);
    const response = await POST(
      new Request(`http://localhost/api/business/orders/${TEST_ORDER_ID}/rating`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4 }),
      }),
      { params: Promise.resolve({ orderId: TEST_ORDER_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rating: 4 });
    expect(mock.rpc).toHaveBeenCalledWith('submit_order_service_rating', {
      p_pedido_id: 'pedido-row-id',
      p_rater_side: 'merchant',
      p_rating: 4,
      p_customer_key: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('rejects a non-terminal order before writing a rating', async () => {
    const mock = buildSupabaseMock({ status: 'preparando' });
    const { POST } = await loadRoute(mock);
    const response = await POST(
      new Request(`http://localhost/api/business/orders/${TEST_ORDER_ID}/rating`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4 }),
      }),
      { params: Promise.resolve({ orderId: TEST_ORDER_ID }) },
    );

    expect(response.status).toBe(409);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('rejects a user outside the commerce before writing a rating', async () => {
    const mock = buildSupabaseMock({ ownerId: 'different-user' });
    const { POST } = await loadRoute(mock, 'unrelated-user');
    const response = await POST(
      new Request(`http://localhost/api/business/orders/${TEST_ORDER_ID}/rating`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4 }),
      }),
      { params: Promise.resolve({ orderId: TEST_ORDER_ID }) },
    );

    expect(response.status).toBe(404);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('allows an active order-handling member to rate for their commerce', async () => {
    const mock = buildSupabaseMock({ ownerId: 'commerce-owner', activeMember: true });
    const { POST } = await loadRoute(mock, 'active-staff-user');
    const response = await POST(
      new Request(`http://localhost/api/business/orders/${TEST_ORDER_ID}/rating`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 4 }),
      }),
      { params: Promise.resolve({ orderId: TEST_ORDER_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledOnce();
  });

  it('allows merchant rating after courier delegation completion', async () => {
    const mock = buildSupabaseMock({ status: 'en_camino', deliveryStatus: 'completed' });
    const { POST } = await loadRoute(mock);
    const response = await POST(
      new Request(`http://localhost/api/business/orders/${TEST_ORDER_ID}/rating`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5 }),
      }),
      { params: Promise.resolve({ orderId: TEST_ORDER_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledOnce();
  });
});
