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
  it('customized lines keep preparation details even with legacy summary, but plain configured lines do not change format', () => {
    const input = { ...order, details: { ...order.details, items: [{
      nombre: 'Producto A', cantidad: 1, precio: 40000,
      selecciones: [{ grupo: '', opcion: 'Sin ingrediente', precio: 0 }],
      personalizacion: { version: 1, componentes: [{ exclusiones: [{ nombre: 'Ingrediente' }] }] },
    }] } };
    expect(optionalMerchantComanda({}, input)).toContain('Sin ingrediente');
    expect(optionalMerchantComanda({}, { ...input, details: { ...input.details, items: [{ ...input.details.items[0], personalizacion: { version: 1, componentes: [{ exclusiones: [] }] } }] } })).toBeUndefined();
    expect(optionalMerchantComanda({}, { ...input, details: { ...input.details, items: [{ ...input.details.items[0], personalizacion: { version: 1, componentes: [{ exclusiones: [] }, { exclusiones: [] }] } }] } })).toContain('DETALLE DEL PEDIDO');
  });
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
  it('prints independent component options/exclusions from snapshots, never technical ids', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details,
      items: [{ nombre: 'Producto A + Producto B', producto: 'Producto A + Producto B', cantidad: 2, precio: 80000,
        selecciones: [
          { grupo: 'Combina con', opcion: 'Producto A + Producto B', precio: 0 },
          { grupo: 'Producto A · Formato', opcion: 'Grande', precio: 0 },
          { grupo: 'Producto A', opcion: 'Sin cebolla', precio: 0 },
          { grupo: 'Producto B · Formato', opcion: 'Grande', precio: 0 },
          { grupo: 'Producto B', opcion: 'Sin aceitunas', precio: 0 },
        ],
        personalizacion: { componentes: [{ product_id: 'SECRET_A' }, { product_id: 'SECRET_B' }] },
      }],
    } });
    for (const label of ['Producto A + Producto B', 'Producto A: Sin cebolla', 'Producto B: Sin aceitunas', '80.000']) expect(message).toContain(label);
    expect(message).not.toContain('SECRET_A');
    expect(message).not.toContain('SECRET_B');
  });
  it('prints combined lines as one natural list', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details,
      items: [{ nombre: 'Campesina + Queso y Bocadillo', producto: 'Campesina + Queso y Bocadillo', cantidad: 1, precio: 55587,
        selecciones: [
          { grupo: 'Combina con', opcion: 'Campesina + Queso y Bocadillo', precio: 0 },
          { grupo: 'Campesina · Tamaño', opcion: 'Grande', precio: 0 },
        ],
        personalizacion: { version: 1, regla_precio: 'max', precio_final: 55587, componentes: [
          { product_id: 'SECRET_A', nombre: 'Campesina', precio_efectivo: 55587,
            selecciones: [{ grupo: 'Tamaño', opcion: 'Grande', precio: 0 }, { grupo: 'Ingrediente Extra', opcion: 'Extra de pollo', precio: 3000 }],
            exclusiones: [{ id: 'r1', nombre: 'Maiz' }, { id: 'r2', nombre: 'Cebolla' }] },
          { product_id: 'SECRET_B', nombre: 'Queso y Bocadillo', precio_efectivo: 40000, selecciones: [], exclusiones: [] },
        ] },
      }],
    } });
    expect(message).toContain('*1x (Combinación) Campesina + Queso y Bocadillo*');
    expect(message).toContain([
      '• Tamaño: Grande',
      '• Ingrediente Extra: Extra de pollo',
      '• Sin: Maiz, Cebolla',
      '',
    ].join('\n'));
    expect(message).not.toContain('Combina con');
    expect(message).not.toContain('Sin cambios');
    expect(message).not.toContain('SECRET_A');
  });
  it('names the product of each removal only when both products have removals', () => {
    const component = (nombre: string, removed: string[]) => ({ nombre, selecciones: [], exclusiones: removed.map((entry) => ({ nombre: entry })) });
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details,
      items: [{ nombre: 'A + B', cantidad: 1, precio: 1000,
        personalizacion: { version: 1, componentes: [component('Campesina', ['Cebolla']), component('Hawaiana', ['Piña'])] } }],
    } });
    expect(message).toContain('• Sin: Cebolla (Campesina), Piña (Hawaiana)');
  });
  it('groups interleaved products by their stored category', () => {
    const message = buildDetailedMerchantWhatsappText({ ...order, details: { ...order.details,
      items: [
        { nombre: 'Napolitana', cantidad: 1, categoria_nombre: 'Pizzas' },
        { nombre: 'Agua', cantidad: 1, categoria_nombre: 'Bebidas' },
        { nombre: 'Campesina', cantidad: 2, categoria_nombre: 'Pizzas' },
        { nombre: 'Refresco', cantidad: 1, category_name: 'Bebidas' },
        { nombre: 'Otro', cantidad: 1 },
      ],
    } });
    expect(message.split('*Pizzas*')).toHaveLength(2);
    expect(message.split('*Bebidas*')).toHaveLength(2);
    expect(message.indexOf('Campesina')).toBeLessThan(message.indexOf('*Bebidas*'));
    expect(message.indexOf('Agua')).toBeLessThan(message.indexOf('Refresco'));
    expect(message).toContain('*Sin categoría*');
  });
  it('includes only a supplied short proof link for digital payment with a proof', () => {
    const paymentProofUrl = 'https://elmenuxfa.com/p/AbCdEf1234';
    const digital = { ...order, paymentProofUrl, details: { ...order.details,
      metodo_pago: { nombre: 'Pago móvil' }, comprobante_url: 'storage://comprobantes/private.png',
    } };
    expect(buildDetailedMerchantWhatsappText(digital)).toContain(`Comprobante: ${paymentProofUrl}`);
    expect(buildDetailedMerchantWhatsappText(digital)).not.toContain('storage://');
    expect(buildDetailedMerchantWhatsappText({ ...digital, details: { ...digital.details, comprobante_url: null } })).not.toContain('Comprobante:');
    expect(buildDetailedMerchantWhatsappText({ ...digital, details: { ...digital.details, metodo_pago: { nombre: 'Efectivo' } } })).not.toContain('Comprobante:');
    expect(buildDetailedMerchantWhatsappText({ ...digital, paymentProofUrl: undefined })).not.toContain('Comprobante:');
    expect(buildDetailedMerchantWhatsappText({ ...digital, details: { ...digital.details,
      items: Array.from({ length: 500 }, () => order.details.items[0]),
    } })).toContain(`Comprobante: ${paymentProofUrl}`);
  });
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