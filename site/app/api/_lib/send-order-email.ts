import { Resend } from 'resend';

export type SendOrderEmailInput = {
  clientEmail: string;
  comercioNombre: string;
  orderId: string;
  orderTrackingUrl?: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendOrderEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendOrderEmail(input: SendOrderEmailInput) {
  const clientEmail = (input.clientEmail ?? '').trim().toLowerCase();
  const comercioNombre = (input.comercioNombre ?? 'Kosmenu').trim() || 'Kosmenu';
  const orderId = (input.orderId ?? '').trim();

  if (!clientEmail || !emailRegex.test(clientEmail)) {
    throw new Error('Invalid clientEmail.');
  }

  if (!orderId) {
    throw new Error('Invalid orderId.');
  }

  const trackingLink =
    input.orderTrackingUrl?.trim() ||
    `https://kosmenu.vercel.app/orders/${encodeURIComponent(orderId)}`;

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false, skipped: true as const, message: 'RESEND_API_KEY not configured.' };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Kosmenu <onboarding@resend.dev>';
  const resend = new Resend(resendApiKey);

  const subject = `Order received in ${comercioNombre}`;
  const text = `Your order in ${comercioNombre} is in progress. Track it here: ${trackingLink}`;
  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#121212;font-family:Arial,Helvetica,sans-serif;color:#F4F4F4;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#121212;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background-color:#181818;border:1px solid #2D2D2D;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#10261A;padding:28px 24px;text-align:center;border-bottom:1px solid #1E3A2B;">
                <p style="margin:0;color:#4ADE80;font-size:12px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">Kosmenu</p>
                <h1 style="margin:10px 0 0 0;color:#EBD38A;font-size:34px;line-height:1.2;font-weight:800;">Order Confirmed</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 12px 24px;">
                <p style="margin:0;color:#F4F4F4;font-size:17px;line-height:1.6;">
                  Hello, we received your order in <strong>${comercioNombre}</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px;text-align:center;">
                <a href="${trackingLink}" style="display:inline-block;background-color:#1FA86A;border-radius:999px;padding:16px 34px;color:#FFFFFF;text-decoration:none;font-size:17px;font-weight:700;line-height:1;">Track Order</a>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 20px 24px;text-align:center;">
                <p style="margin:0;color:#B7B7B7;font-size:13px;line-height:1.5;">If the button does not work, copy this URL:</p>
                <p style="margin:8px 0 0 0;color:#EBD38A;font-size:13px;line-height:1.5;word-break:break-all;">${trackingLink}</p>
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
    text,
    html,
  });

  return { ok: true as const, skipped: false as const };
}
