import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  commerceId: '11111111-1111-4111-8111-111111111111',
  format: undefined as string | undefined,
  failConfigReads: false,
  inserts: [] as Record<string, unknown>[],
  commerceReads: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('../app/api/_lib/order-idempotency', () => ({
  hashOrderIdempotencyPayload: () => 'mock-hash',
  normalizeIdempotencyKey: () => 'mock-key',
  lookupOrderIdempotency: async () => ({ status: 'miss' }),
  storeOrderIdempotency: async () => {},
}));
vi.mock('../app/api/_lib/allocate-order-display-id', () => ({ allocateOrderDisplayId: async () => 'EMXFA-000156' }));
vi.mock('../app/api/_lib/rate-limit', () => ({ getClientIp: () => 'mock', consumeRateLimit: () => ({ ok: true }) }));
vi.mock('../app/api/_lib/send-order-email', () => ({ canSendOrderEmail: () => false, sendOrderEmail: async () => {} }));
vi.mock('../app/api/_lib/order-service-rating', () => ({ createCustomerRatingKey: async () => 'mock', loadOrderServiceRatingSummary: async () => ({ customer: null }) }));
vi.mock('../app/api/_lib/order-short-links', () => ({ createOrderShortLink: async () => ({ code: 'AbCdEf1234' }) }));
vi.mock('../app/api/_lib/supabase-circuit', () => ({
  isTransientSupabaseFailure: () => false,
  supabaseWriteCircuit: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
}));
vi.mock('../app/api/_lib/supabase-server', () => ({
  getServiceSupabaseClient: () => ({
    from(table: string) {
      let columns = '';
      let singleton = false;
      let operation = 'select';
      let values: Record<string, unknown> = {};
      const result = () => {
        if (table === 'comercios') {
          state.commerceReads.push(state.commerceId);
          const configRequested = columns.includes('branding_ia');
          if (state.failConfigReads && configRequested) return { data: null, error: { message: 'config read failed' } };
          const row = {
            id: state.commerceId, slug: 'preview', moneda: 'COP', en_linea: true,
            ...(configRequested ? { config_negocio: { whatsapp_order_format: state.format } } : {}),
          };
          return { data: singleton ? row : [row], error: null };
        }
        if (table === 'pedidos' && operation === 'insert') {
          state.inserts.push(values);
          return { data: { ...values, id: 'mock-pedido' }, error: null };
        }
        if (table === 'productos') return { data: [], error: null };
        return { data: singleton ? null : [], error: null };
      };
      const query = {
        select(value: string) { columns = value; return query; },
        eq(key: string, value: string) {
          if (table === 'comercios' && key === 'id') expect(value).toBe(state.commerceId);
          return query;
        },
        in() { return query; }, order() { return query; }, limit() { return query; },
        insert(value: Record<string, unknown>) { operation = 'insert'; values = value; return query; },
        update() { operation = 'update'; return query; },
        maybeSingle() { singleton = true; return Promise.resolve(result()); },
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  }),
}));

import { POST } from '../app/api/orders/route';

async function submit(extra: Record<string, unknown> = {}) {
  const response = await POST(new Request('https://preview.example/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      comercioId: state.commerceId,
      clientName: 'Cliente Preview', clientWhatsapp: '+584121234567',
      currency: 'COP', exchangeRate: 1, costoDelivery: 0,
      items: [{ product_id: 'legacy-product', nombre: 'Pizza', cantidad: 2, precio: 18000 }],
      delivery: { mode: 'pickup' }, paymentMethod: { nombre: 'Efectivo' },
      ...extra,
    }),
  }));
  const payload = await response.json();
  expect(response.status).toBe(201);
  expect(payload.data.estado).toBe('pendiente');
  expect(payload.data.whatsappStatus).toBe('client_link');
  return payload.data;
}

describe('per-commerce authoritative WhatsApp format at creation', () => {
  beforeEach(() => {
    state.format = undefined;
    state.failConfigReads = false;
    state.commerceId = '11111111-1111-4111-8111-111111111111';
    state.inserts = [];
    state.commerceReads = [];
  });

  it('default response remains summary even when the request tries to opt in', async () => {
    const data = await submit({ whatsapp_order_format: 'detailed', detalles: { config_negocio: { whatsapp_order_format: 'detailed' } } });
    expect(data).not.toHaveProperty('merchantWhatsappText');
    expect(state.commerceReads).toHaveLength(1);
    expect(state.inserts).toHaveLength(1);
  });

  it('A detailed, B default and A rollback preserve tenant isolation and the secure link', async () => {
    state.format = 'detailed';
    const detailed = await submit();
    expect(detailed.merchantWhatsappText).toContain('*2x Pizza*');
    expect(detailed.merchantWhatsappText).toContain('/orders/view/EMXFA-000156?shortCode=AbCdEf1234');
    const trackingUrl = detailed.trackingUrl;
    state.commerceId = '22222222-2222-4222-8222-222222222222';
    state.format = undefined;
    expect(await submit()).not.toHaveProperty('merchantWhatsappText');
    state.commerceId = '11111111-1111-4111-8111-111111111111';
    state.format = 'summary';
    const rollback = await submit();
    expect(rollback).not.toHaveProperty('merchantWhatsappText');
    expect(rollback.trackingUrl).toBe(trackingUrl);
    expect(state.inserts).toHaveLength(3);
    expect(state.inserts.map((row) => row.comercio_id)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('failed optional configuration reads do not block creation or force detailed', async () => {
    state.format = 'detailed';
    state.failConfigReads = true;
    const data = await submit();
    expect(data).not.toHaveProperty('merchantWhatsappText');
    expect(state.inserts).toHaveLength(1);
  });
});