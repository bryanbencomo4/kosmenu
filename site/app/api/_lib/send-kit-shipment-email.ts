import 'server-only';

import { Resend } from 'resend';

import {
  kitOrderPublicCode,
  type KitShipmentStatus,
} from '../../_lib/kit-shipments';
import { supportEmail } from '../../_lib/public-site-config';
import { escapeHtml } from './send-order-validation';

export type KitShipmentEmailKind = 'received' | 'shipped';

export type KitShipmentEmailInput = {
  kind: KitShipmentEmailKind;
  toEmail: string;
  recipientName: string;
  shipmentId: string;
  giftQty: number;
  extrasQty: number;
  productTotalUsd: number;
  status: KitShipmentStatus;
  estado: string;
  ciudad: string;
  zoomOffice: string;
  zoomTracking?: string | null;
  paymentReference?: string | null;
};

export function canSendKitShipmentEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function shell(opts: {
  eyebrow: string;
  title: string;
  accent: string;
  bodyHtml: string;
  footerNote?: string;
}) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#F4F4F7;font-family:Arial,Helvetica,sans-serif;color:#18181B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F4F4F7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E4E4E7;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0 0 8px 0;color:${opts.accent};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(opts.eyebrow)}</p>
                <h1 style="margin:0;font-size:24px;line-height:1.25;color:#18181B;">${escapeHtml(opts.title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 28px 32px;font-size:15px;line-height:1.6;color:#3F3F46;">
                ${opts.bodyHtml}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;color:#8B8B9A;font-size:12px;line-height:1.5;">
            ${opts.footerNote ? escapeHtml(opts.footerNote) : `elmenuxfa · ${escapeHtml(supportEmail)}`}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendKitShipmentEmail(input: KitShipmentEmailInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) return { ok: false as const, error: 'Resend not configured' };

  const to = input.toEmail.trim().toLowerCase();
  if (!to.includes('@')) return { ok: false as const, error: 'Invalid email' };

  const code = kitOrderPublicCode(input.shipmentId);
  const destination = `${input.zoomOffice}, ${input.ciudad}, ${input.estado}`;
  const items = `${input.giftQty} de obsequio${input.extrasQty > 0 ? ` + ${input.extrasQty} extra(s)` : ''}`;

  let subject: string;
  let eyebrow: string;
  let title: string;
  let accent: string;
  let bodyHtml: string;

  if (input.kind === 'shipped') {
    subject = `Tu Kit Portamenú va en camino (${code})`;
    eyebrow = 'Envío Zoom';
    title = 'Tu pedido fue despachado';
    accent = '#16A34A';
    bodyHtml = `
      <p style="margin:0 0 12px 0;">Hola ${escapeHtml(input.recipientName)},</p>
      <p style="margin:0 0 12px 0;">Despachamos tu Kit Portamenú <strong>${escapeHtml(code)}</strong> hacia Zoom.</p>
      <p style="margin:0 0 8px 0;"><strong>Destino:</strong> ${escapeHtml(destination)}</p>
      ${input.zoomTracking ? `<p style="margin:0 0 8px 0;"><strong>Guía / referencia Zoom:</strong> ${escapeHtml(input.zoomTracking)}</p>` : ''}
      <p style="margin:12px 0 0 0;">Recuerda: el flete lo pagas en la oficina Zoom al retirar (1–2 días hábiles típicos).</p>
    `;
  } else {
    subject =
      input.status === 'pending_payment'
        ? `Recibimos tu pedido de Kit (${code}) — pendiente de pago`
        : `Recibimos tu pedido de Kit (${code})`;
    eyebrow = 'Kit Portamenú';
    title = 'Pedido recibido';
    accent = '#7C3AED';
    bodyHtml = `
      <p style="margin:0 0 12px 0;">Hola ${escapeHtml(input.recipientName)},</p>
      <p style="margin:0 0 12px 0;">Confirmamos tu solicitud <strong>${escapeHtml(code)}</strong>.</p>
      <p style="margin:0 0 8px 0;"><strong>Contenido:</strong> ${escapeHtml(items)}</p>
      <p style="margin:0 0 8px 0;"><strong>Total productos:</strong> ${escapeHtml(formatUsd(input.productTotalUsd))}</p>
      <p style="margin:0 0 8px 0;"><strong>Destino Zoom:</strong> ${escapeHtml(destination)}</p>
      ${input.paymentReference ? `<p style="margin:0 0 8px 0;"><strong>Referencia de pago:</strong> ${escapeHtml(input.paymentReference)}</p>` : ''}
      <p style="margin:12px 0 0 0;">${
        input.status === 'pending_payment'
          ? 'Revisaremos tu pago y luego prepararemos el envío por Zoom. El flete lo pagas en destino.'
          : 'Prepararemos el envío por Zoom. El flete lo pagas en la oficina al retirar (1–2 días hábiles).'
      }</p>
    `;
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim() || supportEmail;
  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: `elmenuxfa <${from}>`,
    to: [to],
    subject,
    html: shell({ eyebrow, title, accent, bodyHtml }),
  });

  if (error) {
    console.error('[kit-email]', error);
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const };
}

/** Notify ops inbox when a new kit order arrives. */
export async function notifyOpsKitShipment(input: KitShipmentEmailInput) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) return;

  const code = kitOrderPublicCode(input.shipmentId);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || supportEmail;
  const resend = new Resend(resendApiKey);
  await resend.emails
    .send({
      from: `elmenuxfa <${from}>`,
      to: [supportEmail],
      subject: `[Kit] Nuevo pedido ${code} · ${input.status}`,
      html: shell({
        eyebrow: 'Ops · Kit',
        title: `Nuevo pedido ${code}`,
        accent: '#18181B',
        bodyHtml: `
          <p><strong>Cliente:</strong> ${escapeHtml(input.recipientName)} · ${escapeHtml(input.toEmail)}</p>
          <p><strong>Items:</strong> ${input.giftQty} gift + ${input.extrasQty} extras · ${escapeHtml(formatUsd(input.productTotalUsd))}</p>
          <p><strong>Zoom:</strong> ${escapeHtml(input.zoomOffice)}, ${escapeHtml(input.ciudad)}, ${escapeHtml(input.estado)}</p>
          <p><strong>Estado:</strong> ${escapeHtml(input.status)}</p>
        `,
      }),
    })
    .catch((err) => console.error('[kit-email-ops]', err));
}
