import 'server-only';

import { Resend } from 'resend';

import { appSiteUrl, supportEmail } from '../../_lib/public-site-config';
import { escapeHtml } from './send-order-validation';

export type BillingPaymentEmailKind = 'received' | 'approved' | 'rejected';

export type BillingPaymentEmailInput = {
  kind: BillingPaymentEmailKind;
  toEmail: string;
  businessName: string;
  methodName: string;
  amountUsd: number;
  months: number;
  reference?: string | null;
  declaredAmount?: number | null;
  declaredCurrency?: string | null;
  reviewNote?: string | null;
  submissionId: string;
  paymentId?: string | null;
  periodEnd?: string | null;
  receiptUrl?: string | null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendBillingPaymentEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function formatDeclared(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) return null;
  const code = (currency ?? '').trim().toUpperCase() || 'VES';
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: code === 'BS' || code === 'VES' ? 'VES' : code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Caracas',
  }).format(date);
}

function receiptNumber(submissionId: string, paymentId?: string | null) {
  const seed = (paymentId || submissionId).replace(/-/g, '').slice(0, 10).toUpperCase();
  return `EMX-${seed}`;
}

function shell(opts: {
  eyebrow: string;
  title: string;
  accent: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}) {
  const safeTitle = escapeHtml(opts.title);
  const safeEyebrow = escapeHtml(opts.eyebrow);
  const cta =
    opts.ctaHref && opts.ctaLabel
      ? `<tr>
          <td style="padding:8px 32px 28px 32px;text-align:center;">
            <a href="${opts.ctaHref.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
               style="display:inline-block;background-color:${opts.accent};border-radius:999px;padding:14px 28px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;"
               rel="noreferrer">${escapeHtml(opts.ctaLabel)}</a>
          </td>
        </tr>`
      : '';
  const footer = opts.footerNote
    ? `<p style="margin:0;color:#8B8B9A;font-size:12px;line-height:1.5;">${escapeHtml(opts.footerNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#F4F4F7;font-family:Arial,Helvetica,sans-serif;color:#18181B;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F4F4F7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E4E4E7;">
            <tr>
              <td style="background-color:#18181B;padding:26px 28px;text-align:left;">
                <p style="margin:0;color:#A1A1AA;font-size:11px;letter-spacing:2.4px;font-weight:700;text-transform:uppercase;">elmenuxfa.com</p>
                <p style="margin:10px 0 0 0;color:${opts.accent};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${safeEyebrow}</p>
                <h1 style="margin:8px 0 0 0;color:#FFFFFF;font-size:26px;line-height:1.25;font-weight:800;">${safeTitle}</h1>
              </td>
            </tr>
            ${opts.bodyHtml}
            ${cta}
            <tr>
              <td style="padding:0 32px 28px 32px;border-top:1px solid #F4F4F5;">
                <p style="margin:20px 0 6px 0;color:#71717A;font-size:12px;line-height:1.5;">
                  ¿Necesitas ayuda? Escríbenos a
                  <a href="mailto:${escapeHtml(supportEmail)}" style="color:#18181B;font-weight:700;text-decoration:none;">${escapeHtml(supportEmail)}</a>
                </p>
                ${footer}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;color:#A1A1AA;font-size:11px;">© ${new Date().getFullYear()} elmenuxfa.com · Pagos y suscripciones</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function detailRow(label: string, value: string) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #F4F4F5;color:#71717A;font-size:13px;width:42%;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #F4F4F5;color:#18181B;font-size:13px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
  </tr>`;
}

