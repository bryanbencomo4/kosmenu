import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/pedido.dart';

PedidoModel _order({
  required Map<String, dynamic> detalles,
  double total = 49000,
}) {
  return PedidoModel.fromMap(<String, dynamic>{
    'id': 'row-1',
    'comercio_id': 'commerce-1',
    'estado': 'pendiente',
    'total': total,
    'detalles': detalles,
  });
}

void main() {
  test(
    'payment proof and reference are parsed from their stored details fields',
    () {
      final order = _order(
        detalles: <String, dynamic>{
          'order_id': '10001',
          'referencia_pago': '1234',
          'comprobante_url': 'storage://comprobantes/commerce-1/proof.png',
        },
      );

      expect(order.paymentReference, '1234');
      expect(
        order.comprobanteRef,
        'storage://comprobantes/commerce-1/proof.png',
      );
      expect(order.hasComprobante, isTrue);
    },
  );

  test(
    'missing payment proof/reference remains empty for cash and legacy orders',
    () {
      final order = _order(
        detalles: <String, dynamic>{'metodo_pago': 'Efectivo'},
      );
      expect(order.paymentReference, isNull);
      expect(order.comprobanteRef, isNull);
      expect(order.hasComprobante, isFalse);
    },
  );

  test('checkout total is an immutable payment-currency snapshot', () {
    final order = _order(
      detalles: <String, dynamic>{
        'moneda_base': 'COP',
        'moneda_checkout': 'VES',
        'tasa_cambio_snapshot': 1 / 3,
        'subtotal': 49000,
        'subtotal_moneda_checkout': 16333.33,
        'costo_delivery': 0,
        'costo_delivery_moneda_checkout': 0,
        'total': 49000,
        'total_moneda_checkout': 16333.33,
        'items': <Map<String, dynamic>>[
          <String, dynamic>{
            'product_id': 'p1',
            'nombre': 'POLLO - CARNE',
            'cantidad': 1,
            'precio': 49000,
            'imagen_url': null,
            'categoria_nombre': null,
          },
        ],
      },
    );

    expect(order.currencyForDisplay(fallback: 'COP'), 'VES');
    expect(order.totalForDisplay('VES'), 16333.33);
    expect(
      order.subtotalForDisplay('VES', order.totalForDisplay('VES')),
      16333.33,
    );
    expect(
      order.itemTotalForDisplay(order.items.single, 'VES'),
      closeTo(16333.3333, 0.001),
    );
    expect(order.totalForDisplay('COP'), 49000);
  });

  test('COP-only orders keep their stored total and currency', () {
    final order = _order(
      detalles: <String, dynamic>{
        'moneda_base': 'COP',
        'moneda_checkout': 'COP',
        'subtotal': 49000,
        'subtotal_moneda_checkout': 49000,
        'total': 49000,
        'total_moneda_checkout': 49000,
      },
    );

    expect(order.currencyForDisplay(), 'COP');
    expect(order.totalForDisplay('COP'), 49000);
  });

  test('notes preserve text, multiline content, emojis, and legacy nulls', () {
    const note = 'Sin cebolla.\nSalsa aparte 🍅';
    final withNotes = _order(detalles: <String, dynamic>{'order_notes': note});
    final withFulfillment = _order(
      detalles: <String, dynamic>{'order_notes': 'Tipo: Para llevar. $note'},
    );
    final fulfillmentOnly = _order(
      detalles: <String, dynamic>{'order_notes': 'Tipo: Delivery'},
    );
    final withoutNotes = _order(
      detalles: <String, dynamic>{'order_notes': null},
    );
    final whitespace = _order(
      detalles: <String, dynamic>{'order_notes': '  \n '},
    );

    expect(withNotes.orderNotes, note);
    expect(withNotes.merchantOrderNotes, note);
      expect(withFulfillment.orderNotes, 'Tipo: Para llevar. $note');
      expect(withFulfillment.merchantOrderNotes, note);
      expect(fulfillmentOnly.orderNotes, 'Tipo: Delivery');
      expect(fulfillmentOnly.merchantOrderNotes, isNull);
    expect(withoutNotes.orderNotes, isNull);
    expect(whitespace.orderNotes, isNull);
  });

  test(
    'legacy orders and pickup/delivery payloads parse without required new fields',
    () {
      final delivery = _order(
        detalles: <String, dynamic>{
          'moneda_base': 'COP',
          'subtotal': 49000,
          'delivery': <String, dynamic>{
            'mode': 'delivery',
            'address': 'Calle 10 # 20-30',
            'reference': 'Casa azul',
            'instructions': 'Llamar al llegar',
          },
          'items': <Map<String, dynamic>>[
            <String, dynamic>{'nombre': 'MALTA', 'cantidad': 1, 'precio': 5000},
          ],
        },
      );
      final pickup = _order(
        detalles: <String, dynamic>{
          'moneda_base': 'COP',
          'delivery': <String, dynamic>{'mode': 'pickup'},
        },
      );

      expect(delivery.currencyForDisplay(), 'COP');
      expect(delivery.totalForDisplay('COP'), 49000);
      expect(delivery.deliveryMode, 'delivery');
      expect(delivery.deliveryAddress, 'Calle 10 # 20-30');
      expect(delivery.items.single.categoryName, isNull);
      expect(delivery.items.single.imageUrl, isNull);
      expect(pickup.deliveryMode, 'pickup');
      expect(pickup.deliveryAddress, isNull);
      expect(pickup.currencyForDisplay(), 'COP');
    },
  );
}
