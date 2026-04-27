import { Resend } from 'resend';

import { publicSiteUrl } from './public-site-url';

export type SendOrderEmailInput = {
  clientEmail: string;
  comercioNombre: string;
  comercioName?: string;
  orderId: string;
  orderTrackingUrl?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendOrderEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendOrderEmail(input: SendOrderEmailInput) {
  const clientEmail = (input.clientEmail ?? '').trim().toLowerCase();
  const comercioNombre =
    (input.comercioName ?? input.comercioNombre ?? 'elmenuxfa.com').trim() || 'elmenuxfa.com';
  const orderId = (input.orderId ?? '').trim();

  if (!clientEmail || !emailRegex.test(clientEmail)) {
    throw new Error('Invalid clientEmail.');
  }

  if (!orderId) {
    throw new Error('Invalid orderId.');
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false, skipped: true as const, message: 'RESEND_API_KEY not configured.' };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'elmenuxfa.com <onboarding@resend.dev>';
  const resend = new Resend(resendApiKey);

  const trackingLink = finalTrackingLink(input.orderTrackingUrl, orderId);
  const subject = `💜 ¡Pedido Confirmado en ${comercioNombre}!`;
  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#F6F2FF;font-family:Arial,Helvetica,sans-serif;color:#1F1147;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F6F2FF;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#FFFFFF;border:1px solid #E3D8F8;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#5B21B6;padding:28px 24px;text-align:center;border-bottom:1px solid #4C1D95;">
                <p style="margin:0;color:#EDE9FE;font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">elmenuxfa.com</p>
                <h1 style="margin:10px 0 0 0;color:#FFFFFF;font-size:34px;line-height:1.2;font-weight:800;">Pedido Confirmado</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <p style="margin:0;color:#1F1147;font-size:17px;line-height:1.6;">
                  Hola, hemos recibido tu pedido en <strong>${comercioNombre}</strong>. Estamos preparando todo para ti.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px;text-align:center;">
                <a href="${trackingLink}" style="display:inline-block;background-color:#6D28D9;border-radius:999px;padding:16px 34px;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;line-height:1;">Ver mi Pedido</a>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 20px 24px;text-align:center;">
                <p style="margin:0;color:#6B5A92;font-size:13px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:</p>
                <p style="margin:8px 0 0 0;color:#6D28D9;font-size:13px;line-height:1.5;word-break:break-all;">${trackingLink}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await resend.emails.send({
    from: fromEmail,
    to: clientEmail,
    subject,
    html,
  });

  return { ok: true as const, skipped: false as const };
}

function finalTrackingLink(orderTrackingUrl: string | undefined, orderId: string) {
  const directUrl = (orderTrackingUrl ?? '').trim();
  if (directUrl.length > 0) {
    return directUrl;
  }

  return `${publicSiteUrl}/orders/${encodeURIComponent(orderId)}`;
}
