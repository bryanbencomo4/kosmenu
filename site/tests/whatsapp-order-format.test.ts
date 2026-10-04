import { describe, expect, it } from 'vitest';
import { buildClientOrderSummary, buildDetailedMerchantWhatsappText, optionalMerchantComanda, resolveWhatsappOrderFormat } from '../app/_lib/whatsapp-order-format';

const url = 'https://app.elmenuxfa.com/orders/view/EMXFA-000156?shortCode=AbCdEf1234';
const order = {
  orderId: 'EMXFA-000156', appOrderUrl: url,
  customerName: 'Cliente Preview', customerWhatsapp: '+584121234567',
  details: {
    moneda_base: 'COP', moneda_checkout: 'COP', total_moneda_checkout: 40500,
    items: [{ nombre: 'Pizza · Grande · Extra queso', producto: 'Pizza', cantidad: 2, precio: 18000,
      selecciones: [{ grupo: 'Tamaño', opcion: 'Grande', precio: 0 }, { grupo: 'Extras', opcion: 'Extra queso', precio: 1000 }] },
      { nombre: 'Coca-Cola 1.5L', cantidad: 1, precio: 4500 }],
    delivery: { mode: 'pickup', address: 'No mostrar al retirar' },
    metodo_pago: { nombre: 'Efectivo', datos: ['dato interno que no debe salir'] },
  },
};
const detailed = { branding_ia: { config_negocio: { whatsapp_order_format: 'detailed' } } };

describe('legacy client summary byte-for-byte regression', () => {
  it('manual fallback never promises platform tracking', () => {
    const message = buildClientOrderSummary({
      orderId: order.orderId, customerName: order.customerName,
      customerWhatsapp: order.customerWhatsapp, deliveryMode: 'pickup',
      paymentLabel: 'Efectivo', totalLabel: '$ 40.500', appOrderUrl: url,
      managementMode: 'whatsapp_manual',
    });
    expect(message).toContain('📲 Gestión: Por WhatsApp');
    expect(message).not.toContain('Estado:');
  });
  it('preserves the existing title, whitespace, payment and secure URL', () => {
    expect(buildClientOrderSummary({
      orderId: order.orderId, customerName: order.customerName,
      customerWhatsapp: order.customerWhatsapp, deliveryMode: 'pickup',
      paymentLabel: 'Efectivo', totalLabel: '$ 40.500', appOrderUrl: url,
    })).toBe('🆕 *NUEVO PEDIDO #EMXFA-000156*\n\n👤 Cliente: Cliente Preview\n📞 +584121234567\n\n📦 Entrega: Retiro en tienda\n💳 Pago: Efectivo\n\n💰 Total: $ 40.500\n\n⏳ Estado: *Pendiente*\n\n🔗 Ver pedido:\n' + url);
  });
});

describe('strict per-commerce WhatsApp opt-in', () => {
  it.each([undefined, null, {}, { config_negocio: null }, { config_negocio: { whatsapp_order_format: 'summary' } }, { config_negocio: { whatsapp_order_format: 'DETAILED' } }])('defaults to unchanged legacy fallback for %j', (commerce) => {
    expect(resolveWhatsappOrderFormat(commerce)).toBe('summary');
    expect(optionalMerchantComanda(commerce, order)).toBeUndefined();
  });
  it('isolates A detailed from B summary and supports immediate rollback', () => {
    expect(optionalMerchantComanda(detailed, order)).toContain('DETALLE DEL PEDIDO');
    expect(optionalMerchantComanda({}, order)).toBeUndefined();
    expect(optionalMerchantComanda({ branding_ia: { config_negocio: { whatsapp_order_format: 'summary' } } }, order)).toBeUndefined();
  });
  it('configuration read errors fall back to legacy summary', () => {
    const commerce = { get config_negocio() { throw new Error('read failed'); } };
    expect(optionalMerchantComanda(commerce, order)).toBeUndefined();
  });
  it('formatter failure falls back to summary without interrupting notification construction', () => {
    expect(optionalMerchantComanda(detailed, {
      ...order, details: { ...order.details, moneda_checkout: 'invalid currency' },
    })).toBeUndefined();
  });
});

describe('merchant comanda from stored snapshots', () => {
  it('manual footer is read-only and preserves the exact secure link', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details, management_mode: 'whatsapp_manual' } });
    expect(message).toContain('📲 Gestión: Por WhatsApp');
    expect(message).toContain('🔗 *Ver pedido*');
    expect(message).not.toContain('Estado: Pendiente');
    expect(message).not.toContain('Gestionar pedido');
    expect(message).toContain(url);
  });
  it('omits missing prices and never prints private payment metadata', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details,
      items: [{ nombre: 'Agua', cantidad: 1, precio: null }],
      referencia_pago: '1234', token: 'INTERNAL_SECRET', comprobante_url: 'storage://private-proof',
    } });
    expect(message).not.toContain('c/u');
    expect(message).not.toContain('$0');
    expect(message).toContain('****1234');
    expect(message).not.toContain('INTERNAL_SECRET');
    expect(message).not.toContain('private-proof');
  });
  it('keeps quantities, named modifiers, totals and exactly the existing secure link', () => {
    const message = buildDetailedMerchantWhatsappText(order);
    expect(message).toContain('*2x Pizza*');
    expect(message).toContain('• Tamaño: Grande');
    expect(message).toContain('• Extras: Extra queso');
    expect(message).toContain('40.500');
    expect(message.split(url)).toHaveLength(2);
    expect(message).not.toContain('dato interno');
  });
  it('pickup does not print address, reference or Maps', () => {
    const message = buildDetailedMerchantWhatsappText(order);
    expect(message).toContain('RETIRO EN TIENDA');
    expect(message).not.toContain('Dirección:');
    expect(message).not.toContain('maps/search');
  });
  it('delivery preserves real address, reference, instructions and valid coordinates', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details,
      delivery: { mode: 'delivery', address: 'Calle Preview 1', reference: 'Puerta azul', instructions: 'Tocar timbre', coordinates: { lat: 7.8, lng: -72.2 } },
    } });
    for (const value of ['DELIVERY', 'Calle Preview 1', 'Puerta azul', 'Tocar timbre', 'query=7.8,-72.2']) expect(message).toContain(value);
  });
  it('invalid or absent coordinates never invent a Maps location', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details, delivery: { mode: 'delivery' } } });
    expect(message).not.toContain('Maps:');
    expect(message).not.toContain('Dirección:');
  });
  it('simple products omit options and empty observation blocks', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details, items: [{ nombre: 'Agua', cantidad: 1, precio: 2000 }] } });
    expect(message).toContain('*1x Agua*');
    expect(message).not.toContain('•');
    expect(message).not.toContain('OBSERVACIONES');
  });
  it('preserves observations but removes the fulfillment-only prefix', () => {
    expect(buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details, order_notes: 'Tipo: Delivery. Cortar en ocho partes' } })).toContain('OBSERVACIONES*\nCortar en ocho partes');
    expect(buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details, order_notes: 'Tipo: Delivery' } })).not.toContain('OBSERVACIONES');
  });
  it('oversized orders use a clearly warned fallback without changing order id, total or management URL', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details, items: Array.from({ length: 500 }, () => order.details.items[0]) } });
    expect(message).toContain('Pedido extenso (500 productos)');
    expect(message).toContain('EMXFA-000156');
    expect(message).toContain('40.500');
    expect(message).toContain(url);
    expect(message.length).toBeLessThan(12000);
  });
});