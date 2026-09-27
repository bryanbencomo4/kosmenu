import { describe, expect, it, vi } from 'vitest';

const { sendWhatsappTextMock } = vi.hoisted(() => ({
  sendWhatsappTextMock: vi.fn(async () => ({
    ok: true as const,
    queued: true as const,
    recipient: '+584247164825',
    response: { queueId: 'queue-1' },
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('../app/api/_lib/send-order-whatsapp', () => ({
  sendWhatsappText: sendWhatsappTextMock,
}));

import {
  buildDeliveryInviteWhatsappText,
  sendDeliveryInviteWhatsapp,
} from '../app/api/_lib/send-delivery-invite-whatsapp';

describe('buildDeliveryInviteWhatsappText', () => {
  it('includes the courier, business, order and invitation URL', () => {
    expect(
      buildDeliveryInviteWhatsappText({
        courierAlias: 'Carlos',
        businessName: 'Hamburgueseria Bladi Jaiper',
        orderId: 'EMXFA-000056',
        inviteUrl: 'https://elmenuxfa.com/delivery/invite/token',
      }),
    ).toContain(
      'Hola Carlos. Te asignaron una entrega de Hamburgueseria Bladi Jaiper.',
    );
  });

  it('queues the invite with the invitation and audit metadata', async () => {
    await sendDeliveryInviteWhatsapp({
      phone: '+584247164825',
      courierAlias: 'Carlos',
      businessName: 'Hamburgueseria',
      orderId: 'EMXFA-000056',
      inviteUrl: 'https://elmenuxfa.com/delivery/invite/token',
      invitationId: 'invitation-1',
      pedidoId: 'pedido-1',
      comercioId: 'comercio-1',
      actorId: 'owner-1',
    });

    expect(sendWhatsappTextMock).toHaveBeenCalledWith(
      '+584247164825',
      expect.stringContaining('https://elmenuxfa.com/delivery/invite/token'),
      expect.objectContaining({
        source: 'delivery-invite',
        dedupeKey: 'delivery-invite:invitation-1',
        deliveryInvitationId: 'invitation-1',
        deliveryActor: 'owner-1',
      }),
    );
  });
});