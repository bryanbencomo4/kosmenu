import 'server-only';

import { canSendOrderNotification, sendWhatsappText } from './send-order-whatsapp';

export type SendMerchantNewOrderWhatsappInput = {
  merchantWhatsapp: string;
  comercioNombre: string;
  orderId: string;
  customerName: string;
  totalLabel: string;
  appOrderUrl: string;
};

export function canSendMerchantNewOrderWhatsapp() {
  return canSendOrderNotification();
}

export function buildMerchantNewOrderWhatsappText(input: {
  comercioNombre: string;
  orderId: string;
  customerName: string;
  totalLabel: string;
  appOrderUrl: string;
}) {
  const orderId = (input.orderId ?? '').trim();
  const totalLabel = (input.totalLabel ?? '').trim();
  const appOrderUrl = (input.appOrderUrl ?? '').trim();

  const detail = [orderId ? `#${orderId}` : '', totalLabel && totalLabel !== '—' ? totalLabel : '']
    .filter(Boolean)
    .join(' · ');

  return [`💰 *Nuevo pedido*`, detail, '', appOrderUrl]
    .filter((line, index, lines) => line !== '' || Boolean(lines[index + 1]))
    .join('\n')
    .trim();
}

export async function sendMerchantNewOrderWhatsapp(input: SendMerchantNewOrderWhatsappInput) {
  const orderId = (input.orderId ?? '').trim();
  if (!orderId) {
    return { ok: false as const, skipped: true as const, reason: 'invalid-order-id' };
  }

  if (!canSendMerchantNewOrderWhatsapp()) {
    return { ok: false as const, skipped: true as const, reason: 'wasender-not-configured' };
  }

  const text = buildMerchantNewOrderWhatsappText(input);
  const result = await sendWhatsappText(input.merchantWhatsapp, text);
  return { ok: true as const, skipped: false as const, recipient: result.recipient };
}
