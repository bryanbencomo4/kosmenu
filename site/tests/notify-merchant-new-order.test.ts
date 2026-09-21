import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const sendMerchantNewOrderEmail = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  skipped: false as const,
}));
const sendMerchantNewOrderWhatsapp = vi.fn(async (_input: unknown) => ({
  ok: true as const,
  skipped: false as const,
  recipient: '+584121234567',
}));
const canSendMerchantNewOrderEmail = vi.fn(() => true);
const canSendMerchantNewOrderWhatsapp = vi.fn(() => true);

vi.mock('../app/api/_lib/send-merchant-new-order-email', () => ({
  canSendMerchantNewOrderEmail: () => canSendMerchantNewOrderEmail(),
  sendMerchantNewOrderEmail: (input: unknown) => sendMerchantNewOrderEmail(input),
}));

vi.mock('../app/api/_lib/send-merchant-new-order-whatsapp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/api/_lib/send-merchant-new-order-whatsapp')>();
  return {
    ...actual,
    canSendMerchantNewOrderWhatsapp: () => canSendMerchantNewOrderWhatsapp(),
    sendMerchantNewOrderWhatsapp: (input: unknown) => sendMerchantNewOrderWhatsapp(input),
  };
});

import { buildMerchantNewOrderWhatsappText } from '../app/api/_lib/send-merchant-new-order-whatsapp';
import {
  notifyMerchantNewOrder,
  resolveMerchantContacts,
} from '../app/api/_lib/notify-merchant-new-order';

describe('buildMerchantNewOrderWhatsappText', () => {
  it('keeps a short title, order total and panel link', () => {
    const text = buildMerchantNewOrderWhatsappText({
      comercioNombre: 'Omg Burgers',
      orderId: 'A1B2',
      customerName: 'Ana',
      totalLabel: 'Bs. 120.00',
      appOrderUrl: 'https://app.elmenuxfa.com/orders/view/A1B2',
    });

    expect(text).toBe('💰 *Nuevo pedido*\n#A1B2 · Bs. 120.00\n\nhttps://app.elmenuxfa.com/orders/view/A1B2');
  });
});

describe('resolveMerchantContacts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers owner auth email and keeps comercio whatsapp', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        slug: 'omg-burgers',
        whatsapp: '04121234567',
        email: 'fallback@negocio.com',
      },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { email: 'dueno@omg.com' } },
            error: null,
          })),
        },
      },
    };

    const contacts = await resolveMerchantContacts(supabase as never, 'comercio-1');
    expect(contacts.email).toBe('dueno@omg.com');
    expect(contacts.whatsapp).toBe('04121234567');
    expect(contacts.nombre).toBe('Omg Burgers');
  });

  it('falls back to comercio email when auth lookup fails', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        whatsapp: '+584141112233',
        correo: 'local@negocio.com',
      },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => {
            throw new Error('timeout');
          }),
        },
      },
    };

    const contacts = await resolveMerchantContacts(supabase as never, 'comercio-1');
    expect(contacts.email).toBe('local@negocio.com');
    expect(contacts.whatsapp).toBe('+584141112233');
  });

  it('falls back to owner auth phone when comercio has no whatsapp', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        whatsapp: '',
      },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: {
              user: {
                email: 'dueno@omg.com',
                phone: '+584221110000',
              },
            },
            error: null,
          })),
        },
      },
    };

    const contacts = await resolveMerchantContacts(supabase as never, 'comercio-1');
    expect(contacts.whatsapp).toBe('+584221110000');
    expect(contacts.email).toBe('dueno@omg.com');
  });
});

