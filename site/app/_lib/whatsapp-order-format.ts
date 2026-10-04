import { convertOrderAmount, normalizeOrderCurrency } from '../api/_lib/order-currency';
import { isWhatsappManualOrder } from './order-management-mode';

export type WhatsappOrderFormat = 'summary' | 'detailed';

export function buildClientOrderSummary(input: {
  orderId: string;
  customerName: string;
  customerWhatsapp: string;
  deliveryMode: string;
  paymentLabel: string;
  totalLabel: string;
  appOrderUrl: string;
  managementMode?: 'platform' | 'whatsapp_manual';
}) {
  return [
    `🆕 *NUEVO PEDIDO #${input.orderId}*`,
    '',
    `👤 Cliente: ${input.customerName}`,
    `📞 ${input.customerWhatsapp}`,
    '',
    `📦 Entrega: ${input.deliveryMode === 'delivery' ? 'Delivery' : 'Retiro en tienda'}`,
    `💳 Pago: ${input.paymentLabel}`,
    '',
    `💰 Total: ${input.totalLabel}`,
    '',
    input.managementMode === 'whatsapp_manual' ? '📲 Gestión: Por WhatsApp' : '⏳ Estado: *Pendiente*',
    '',
    '🔗 Ver pedido:',
    input.appOrderUrl,
  ].join('\n');
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveWhatsappOrderFormat(commerce: unknown): WhatsappOrderFormat {
  try {
    const row = record(commerce);
    const config = record(row.config_negocio ?? record(row.branding_ia).config_negocio);
    return config.whatsapp_order_format === 'detailed' ? 'detailed' : 'summary';
  } catch {
    return 'summary';
  }
}

export type MerchantComandaInput = {
  orderId: string;
  appOrderUrl: string;
  customerName: string;
  customerWhatsapp: string;
  details: unknown;
};

function amount(value: unknown, currency: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency, maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(numeric);
}

function cleanNotes(value: unknown) {
  return text(value).replace(/^Tipo:\s*(?:Comer aqui|Para llevar|Delivery)(?:\.\s*|$)/i, '').trim();
}

export function buildDetailedMerchantWhatsappText(input: MerchantComandaInput): string {
  const details = record(input.details);
  const manual = isWhatsappManualOrder(details);
  const currency = normalizeOrderCurrency(details.moneda_checkout);
  const baseCurrency = normalizeOrderCurrency(details.moneda_base, currency);
  const exchangeRate = Number(details.tasa_cambio_snapshot);
  const convert = (value: unknown) => {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0
      ? convertOrderAmount(numeric, baseCurrency, currency, exchangeRate)
      : null;
  };
  const totalValue = details.total_moneda_checkout ?? convert(details.total);
  const totalLabel = totalValue == null ? '' : amount(totalValue, currency);
  const heading = `🧾 *PEDIDO #${input.orderId}*`;
  const separator = '━━━━━━━━━━━━━━━━━━';
  const items = Array.isArray(details.items) ? details.items : [];
  const productLines: string[] = [];
  for (const rawItem of items) {
    const item = record(rawItem);
    const quantity = Number(item.cantidad);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const name = text(item.producto) || text(item.nombre) || 'Producto';
    productLines.push(`*${quantity}x ${name}*`);
    const price = convert(item.precio_final ?? item.precio);
    if (price != null) productLines.push(`${amount(price, currency)}${quantity > 1 ? ' c/u' : ''}`);
    const snapshot = Array.isArray(item.selecciones)
      ? item.selecciones
      : Array.isArray(item.opciones) ? item.opciones : [];
    const optionLines = snapshot.map((rawOption) => {
      const option = record(rawOption);
      const label = text(option.opcion);
      const group = text(option.grupo);
      return label ? `• ${group ? `${group}: ` : ''}${label}` : '';
    }).filter(Boolean);
    if (optionLines.length) {
      productLines.push(...optionLines);
    } else {
      const selection = record(item.seleccion ?? item.opciones);
      const size = text(selection.tamanoLabel);
      if (size && !name.includes(size)) productLines.push(`• Tamaño: ${size}`);
    }
    productLines.push('');
  }

  const delivery = record(details.delivery);
  const payment = record(details.metodo_pago);
  const paymentLabel = text(payment.nombre) || text(details.metodo_pago);
  const lines = [heading, separator, '', '🍽️ *DETALLE DEL PEDIDO*', '', ...productLines];
  const notes = cleanNotes(details.order_notes);
  if (notes) lines.push('📝 *OBSERVACIONES*', notes, '');
  lines.push(separator);
  if (totalLabel) lines.push(`💰 *TOTAL: ${totalLabel}*`);
  lines.push(separator, '', '👤 *CLIENTE*');
  if (input.customerName.trim()) lines.push(input.customerName.trim());
  if (input.customerWhatsapp.trim()) lines.push(`📞 ${input.customerWhatsapp.trim()}`);
  lines.push('');
  if (delivery.mode === 'delivery') {
    lines.push('🛵 *DELIVERY*');
    if (text(delivery.address)) lines.push(`📍 Dirección: ${text(delivery.address)}`);
    if (text(delivery.reference)) lines.push(`📌 Referencia: ${text(delivery.reference)}`);
    if (text(delivery.instructions)) lines.push(`📝 Indicaciones: ${text(delivery.instructions)}`);
    const coordinates = record(delivery.coordinates);
    const lat = Number(coordinates.lat);
    const lng = Number(coordinates.lng);
    if (
      coordinates.lat != null && coordinates.lng != null &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ) lines.push(`🗺️ Maps: https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  } else {
    lines.push('📦 *RETIRO EN TIENDA*');
  }
  if (paymentLabel) lines.push(`💳 Pago: ${paymentLabel}`);
  const paymentReference = text(details.referencia_pago);
  if (/^\d{4}$/.test(paymentReference)) lines.push(`Referencia de pago: ****${paymentReference}`);
  if (paymentLabel.toLowerCase().includes('efectivo')) {
    const paidWith = Number(details.pago_con);
    const change = Number(details.cambio_de);
    if (Number.isFinite(paidWith) && paidWith > 0) lines.push(`Paga con: ${amount(paidWith, currency)}`);
    if (Number.isFinite(change) && change > 0) lines.push(`Cambio: ${amount(change, currency)}`);
  }
  lines.push(
    '', manual ? '📲 Gestión: Por WhatsApp' : '⏳ Estado: Pendiente',
    '', manual ? '🔗 *Ver pedido*' : '🔗 *Gestionar pedido*', input.appOrderUrl,
  );
  const message = lines.join('\n');
  if (message.length <= 8000 && encodeURIComponent(message).length <= 18000) return message;

  return [
    heading,
    totalLabel ? `💰 *TOTAL: ${totalLabel}*` : '',
    `⚠️ Pedido extenso (${items.length} productos). La comanda completa supera el límite de este mensaje. Revisa productos, opciones y observaciones en el enlace antes de preparar.`,
    ...(manual ? ['📲 Gestión: Por WhatsApp'] : []),
    '', manual ? '🔗 *Ver pedido completo*' : '🔗 *Gestionar pedido completo*', input.appOrderUrl,
  ].filter((line, index, entries) => line || entries[index + 1]).join('\n');
}

export function optionalMerchantComanda(commerce: unknown, input: MerchantComandaInput): string | undefined {
  if (!isWhatsappManualOrder(input.details) && resolveWhatsappOrderFormat(commerce) !== 'detailed') return undefined;
  try {
    return buildDetailedMerchantWhatsappText(input);
  } catch {
    return undefined;
  }
}