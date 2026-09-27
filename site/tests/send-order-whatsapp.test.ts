import { afterEach, describe, expect, it, vi } from 'vitest';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../app/api/_lib/supabase-server', () => ({
  getServiceSupabaseClient: () => ({ rpc: rpcMock }),
}));

import {
  buildCustomerOrderWhatsappText,
  normalizePhoneToE164,
  sendWhatsappText,
} from '../app/api/_lib/send-order-whatsapp';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('normalizePhoneToE164', () => {
  it('keeps a Venezuelan mobile in E.164 with plus', () => {
    expect(normalizePhoneToE164('+584121234567')).toBe('+584121234567');
  });

  it('normalizes local 04xx numbers to Venezuela E.164', () => {
    expect(normalizePhoneToE164('04121234567')).toBe('+584121234567');
  });

  it('normalizes 58xxxxxxxxxx without plus', () => {
    expect(normalizePhoneToE164('584121234567')).toBe('+584121234567');
  });
});

describe('buildCustomerOrderWhatsappText', () => {
  it('is a short emoji title plus the tracking link', () => {
    const text = buildCustomerOrderWhatsappText({
      orderId: 'EMXFA-000022',
      status: 'entregado',
      trackingUrl: 'https://elmenuxfa.com/v/omg-burgers/orders/EMXFA-000022?t=abc',
    });

    expect(text).toBe(
      '🎉 *Entregado*\n#EMXFA-000022\n\nhttps://elmenuxfa.com/v/omg-burgers/orders/EMXFA-000022?t=abc',
    );
  });
});

describe('sendWhatsappText', () => {
  it('queues the message rather than sending directly from the API runtime', async () => {
    vi.stubEnv('WASENDER_API_KEY', 'test-key');
    rpcMock.mockResolvedValueOnce({
      data: [{ queue_id: 'queue-1', queued: true }],
      error: null,
    });

    await expect(sendWhatsappText('+584121234567', 'test message')).resolves.toMatchObject({
      ok: true,
      queued: true,
      recipient: '+584121234567',
      response: { queueId: 'queue-1' },
    });
    expect(rpcMock).toHaveBeenCalledWith('enqueue_wasender_message', expect.objectContaining({
      p_source: 'next-api',
      p_recipient: '+584121234567',
      p_message: 'test message',
      p_dedupe_key: expect.any(String),
    }));
  });

  it('surfaces queue insertion failures to its caller', async () => {
    vi.stubEnv('WASENDER_API_KEY', 'test-key');
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'queue unavailable' } });

    await expect(sendWhatsappText('+584121234567', 'test message')).rejects.toThrow(
      'Unable to queue WASender message: queue unavailable',
    );
  });
});