export async function sendBillingPaymentEmail(input: BillingPaymentEmailInput) {
  const toEmail = (input.toEmail ?? '').trim().toLowerCase();
  if (!toEmail || !emailRegex.test(toEmail)) {
    return { ok: false as const, skipped: true as const, reason: 'invalid-email' };
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false as const, skipped: true as const, reason: 'resend-not-configured' };
  }

  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || `elmenuxfa.com Pagos <${supportEmail}>`;
  const businessName = (input.businessName || 'tu negocio').trim();
  const methodName = (input.methodName || 'Pago').trim();
  const dashboardUrl = `${appSiteUrl.replace(/\/$/, '')}/`;
  const receiptNo = receiptNumber(input.submissionId, input.paymentId);
  const amountLabel = formatUsd(input.amountUsd);
  const declared = formatDeclared(input.declaredAmount, input.declaredCurrency);
  const periodEnd = formatDate(input.periodEnd);
  const monthsLabel = `${input.months} mes${input.months === 1 ? '' : 'es'}`;

  let subject = '';
  let eyebrow = '';
  let title = '';
  let accent = '#6D28D9';
  let lead = '';
  let extraRows = '';
  let ctaLabel = 'Abrir mi panel';
  let footerNote = `Recibo ${receiptNo}`;

  if (input.kind === 'received') {
    subject = `Recibimos tu pago · ${businessName}`.slice(0, 180);
    eyebrow = 'Pago en revisión';
    title = 'Comprobante recibido';
    accent = '#2563EB';
    lead = `Gracias. Registramos tu pago de <strong>${escapeHtml(methodName)}</strong> para <strong>${escapeHtml(businessName)}</strong>. Nuestro equipo lo está verificando. Te avisaremos por este correo cuando esté aprobado o si necesitamos algo más.`;
    extraRows = detailRow('Estado', 'En revisión');
  } else if (input.kind === 'approved') {
    subject = `Pago aprobado · Recibo ${receiptNo}`.slice(0, 180);
    eyebrow = 'Pago confirmado';
    title = 'Tu menú ya está activo';
    accent = '#059669';
    lead = `Confirmamos tu pago. La suscripción de <strong>${escapeHtml(businessName)}</strong> quedó activa. Guarda este correo como recibo oficial.`;
    extraRows =
      detailRow('Estado', 'Aprobado') +
      (periodEnd ? detailRow('Vigente hasta', periodEnd) : '') +
      detailRow('Recibo', receiptNo);
    ctaLabel = 'Ver mi menú publicado';
    footerNote = `Este mensaje es tu recibo de pago ${receiptNo}. Consérvalo para tu contabilidad.`;
  } else {
    subject = `No pudimos verificar tu pago · ${businessName}`.slice(0, 180);
    eyebrow = 'Pago no verificado';
    title = 'Necesitamos que lo intentes de nuevo';
    accent = '#DC2626';
    lead = `Revisamos el comprobante de <strong>${escapeHtml(methodName)}</strong> para <strong>${escapeHtml(businessName)}</strong> y no pudimos validarlo. Puedes enviar un nuevo pago desde el panel con un comprobante más claro.`;
    extraRows =
      detailRow('Estado', 'Rechazado') +
      (input.reviewNote
        ? detailRow('Motivo', input.reviewNote.trim().slice(0, 280))
        : '');
    ctaLabel = 'Reintentar pago';
  }

  const rows =
    detailRow('Negocio', businessName) +
    detailRow('Método', methodName) +
    detailRow('Plan', monthsLabel) +
    detailRow('Monto del plan', amountLabel) +
    (declared ? detailRow('Monto declarado', declared) : '') +
    (input.reference ? detailRow('Referencia', input.reference) : '') +
    extraRows;

  const bodyHtml = `
    <tr>
      <td style="padding:28px 32px 8px 32px;">
        <p style="margin:0;color:#3F3F46;font-size:15px;line-height:1.65;">${lead}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 8px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAFAFA;border:1px solid #F4F4F5;border-radius:16px;padding:8px 18px;">
          ${rows}
        </table>
      </td>
    </tr>`;

  const html = shell({
    eyebrow,
    title,
    accent,
    bodyHtml,
    ctaLabel,
    ctaHref: dashboardUrl,
    footerNote,
  });

  const resend = new Resend(resendApiKey);
  await resend.emails.send({
    from: fromEmail,
    to: [toEmail],
    subject,
    html,
    ...(input.kind === 'approved'
      ? { headers: { 'X-Entity-Ref-ID': receiptNo } }
      : {}),
  });

  return { ok: true as const, receiptNumber: receiptNo };
}
