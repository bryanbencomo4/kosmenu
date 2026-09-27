import { sendWhatsappText } from './send-order-whatsapp';

export function buildDeliveryInviteWhatsappText(input: {
  courierAlias?: string | null;
  businessName: string;
  orderId: string;
  inviteUrl: string;
}) {
  const alias = (input.courierAlias ?? '').trim() || 'repartidor';
  return [
    `Hola ${alias}. Te asignaron una entrega de ${input.businessName}.`,
    `Pedido: ${input.orderId}.`,
    'Abre este enlace para aceptar y gestionar la entrega:',
    input.inviteUrl,
  ].join('\n');
}

export async function sendDeliveryInviteWhatsapp(input: {
  phone: string;
  courierAlias?: string | null;
  businessName: string;
  orderId: string;
  inviteUrl: string;
  invitationId: string;
  pedidoId: string;
  comercioId: string;
  actorId: string;
}) {
  return sendWhatsappText(input.phone, buildDeliveryInviteWhatsappText(input), {
    source: 'delivery-invite',
    dedupeKey: `delivery-invite:${input.invitationId}`,
    comercioId: input.comercioId,
    pedidoId: input.pedidoId,
    orderId: input.orderId,
    deliveryInvitationId: input.invitationId,
    deliveryActor: input.actorId,
  });
}