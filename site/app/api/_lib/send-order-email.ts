import { Resend } from 'resend';

import {
  escapeHtml,
  resolveSafeTrackingUrl,
  sanitizeDisplayName,
} from './send-order-validation';

export type SendOrderEmailInput = {
  clientEmail: string;
  comercioNombre: string;
  comercioName?: string;
  orderId: string;
  orderTrackingUrl?: string;
  comercioSlug?: string | null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendOrderEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendOrderEmail(input: SendOrderEmailInput) {
  const clientEmail = (input.clientEmail ?? '').trim().toLowerCase();
  const comercioNombre = sanitizeDisplayName(input.comercioName ?? input.comercioNombre);
  const orderId = (input.orderId ?? '').trim();

  if (!clientEmail || !emailRegex.test(clientEmail) || clientEmail.includes('\n') || clientEmail.includes('\r')) {
    throw new Error('Invalid clientEmail.');
  }

  if (!orderId || orderId.length > 120) {
    throw new Error('Invalid orderId.');
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false, skipped: true as const, message: 'Email delivery is not configured.' };
  }

  // From address is server-controlled only.
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'elmenuxfa.com <onboarding@resend.dev>';
  const resend = new Resend(resendApiKey);

  const trackingLink = resolveSafeTrackingUrl(input.orderTrackingUrl, orderId, input.comercioSlug);
  const safeComercio = escapeHtml(comercioNombre);
  const safeOrderId = escapeHtml(orderId);
  const subject = `Pedido confirmado en ${comercioNombre}`.slice(0, 180);

  const trackingBlock = trackingLink
    ? (() => {
        const safeTrackingHref = trackingLink.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const safeTrackingText = escapeHtml(trackingLink);
        return `
            <tr>
              <td style="padding:20px 24px 8px 24px;text-align:center;">
                <a href="${safeTrackingHref}" style="display:inline-block;background-color:#6D28D9;border-radius:999px;padding:16px 34px;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;line-height:1;" rel="noreferrer">Ver mi Pedido</a>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 20px 24px;text-align:center;">
                <p style="margin:0;color:#6B5A92;font-size:13px;line-height:1.5;">Si el botón no funciona, copia y pega este enlace:</p>
                <p style="margin:8px 0 0 0;color:#6D28D9;font-size:13px;line-height:1.5;word-break:break-all;">${safeTrackingText}</p>
              </td>
            </tr>`;
      })()
    : `
            <tr>
              <td style="padding:20px 24px 24px 24px;text-align:center;">
                <p style="margin:0;color:#6B5A92;font-size:14px;line-height:1.6;">
                  Referencia del pedido: <strong>${safeOrderId}</strong>.
                  Usa el enlace de seguimiento del correo original si ya lo recibiste.
                </p>
              </td>
            </tr>`;

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
                  Hola, hemos recibido tu pedido en <strong>${safeComercio}</strong>. Estamos preparando todo para ti.
                </p>
              </td>
            </tr>
            ${trackingBlock}
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
