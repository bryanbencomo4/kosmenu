import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  dispatchOrderNotification,
  extractOrderCode,
  merchantWhatsappDelivered,
} from '../app/api/_lib/dispatch-order-notification';

describe('extractOrderCode', () => {
  it('prefers detalles.order_id', () => {
    expect(
      extractOrderCode({
        id: 'uuid-1',
        detalles: { order_id: 'ORD-123' },
      }),
    ).toBe('ORD-123');
  });
});

describe('dispatchOrderNotification', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('skips when service role config is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';

    const result = await dispatchOrderNotification({
      type: 'INSERT',
      record: { id: 'uuid-1', comercio_id: 'c-1', detalles: { order_id: 'ORD-1' } },
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('notify-order-config-missing');
  });

  it('posts notify-order payload with service role headers', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, whatsapp: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const record = {
      id: 'uuid-1',
      comercio_id: 'c-1',
      estado: 'pendiente',
      detalles: { order_id: 'ORD-1' },
    };

    const result = await dispatchOrderNotification({
      type: 'INSERT',
      record,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/functions/v1/notify-order');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer service-role-key',
      apikey: 'service-role-key',
    });

    const body = JSON.parse(String(init.body));
    expect(body.type).toBe('INSERT');
    expect(body.record).toEqual(record);
  });
});

describe('merchantWhatsappDelivered', () => {
  it('is true only when this dispatch actually sent the merchant WhatsApp', () => {
    expect(
      merchantWhatsappDelivered({
        ok: true,
        body: { merchantWhatsapp: { ok: true, skipped: false } },
      }),
    ).toBe(true);
  });

  it('treats a claimed slot as delivered so checkout does not double-send', () => {
    expect(
      merchantWhatsappDelivered({
        ok: true,
        body: { merchantWhatsapp: { ok: true, skipped: true, reason: 'merchant-whatsapp-already-sent' } },
      }),
    ).toBe(true);
  });

  it('falls back when the edge function timed out or failed', () => {
    expect(merchantWhatsappDelivered({ ok: false, reason: 'notify-order-timeout' })).toBe(false);
    expect(
      merchantWhatsappDelivered({
        ok: true,
        body: { merchantWhatsapp: { ok: false, error: 'WASender request failed.' } },
      }),
    ).toBe(false);
    expect(
      merchantWhatsappDelivered({
        ok: true,
        body: { merchantWhatsapp: { ok: true, skipped: true, reason: 'merchant-whatsapp-missing' } },
      }),
    ).toBe(false);
  });
});