describe('notifyMerchantNewOrder', () => {
  afterEach(() => {
    vi.clearAllMocks();
    canSendMerchantNewOrderEmail.mockReturnValue(true);
    canSendMerchantNewOrderWhatsapp.mockReturnValue(true);
  });

  it('sends both email and whatsapp to the merchant', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        whatsapp: '04121234567',
      },
      error: null,
    }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { email: 'dueno@omg.com' } },
            error: null,
          })),
        },
      },
    };

    const result = await notifyMerchantNewOrder({
      supabase: supabase as never,
      comercioId: 'comercio-1',
      orderId: 'A1B2',
      customerName: 'Ana',
      totalLabel: 'Bs. 120.00',
      comercioNombreFallback: 'Omg Burgers',
      appOrderUrl: 'https://app.elmenuxfa.com/orders/view/A1B2',
    });

    expect(result.email).toMatchObject({ ok: true });
    expect(result.whatsapp).toMatchObject({ ok: true });
    expect(sendMerchantNewOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantEmail: 'dueno@omg.com',
        orderId: 'A1B2',
        customerName: 'Ana',
      }),
    );
    expect(sendMerchantNewOrderWhatsapp).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantWhatsapp: '04121234567',
        orderId: 'A1B2',
        customerName: 'Ana',
      }),
    );
  });

  it('skips WhatsApp when the edge function already delivered it', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        whatsapp: '04121234567',
      },
      error: null,
    }));
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        insert,
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { email: 'dueno@omg.com' } },
            error: null,
          })),
        },
      },
    };

    const result = await notifyMerchantNewOrder({
      supabase: supabase as never,
      comercioId: 'comercio-1',
      pedidoId: 'pedido-1',
      orderId: 'A1B2',
      customerName: 'Ana',
      totalLabel: 'Bs. 120.00',
      comercioNombreFallback: 'Omg Burgers',
      appOrderUrl: 'https://app.elmenuxfa.com/orders/view/A1B2',
      skipWhatsapp: true,
    });

    expect(result.whatsapp).toMatchObject({ ok: true, reason: 'merchant-whatsapp-already-sent' });
    expect(sendMerchantNewOrderWhatsapp).not.toHaveBeenCalled();
    expect(result.email).toMatchObject({ ok: true });
  });

  it('claims the dedup slot only after WhatsApp is sent', async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        whatsapp: '04121234567',
      },
      error: null,
    }));
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        insert,
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { email: 'dueno@omg.com' } },
            error: null,
          })),
        },
      },
    };

    await notifyMerchantNewOrder({
      supabase: supabase as never,
      comercioId: 'comercio-1',
      pedidoId: 'pedido-1',
      orderId: 'A1B2',
      customerName: 'Ana',
      totalLabel: 'Bs. 120.00',
      comercioNombreFallback: 'Omg Burgers',
      appOrderUrl: 'https://app.elmenuxfa.com/orders/view/A1B2',
    });

    expect(sendMerchantNewOrderWhatsapp).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      pedido_id: 'pedido-1',
      channel: 'whatsapp',
      event_type: 'INSERT',
      status_key: 'merchant-new',
    });
  });

  it('does not claim the slot when WhatsApp fails', async () => {
    sendMerchantNewOrderWhatsapp.mockResolvedValueOnce({
      ok: false as const,
      skipped: true as const,
      reason: 'wasender-failed',
    });
    const maybeSingle = vi.fn(async () => ({
      data: {
        owner_id: 'owner-1',
        nombre: 'Omg Burgers',
        whatsapp: '04121234567',
      },
      error: null,
    }));
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
        insert,
      })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { email: 'dueno@omg.com' } },
            error: null,
          })),
        },
      },
    };

    const result = await notifyMerchantNewOrder({
      supabase: supabase as never,
      comercioId: 'comercio-1',
      pedidoId: 'pedido-1',
      orderId: 'A1B2',
      customerName: 'Ana',
      totalLabel: 'Bs. 120.00',
      comercioNombreFallback: 'Omg Burgers',
      appOrderUrl: 'https://app.elmenuxfa.com/orders/view/A1B2',
    });

    expect(result.whatsapp).toMatchObject({ ok: false });
    expect(insert).not.toHaveBeenCalled();
  });
});
