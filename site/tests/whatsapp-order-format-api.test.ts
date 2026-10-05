import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  commerceId: '11111111-1111-4111-8111-111111111111',
  format: undefined as string | undefined,
  managementMode: undefined as string | undefined,
  failConfigReads: false,
  inserts: [] as Record<string, unknown>[],
  commerceReads: [] as string[],
  products: [] as Record<string, unknown>[],
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
      let productIds: string[] = [];
      const result = () => {
        if (table === 'comercios') {
          state.commerceReads.push(state.commerceId);
          const configRequested = columns.includes('branding_ia');
          if (state.failConfigReads && configRequested) return { data: null, error: { message: 'config read failed' } };
          const row = {
            id: state.commerceId, slug: 'preview', moneda: 'COP', en_linea: true,
            ...(configRequested ? { config_negocio: { whatsapp_order_format: state.format, order_management_mode: state.managementMode } } : {}),
          };
          return { data: singleton ? row : [row], error: null };
        }
        if (table === 'pedidos' && operation === 'insert') {
          state.inserts.push(values);
          return { data: { ...values, id: 'mock-pedido' }, error: null };
        }
        if (table === 'productos') return { data: state.products.filter((row) => row.comercio_id === state.commerceId && productIds.includes(row.id as string)), error: null };
        return { data: singleton ? null : [], error: null };
      };
      const query = {
        select(value: string) { columns = value; return query; },
        eq(key: string, value: string) {
          if (table === 'comercios' && key === 'id') expect(value).toBe(state.commerceId);
          if (table === 'productos' && key === 'comercio_id') expect(value).toBe(state.commerceId);
          return query;
        },
        in(_key: string, ids: string[]) { productIds = ids; return query; }, order() { return query; }, limit() { return query; },
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
    state.managementMode = undefined;
    state.failConfigReads = false;
    state.commerceId = '11111111-1111-4111-8111-111111111111';
    state.inserts = [];
    state.commerceReads = [];
    state.products = [];
  });

  it('default response remains summary even when the request tries to opt in', async () => {
    const data = await submit({ whatsapp_order_format: 'detailed', detalles: { management_mode: 'whatsapp_manual', config_negocio: { whatsapp_order_format: 'detailed', order_management_mode: 'whatsapp_manual' } } });
    expect(data.managementMode).toBe('platform');
    expect((state.inserts[0].detalles as Record<string, unknown>).management_mode).toBe('platform');
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

  it('management snapshots survive both setting changes and never leak to tenant B', async () => {
    state.managementMode = 'whatsapp_manual';
    const manual = await submit();
    expect(manual.managementMode).toBe('whatsapp_manual');
    expect(manual.merchantWhatsappText).toContain('Gestión: Por WhatsApp');
    expect(manual.merchantWhatsappText).not.toContain('Estado: Pendiente');
    const oldManual = state.inserts[0].detalles as Record<string, unknown>;
    state.managementMode = 'platform';
    const platform = await submit();
    expect(platform.managementMode).toBe('platform');
    expect(oldManual.management_mode).toBe('whatsapp_manual');
    const oldPlatform = state.inserts[1].detalles as Record<string, unknown>;
    state.managementMode = 'whatsapp_manual';
    await submit();
    expect(oldPlatform.management_mode).toBe('platform');
    state.commerceId = '22222222-2222-4222-8222-222222222222';
    state.managementMode = undefined;
    expect((await submit()).managementMode).toBe('platform');
    expect(state.inserts).toHaveLength(4);
  });
  it('manual delivery exists without acceptance or an automatic courier mission', async () => {
    state.managementMode = 'whatsapp_manual';
    const result = await submit({
      costoDelivery: 2000,
      delivery: { mode: 'delivery', address: 'Calle Preview 1', reference: 'Puerta azul', coordinates: { lat: 7.8, lng: -72.2 } },
    });
    expect(result.managementMode).toBe('whatsapp_manual');
    expect(result.estado).toBe('pendiente');
    expect(result.merchantWhatsappText).toContain('DELIVERY');
    expect(result.merchantWhatsappText).toContain('Calle Preview 1');
    const details = state.inserts[0].detalles as Record<string, unknown>;
    expect(details).not.toHaveProperty('delivery_delegate');
    expect(state.inserts).toHaveLength(1);
  });

  it('failed optional configuration reads do not block creation or force detailed', async () => {
    state.format = 'detailed';
    state.failConfigReads = true;
    const data = await submit();
    expect(data).not.toHaveProperty('merchantWhatsappText');
    expect(state.inserts).toHaveLength(1);
  });

  it('uses the existing ten-character code for a digital proof link', async () => {
    state.managementMode = 'whatsapp_manual';
    const data = await submit({
      paymentMethod: { nombre: 'Pago móvil' },
      paymentProofUrl: `storage://comprobantes/${state.commerceId}/proof.png`,
    });
    expect(data.merchantWhatsappText).toMatch(/Comprobante: https:\/\/[^\s]+\/p\/AbCdEf1234/);
    expect(data.merchantWhatsappText).not.toContain('storage://');
    expect(data.merchantWhatsappText).not.toContain('proof.png');
    expect((state.inserts[0].detalles as Record<string, unknown>).comprobante_url)
      .toBe(`storage://comprobantes/${state.commerceId}/proof.png`);
  });
  it('creates a combination from authoritative catalog prices, not forged request totals', async () => {
    state.managementMode = 'whatsapp_manual';
    state.products = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', comercio_id: state.commerceId, disponible: true, nombre: 'Producto A', precio: 30000,
        opciones_menu: { personalizacion: { version: 1, combinacion: { activada: true, titulo: 'Combina con', productos_compatibles: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], regla_precio: 'max' } } } },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', comercio_id: state.commerceId, disponible: true, nombre: 'Producto B', precio: 40000 },
    ];
    const data = await submit({ items: [{ product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'FORGED', cantidad: 2, precio: 1, opciones: { combinacion: { productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', seleccion: {} } } }] });
    expect(data.subtotal).toBe(80000);
    expect(data.total).toBe(80000);
    expect(data.customizationTotalCheckout).toBe(80000);
    expect(state.inserts[0].total).toBe(80000);
    const item = (state.inserts[0].detalles as { items: Record<string, unknown>[] }).items[0];
    expect(item.precio).toBe(40000);
    expect(data.merchantWhatsappText).toContain('Producto A + Producto B');
    expect(data.merchantWhatsappText).not.toContain('FORGED');
  });
  it('rejects malformed compatible product ids before catalog queries', async () => {
    const response = await POST(new Request('https://preview.example/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comercioId: state.commerceId, clientName: 'QA', clientWhatsapp: '+584121234567', currency: 'COP', exchangeRate: 1, costoDelivery: 0,
        delivery: { mode: 'pickup' }, items: [{ product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'QA', cantidad: 1, precio: 1, opciones: { combinacion: { productId: 'not-a-uuid', seleccion: {} } } }] }),
    }));
    expect(response.status).toBe(400);
    expect(state.commerceReads).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });
});