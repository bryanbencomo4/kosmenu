import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/services/order_manager_service.dart';
import 'package:kosmenu_app/widgets/kitchen_order/kitchen_order_widgets.dart';

const List<double> _widths = <double>[
  1440,
  1280,
  1024,
  768,
  430,
  390,
  375,
  360,
  320,
];

Widget _merchantOrderWidgets({
  required bool isDelivery,
  String? reference = '1234',
  bool hasProof = true,
}) {
  return MaterialApp(
    theme: ThemeData(useMaterial3: true),
    home: Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [
            KitchenSummaryStrip(
              isDelivery: isDelivery,
              paymentTitle: 'Pago digital: Bancolombia',
              paymentSubtitle: 'Método de pago',
              totalLabel: '16.333,33 VES',
              customerName: 'José Hernández',
              paymentReference: reference,
              hasPaymentProof: hasProof,
              onViewPaymentProof: () {},
              deliveryLabel: isDelivery ? 'Envío gratis' : null,
            ),
            KitchenPrepSection(
              items: <PedidoItemModel>[
                PedidoItemModel.fromMap(<String, dynamic>{
                  'nombre': 'POLLO - CARNE',
                  'cantidad': 1,
                  'precio': 49000,
                  'imagen_url': null,
                  'categoria_nombre': 'Hamburguesas',
                }),
              ],
              orderNotes: 'Sin cebolla.\nSalsa aparte 🍅',
            ),
          ],
        ),
      ),
    ),
  );
}

void main() {
  test(
    'old pending orders with payment evidence remain pending in the model',
    () {
      for (final age in <Duration>[
        const Duration(minutes: 16),
        const Duration(hours: 2),
      ]) {
        final order = PedidoModel.fromMap(<String, dynamic>{
          'id': 'old-${age.inMinutes}',
          'comercio_id': 'commerce-1',
          'estado': 'pendiente',
          'created_at': DateTime.now().subtract(age).toIso8601String(),
          'detalles': <String, dynamic>{
            'referencia_pago': '1234',
            'comprobante_url': 'storage://comprobantes/commerce-1/proof.png',
          },
        });
        expect(order.statusBucket, OrderStatusBucket.pending);
        expect(order.hasComprobante, isTrue);
        expect(order.paymentReference, '1234');
      }
    },
  );

  test('Flutter dashboard and detail contain no automatic timeout writer', () {
    final dashboard = File(
      'lib/screens/admin_dashboard_screen.dart',
    ).readAsStringSync();
    final detail = File(
      'lib/screens/order_detail_screen.dart',
    ).readAsStringSync();

    expect(dashboard, isNot(contains('_autoCancelExpiredPendingOrders')));
    expect(dashboard, isNot(contains('_pendingConfirmationWindow')));
    expect(detail, isNot(contains('_autoCancelExpiredPendingOrder')));
    expect(detail, isNot(contains('_isPendingExpired')));
    expect(detail, isNot(contains('timeout_no_confirmacion')));
  });

  for (final width in _widths) {
    testWidgets('merchant order summary fits at ${width.toInt()}px', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(_merchantOrderWidgets(isDelivery: true));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('Referencia: 1234'), findsOneWidget);
      expect(find.text('Ver comprobante'), findsOneWidget);
      expect(find.text('16.333,33 VES'), findsOneWidget);
      expect(find.text('POLLO - CARNE'), findsOneWidget);
      expect(find.text('Hamburguesas'), findsOneWidget);
      expect(find.text('Sin cebolla.\nSalsa aparte 🍅'), findsOneWidget);
      expect(
        tester.getSize(find.byType(OutlinedButton)).height,
        greaterThanOrEqualTo(44),
      );
    });
  }

  testWidgets('reference and receipt render independently', (tester) async {
    await tester.pumpWidget(
      _merchantOrderWidgets(
        isDelivery: false,
        reference: '1234',
        hasProof: false,
      ),
    );
    expect(find.text('Referencia: 1234'), findsOneWidget);
    expect(find.text('Ver comprobante'), findsNothing);

    await tester.pumpWidget(
      _merchantOrderWidgets(isDelivery: false, reference: null, hasProof: true),
    );
    expect(find.textContaining('Referencia:'), findsNothing);
    expect(find.text('Ver comprobante'), findsOneWidget);

    await tester.pumpWidget(
      _merchantOrderWidgets(
        isDelivery: false,
        reference: null,
        hasProof: false,
      ),
    );
    expect(find.textContaining('Referencia:'), findsNothing);
    expect(find.text('Ver comprobante'), findsNothing);
    expect(find.text('Retiro'), findsOneWidget);
  });

  for (final width in _widths) {
    testWidgets('restaurant header relative time fits at ${width.toInt()}px', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 240);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KitchenOrderHeader(
              businessName: 'Pizzas el trueno',
              orderId: 'EMXFA-000149',
              statusLabel: 'Recibido',
              statusColor: Colors.orange,
              createdAt: DateTime.now().subtract(const Duration(days: 8)),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(find.textContaining('desde el '), findsOneWidget);
      expect(find.textContaining('EMXFA-000149'), findsOneWidget);
    });
  }
}
