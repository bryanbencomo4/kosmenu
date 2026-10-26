import { convertOrderAmount, normalizeOrderCurrency } from '../api/_lib/order-currency';
import { isWhatsappManualOrder } from './order-management-mode';
import { combinedOrderLineSummary } from './order-line-sections';

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
  paymentProofUrl?: string;
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

type OrderTypeLabel = 'Delivery' | 'Retiro' | 'Para llevar' | 'Comer aqui';

function resolveOrderTypeLabel(details: Record<string, unknown>, delivery: Record<string, unknown>): OrderTypeLabel {
  const tipoMatch = text(details.order_notes).match(/^Tipo:\s*(Comer aqui|Para llevar|Delivery)\b/i);
  if (tipoMatch) {
    const raw = tipoMatch[1].toLowerCase();
    if (raw === 'delivery') return 'Delivery';
    if (raw === 'para llevar') return 'Para llevar';
    if (raw === 'comer aqui') return 'Comer aqui';
  }
  if (delivery.mode === 'delivery') return 'Delivery';
  return 'Retiro';
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
  const amountLabel = totalValue == null ? '' : amount(totalValue, currency);
  const delivery = record(details.delivery);
  const feePending = delivery.mode === 'delivery' && delivery.fee_pending === true;
  const totalLabel = amountLabel
    ? feePending
      ? `${amountLabel} + DELIVERY`
      : amountLabel
    : '';
  const subtotalValue =
    details.subtotal_moneda_checkout ??
    convert(details.subtotal) ??
    (totalValue != null
      ? (() => {
          const deliveryGuess =
            details.costo_delivery_moneda_checkout ?? convert(details.costo_delivery) ?? 0;
          const deliveryNum = Number(deliveryGuess);
          const totalNum = Number(totalValue);
          if (!Number.isFinite(totalNum)) return null;
          if (!Number.isFinite(deliveryNum) || deliveryNum < 0) return totalNum;
          return Math.max(0, totalNum - deliveryNum);
        })()
      : null);
  const deliveryCostValue =
    details.costo_delivery_moneda_checkout ?? convert(details.costo_delivery);
  const orderType = resolveOrderTypeLabel(details, delivery);
  const headingType =
    feePending && orderType === 'Delivery' ? 'Delivery a Acordar' : orderType;
  const heading = `🧾 *NUEVO PEDIDO #${input.orderId} (${headingType})*`;
  const separator = '━━━━━━━━━━━━━━━━━━━━';
  const items = Array.isArray(details.items) ? details.items : [];
  const categories = new Map<string, Record<string, unknown>[]>();
  for (const rawItem of items) {
    const item = record(rawItem);
    const quantity = Number(item.cantidad);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const category = text(item.categoria_nombre) || text(item.category_name) || 'Sin categoría';
    const group = categories.get(category) ?? [];
    group.push(item);
    categories.set(category, group);
  }
  const productLines: string[] = [];
  for (const [category, categoryItems] of categories) {
    productLines.push(`*${category}*`, '');
    for (const item of categoryItems) {
      const quantity = Number(item.cantidad);
      const name = text(item.producto) || text(item.nombre) || 'Producto';
      const combined = combinedOrderLineSummary(item);
      const byWeight =
        item.venta_por_peso === true ||
        text(item.unidad).toLowerCase() === 'kg' ||
        (Number.isFinite(quantity) && Math.abs(quantity - Math.round(quantity)) > 1e-9);
      const qtyLabel = byWeight
        ? (() => {
            const grams = Math.round(quantity * 1000);
            if (grams > 0 && grams < 1000) return `${grams} g`;
            const label = (Math.round(quantity * 1000) / 1000)
              .toFixed(3)
              .replace(/\.?0+$/, '')
              .replace('.', ',');
            return `${label} kg`;
          })()
        : `${Math.round(quantity)}x`;
      productLines.push(`*${qtyLabel} ${combined?.title ?? name}*`);
      const price = convert(item.precio_final ?? item.precio);
      if (price != null) {
        productLines.push(
          `${amount(price, currency)}${byWeight ? ' / kg' : quantity > 1 ? ' c/u' : ''}`,
        );
      }
      if (combined) {
        productLines.push(...combined.lines.map((line) => `• ${line}`), '');
        continue;
      }
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
  }

  const payment = record(details.metodo_pago);
  const paymentLabel = text(payment.nombre) || text(details.metodo_pago);
  const proofLink = text(details.comprobante_url) &&
    paymentLabel && !/efectivo|cash/i.test(paymentLabel)
    ? text(input.paymentProofUrl) : '';
  const lines = [heading, separator, '', '🍽️ *DETALLE DEL PEDIDO*', '', ...productLines];
  const notes = cleanNotes(details.order_notes);
  if (notes) lines.push('📝 *OBSERVACIONES*', notes, '');
  lines.push(separator, '', '💰 *RESUMEN DE PAGO*', '');
  const subtotalLabel = subtotalValue == null ? '' : amount(subtotalValue, currency);
  if (subtotalLabel) lines.push(`🛒 Subtotal productos: ${subtotalLabel}`);
  if (delivery.mode === 'delivery') {
    const deliveryLabel = feePending
      ? 'A Acordar'
      : deliveryCostValue == null
        ? ''
        : Number(deliveryCostValue) <= 0
          ? 'Gratis'
          : amount(deliveryCostValue, currency);
    if (deliveryLabel) lines.push(`🛵 Costo de delivery: ${deliveryLabel}`);
  }
  if (totalLabel) lines.push('', `💵 *TOTAL A PAGAR: ${totalLabel}*`);
  if (paymentLabel || proofLink) lines.push('');
  if (paymentLabel) lines.push(`💳 Método: ${paymentLabel}`);
  const paymentReference = text(details.referencia_pago);
  if (/^\d{4}$/.test(paymentReference)) lines.push(`🔢 Referencia: **${paymentReference}`);
  if (proofLink) lines.push(`📎 Comprobante:\n${proofLink}`);
  if (paymentLabel.toLowerCase().includes('efectivo')) {
    const paidWith = Number(details.pago_con);
    const change = Number(details.cambio_de);
    if (Number.isFinite(paidWith) && paidWith > 0) {
      lines.push(`Paga con: ${amount(paidWith, currency)}`);
      lines.push(`Cambio: ${Number.isFinite(change) && change > 0 ? amount(change, currency) : amount(0, currency)}`);
    }
  }
  lines.push(separator, '', '👤 *DATOS DEL CLIENTE*', '');
  if (input.customerName.trim()) lines.push(`👨 Nombre: ${input.customerName.trim()}`);
  if (input.customerWhatsapp.trim()) lines.push(`📞 Teléfono: ${input.customerWhatsapp.trim()}`);
  lines.push('');
  if (orderType === 'Delivery') {
    lines.push('🛵 *DATOS DE ENTREGA*', '');
    if (text(delivery.address)) lines.push(`📍 Dirección:\n${text(delivery.address)}`);
    if (text(delivery.reference)) lines.push(`🏠 Referencia: ${text(delivery.reference)}`);
    if (text(delivery.instructions)) lines.push(`📝 Indicaciones: ${text(delivery.instructions)}`);
    const coordinates = record(delivery.coordinates);
    const lat = Number(coordinates.lat);
    const lng = Number(coordinates.lng);
    if (
      coordinates.lat != null && coordinates.lng != null &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ) {
      lines.push(
        '',
        '🗺️ Ubicación en Google Maps:',
        `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      );
    }
  } else if (orderType === 'Comer aqui') {
    lines.push('🍽️ *COMER AQUI*');
  } else if (orderType === 'Para llevar') {
    lines.push('📦 *PARA LLEVAR*');
  } else {
    lines.push('📦 *RETIRO EN TIENDA*');
  }
  lines.push(
    '',
    separator,
    '',
    '📲 *GESTIÓN DEL PEDIDO*',
    manual ? 'Canal: WhatsApp' : '⏳ Estado: Pendiente',
    '',
    '🔗 *VER PEDIDO COMPLETO*',
    input.appOrderUrl,
  );
  const message = lines.join('\n');
  if (message.length <= 8000 && encodeURIComponent(message).length <= 18000) return message;

  return [
    heading,
    totalLabel ? `💵 *TOTAL A PAGAR: ${totalLabel}*` : '',
    ...(proofLink ? [`📎 Comprobante:\n${proofLink}`] : []),
    `⚠️ Pedido extenso (${items.length} productos). La comanda completa supera el límite de este mensaje. Revisa productos, opciones y observaciones en el enlace antes de preparar.`,
    ...(manual ? ['Canal: WhatsApp'] : []),
    '',
    '🔗 *VER PEDIDO COMPLETO*',
    input.appOrderUrl,
  ].filter((line, index, entries) => line || entries[index + 1]).join('\n');
}

export function optionalMerchantComanda(commerce: unknown, input: MerchantComandaInput): string | undefined {
  const details = record(input.details);
  const customized = (Array.isArray(details.items) ? details.items : []).some((rawItem) => {
    const customization = record(record(rawItem).personalizacion);
    if (customization.version !== 1 || !Array.isArray(customization.componentes)) return false;
    return customization.componentes.length === 2 || customization.componentes.some((component) => {
      const exclusions = record(component).exclusiones;
      return Array.isArray(exclusions) && exclusions.length > 0;
    });
  });
  if (!customized && !isWhatsappManualOrder(input.details) && resolveWhatsappOrderFormat(commerce) !== 'detailed') return undefined;
  try {
    return buildDetailedMerchantWhatsappText(input);
  } catch {
    return undefined;
  }
}