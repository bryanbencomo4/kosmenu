import { Resend } from 'resend';

import { supportEmail } from '../../_lib/public-site-config';
import {
  escapeHtml,
  resolveSafeMenuUrl,
  resolveSafeTrackingUrl,
  sanitizeDisplayName,
} from './send-order-validation';

export type SendOrderEmailItem = {
  name: string;
  quantity: number;
  lineTotal?: number | null;
};

export type SendOrderEmailInput = {
  clientEmail: string;
  clientName?: string;
  comercioNombre: string;
  comercioName?: string;
  orderId: string;
  orderTrackingUrl?: string;
  comercioSlug?: string | null;
  items?: SendOrderEmailItem[];
  currency?: string;
  subtotal?: number | null;
  deliveryFee?: number | null;
  total?: number | null;
  fulfillmentLabel?: string;
  managementMode?: 'platform' | 'whatsapp_manual' | string | null;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendOrderEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function formatMoney(amount: number | null | undefined, currency: string) {
  if (!Number.isFinite(amount ?? NaN)) return '';
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'COP' || code === 'VES' ? 0 : 2,
    }).format(Number(amount));
  } catch {
    return `${Number(amount).toFixed(2)} ${code}`;
  }
}

function hrefAttr(url: string) {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function fulfillmentDisplayLabel(raw: string) {
  const value = raw.trim().toLowerCase();
  if (value.includes('comer') || value.includes('aqui') || value.includes('aquí') || value.includes('dine')) {
    return 'Consumo en el restaurante';
  }
  if (value.includes('llevar') || value.includes('takeaway') || value.includes('pickup') || value.includes('retiro')) {
    return 'Para llevar';
  }
  if (value.includes('delivery') || value.includes('domicilio')) {
    return 'Delivery';
  }
  return raw.trim() || 'Pedido';
}

export async function sendOrderEmail(input: SendOrderEmailInput) {
  const clientEmail = (input.clientEmail ?? '').trim().toLowerCase();
  const clientName = sanitizeDisplayName(input.clientName ?? '');
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

  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || `elmenuxfa.com <${supportEmail}>`;
  const resend = new Resend(resendApiKey);

  const trackingLink = resolveSafeTrackingUrl(input.orderTrackingUrl, orderId, input.comercioSlug);
  const menuLink = resolveSafeMenuUrl(input.comercioSlug);
  // Use query flags (not hashes): short-link redirects drop fragments.
  const withQuery = (base: string, key: string) => {
    const joiner = base.includes('?') ? '&' : '?';
    return `${base}${joiner}${key}=1`;
  };
  const ratingLink = trackingLink ? withQuery(trackingLink, 'rate') : '';
  const repeatLink = trackingLink ? withQuery(trackingLink, 'repeat') : menuLink || '';
  const isWhatsappManaged = (input.managementMode ?? '').toString().trim() === 'whatsapp_manual';

  const safeComercio = escapeHtml(comercioNombre);
  const safeOrderId = escapeHtml(orderId);
  const safeHello = clientName ? escapeHtml(clientName.split(/\s+/)[0] ?? clientName) : '';
  const currency = (input.currency ?? 'USD').toUpperCase();
  const fulfillment = fulfillmentDisplayLabel(input.fulfillmentLabel ?? '');
  const subject = `Pedido confirmado · ${comercioNombre}`.slice(0, 180);

  const items = (input.items ?? [])
    .filter((item) => (item.name ?? '').trim() && Number(item.quantity) > 0)
    .slice(0, 40);

  const itemsSum = items.reduce((sum, item) => {
    const line = Number(item.lineTotal);
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);

  const subtotalValue = Number.isFinite(input.subtotal ?? NaN) ? Number(input.subtotal) : itemsSum;
  const deliveryValue = Number.isFinite(input.deliveryFee ?? NaN) ? Math.max(0, Number(input.deliveryFee)) : 0;
  const totalValue = Number.isFinite(input.total ?? NaN)
    ? Number(input.total)
    : subtotalValue + deliveryValue;

  const itemRows = items
    .map((item) => {
      const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
      const name = escapeHtml((item.name ?? 'Producto').trim().slice(0, 120));
      const line = formatMoney(item.lineTotal, currency);
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #27272A;vertical-align:top;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td width="44" valign="top" style="padding-right:12px;">
                  <div style="width:40px;height:40px;border-radius:12px;background-color:#7C3AED;text-align:center;line-height:40px;color:#FFFFFF;font-size:18px;">✦</div>
                </td>
                <td valign="top" style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">
                  <p style="margin:0;font-size:15px;font-weight:700;line-height:1.35;">${name}</p>
                  <p style="margin:4px 0 0 0;color:#A1A1AA;font-size:13px;">Cantidad: ${qty}</p>
                </td>
                <td valign="top" align="right" style="color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;white-space:nowrap;padding-left:12px;">
                  ${line ? escapeHtml(line) : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  const secondaryLinks = [
    menuLink
      ? `<a href="${hrefAttr(menuLink)}" style="color:#A1A1AA;text-decoration:none;font-size:14px;font-weight:600;" rel="noreferrer">Ver menú</a>`
      : '',
    repeatLink
      ? `<a href="${hrefAttr(repeatLink)}" style="color:#A1A1AA;text-decoration:none;font-size:14px;font-weight:600;" rel="noreferrer">Repetir pedido</a>`
      : '',
  ]
    .filter(Boolean)
    .join('<span style="color:#52525B;padding:0 10px;">·</span>');

  const primaryCta = isWhatsappManaged
    ? ratingLink
      ? {
          href: ratingLink,
          label: 'Calificar el restaurante →',
          hint: 'Tu opinión cuenta. Puedes calificar una vez y cambiarla después si lo deseas.',
        }
      : trackingLink
        ? {
            href: trackingLink,
            label: 'Ver mi pedido →',
            hint: '',
          }
        : null
    : trackingLink
      ? {
          href: trackingLink,
          label: 'Ver estado de mi pedido →',
          hint: '',
        }
      : null;

  const secondaryCta =
    isWhatsappManaged && trackingLink
      ? {
          href: trackingLink,
          label: 'Ver estado de mi pedido',
        }
      : !isWhatsappManaged && ratingLink
        ? {
            href: ratingLink,
            label: 'Calificar el restaurante',
          }
        : null;

  const html = `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#09090B;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090B;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#18181B;border-radius:28px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellspacing="0" cellpadding="0">
                        <tr>
                          <td width="44" valign="middle" style="padding-right:12px;">
                            <div style="width:42px;height:42px;border-radius:12px;background-color:#7C3AED;text-align:center;line-height:42px;color:#FFFFFF;font-size:20px;">🍴</div>
                          </td>
                          <td valign="middle">
                            <p style="margin:0;color:#FFFFFF;font-size:16px;font-weight:800;letter-spacing:0.02em;">ELMENU XFA</p>
                            <p style="margin:2px 0 0 0;color:#A1A1AA;font-size:12px;">Pedidos en línea</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" valign="middle" width="48">
                      <div style="width:36px;height:36px;border-radius:999px;background-color:#16A34A;text-align:center;line-height:36px;color:#FFFFFF;font-size:18px;font-weight:700;">✓</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 28px 8px 28px;">
                <h1 style="margin:0;color:#FFFFFF;font-size:30px;line-height:1.2;font-weight:800;">¡Tu pedido está confirmado!</h1>
                <p style="margin:14px 0 0 0;color:#A1A1AA;font-size:15px;line-height:1.6;">
                  Hola${safeHello ? `, <strong style="color:#FFFFFF;">${safeHello}</strong>` : ''}.
                  Recibimos correctamente tu pedido. El restaurante ya tiene los detalles de tu compra.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px 8px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#000000;border-radius:20px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td style="color:#A1A1AA;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">N.º de pedido</td>
                          <td align="right" style="color:#FFFFFF;font-size:14px;font-weight:700;">#${safeOrderId}</td>
                        </tr>
                      </table>
                      <p style="margin:14px 0 0 0;color:#FFFFFF;font-size:22px;font-weight:800;line-height:1.25;">${safeComercio}</p>
                      <p style="margin:10px 0 0 0;color:#D4D4D8;font-size:14px;">📍 ${escapeHtml(fulfillment)}</p>
                      ${
                        isWhatsappManaged
                          ? `<p style="margin:10px 0 0 0;color:#C4B5FD;font-size:13px;font-weight:600;">Gestionado por WhatsApp</p>`
                          : ''
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${
              itemRows
                ? `<tr>
              <td style="padding:18px 28px 8px 28px;">
                <p style="margin:0 0 8px 0;color:#FFFFFF;font-size:16px;font-weight:800;">Resumen de tu compra</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}</table>
                ${
                  deliveryValue > 0
                    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:10px;">
                  <tr>
                    <td style="color:#A1A1AA;font-size:14px;">Delivery</td>
                    <td align="right" style="color:#A1A1AA;font-size:14px;font-weight:700;">${escapeHtml(formatMoney(deliveryValue, currency))}</td>
                  </tr>
                </table>`
                    : ''
                }
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-top:1px solid #27272A;">
                  <tr>
                    <td style="padding-top:16px;color:#FFFFFF;font-size:15px;font-weight:700;">Total del pedido</td>
                    <td align="right" style="padding-top:16px;color:#FFFFFF;font-size:20px;font-weight:800;white-space:nowrap;">${escapeHtml(formatMoney(totalValue, currency))}</td>
                  </tr>
                </table>
              </td>
            </tr>`
                : ''
            }

            <tr>
              <td style="padding:22px 28px 10px 28px;">
                ${
                  primaryCta
                    ? `<a href="${hrefAttr(primaryCta.href)}" style="display:block;background-color:#7C3AED;border-radius:16px;padding:16px 20px;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:800;text-align:center;line-height:1.2;" rel="noreferrer">${escapeHtml(primaryCta.label)}</a>`
                    : `<p style="margin:0;color:#A1A1AA;font-size:14px;text-align:center;">Referencia: <strong style="color:#FFFFFF;">#${safeOrderId}</strong></p>`
                }
                ${
                  primaryCta?.hint
                    ? `<p style="margin:12px 0 0 0;color:#A1A1AA;font-size:12px;line-height:1.5;text-align:center;">${escapeHtml(primaryCta.hint)}</p>`
                    : ''
                }
                ${
                  secondaryCta
                    ? `<p style="margin:14px 0 0 0;text-align:center;">
                  <a href="${hrefAttr(secondaryCta.href)}" style="color:#C4B5FD;text-decoration:none;font-size:14px;font-weight:700;" rel="noreferrer">${escapeHtml(secondaryCta.label)}</a>
                </p>`
                    : ''
                }
                ${
                  secondaryLinks
                    ? `<p style="margin:16px 0 0 0;text-align:center;">${secondaryLinks}</p>`
                    : ''
                }
              </td>
            </tr>

            <tr>
              <td style="padding:8px 28px 28px 28px;">
                <p style="margin:0;color:#52525B;font-size:12px;line-height:1.5;text-align:center;">
                  Este es un correo automático de confirmación de tu pedido.
                </p>
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
