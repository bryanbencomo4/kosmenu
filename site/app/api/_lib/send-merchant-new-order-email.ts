import 'server-only';

import { Resend } from 'resend';

import { supportEmail } from '../../_lib/public-site-config';
import { escapeHtml } from './send-order-validation';

export type SendMerchantNewOrderEmailInput = {
  merchantEmail: string;
  comercioNombre: string;
  orderId: string;
  customerName: string;
  totalLabel: string;
  appOrderUrl: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendMerchantNewOrderEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendMerchantNewOrderEmail(input: SendMerchantNewOrderEmailInput) {
  const merchantEmail = (input.merchantEmail ?? '').trim().toLowerCase();
  const comercioNombre = (input.comercioNombre ?? 'Tu comercio').trim() || 'Tu comercio';
  const orderId = (input.orderId ?? '').trim();
  const customerName = (input.customerName ?? 'Cliente').trim() || 'Cliente';
  const totalLabel = (input.totalLabel ?? '').trim() || '—';
  const appOrderUrl = (input.appOrderUrl ?? '').trim();

  if (!merchantEmail || !emailRegex.test(merchantEmail)) {
    return { ok: false as const, skipped: true as const, reason: 'invalid-merchant-email' };
  }

  if (!orderId) {
    return { ok: false as const, skipped: true as const, reason: 'invalid-order-id' };
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false as const, skipped: true as const, reason: 'resend-not-configured' };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || `elmenuxfa.com <${supportEmail}>`;
  const resend = new Resend(resendApiKey);

  const safeComercio = escapeHtml(comercioNombre);
  const safeOrderId = escapeHtml(orderId);
  const safeCustomer = escapeHtml(customerName);
  const safeTotal = escapeHtml(totalLabel);
  const safeAppHref = appOrderUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const safeAppText = escapeHtml(appOrderUrl);

  const subject = `Nuevo pedido #${orderId} en ${comercioNombre}`.slice(0, 180);

  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#F6F2FF;font-family:Arial,Helvetica,sans-serif;color:#1F1147;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F6F2FF;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#FFFFFF;border:1px solid #E3D8F8;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#5B21B6;padding:28px 24px;text-align:center;">
                <p style="margin:0;color:#EDE9FE;font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">elmenuxfa.com</p>
                <h1 style="margin:10px 0 0 0;color:#FFFFFF;font-size:32px;line-height:1.2;font-weight:800;">Nuevo pedido recibido</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <p style="margin:0;color:#1F1147;font-size:17px;line-height:1.6;">
                  Tienes un pedido nuevo en <strong>${safeComercio}</strong>.
                </p>
                <p style="margin:16px 0 0 0;color:#6B5A92;font-size:15px;line-height:1.6;">
                  Pedido <strong>#${safeOrderId}</strong><br/>
                  Cliente: <strong>${safeCustomer}</strong><br/>
                  Total: <strong>${safeTotal}</strong>
                </p>
              </td>
            </tr>
            ${
              appOrderUrl
                ? `<tr>
              <td style="padding:12px 24px 28px 24px;text-align:center;">
                <a href="${safeAppHref}" style="display:inline-block;background-color:#6D28D9;border-radius:999px;padding:16px 34px;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;line-height:1;" rel="noreferrer">Abrir pedido</a>
                <p style="margin:14px 0 0 0;color:#6B5A92;font-size:13px;line-height:1.5;word-break:break-all;">${safeAppText}</p>
              </td>
            </tr>`
                : ''
            }
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  await resend.emails.send({
    from: fromEmail,
    to: merchantEmail,
    subject,
    html,
  });

  return { ok: true as const, skipped: false as const };
}
