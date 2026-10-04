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
  testWidgets('proof summary uses checkout currency and saved cash/change', (
    tester,
  ) async {
    final pedido = PedidoModel.fromMap({
      'id': 'proof',
      'comercio_id': 'merchant',
      'total': 20,
      'detalles': {
        'order_id': 'EMXFA-000156',
        'moneda_base': 'USD',
        'moneda_checkout': 'VES',
        'total_moneda_checkout': 1200.5,
        'metodo_pago': {'nombre': 'Efectivo'},
        'pago_con': 2000,
        'cambio_de': 799.5,
      },
    });
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PaymentProofContent(
            pedido: pedido,
            reference: '1234',
            image: const SizedBox.shrink(),
          ),
        ),
      ),
    );
    for (final value in [
      'Efectivo',
      'VES',
      '1.200,50',
      'Paga con',
      'VES 2.000,00',
      'Cambio',
      'VES 799,50',
      '****1234',
    ]) {
      expect(find.text(value), findsOneWidget);
    }
    expect(find.text('USD'), findsNothing);
  });

  testWidgets(
    'digital payments omit cash fields and never claim verified payment',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PaymentProofContent(
              pedido: PedidoModel(
                id: 'digital',
                comercioId: 'merchant',
                metodoPago: 'Pago móvil',
                total: 100,
                detalles: {'moneda_base': 'VES'},
              ),
              image: SizedBox.shrink(),
            ),
          ),
        ),
      );
      expect(find.text('Pago móvil'), findsOneWidget);
      expect(find.text('Cambio'), findsNothing);
      expect(find.text('No aplica'), findsNothing);
      expect(find.text('Paga con'), findsNothing);
      expect(find.textContaining('verificado'), findsNothing);
    },
  );

  testWidgets('proof view does not expose longer payment references', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PaymentProofContent(
            reference: '123456789',
            image: SizedBox.shrink(),
          ),
        ),
      ),
    );
    expect(find.textContaining('123456789'), findsNothing);
    expect(find.textContaining('Referencia:'), findsNothing);
  });

  for (final width in [320.0, 390.0, 768.0]) {
    testWidgets('proof image and last four reference fit at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: PaymentProofContent(
              reference: '1234',
              pedido: PedidoModel(
                id: 'proof',
                comercioId: 'merchant',
                orderId: 'EMXFA-000156',
                metodoPago: 'Transferencia bancaria internacional',
                total: 123456789.5,
                detalles: {'moneda_base': 'VES'},
              ),
              image: ColoredBox(
                key: ValueKey('payment-proof-image'),
                color: Colors.white,
              ),
            ),
          ),
        ),
      );
      expect(find.text('Referencia'), findsOneWidget);
      expect(find.text('****1234'), findsOneWidget);
      expect(find.text('Transferencia bancaria internacional'), findsOneWidget);
      expect(find.text('VES'), findsOneWidget);
      expect(find.byKey(const ValueKey('payment-proof-image')), findsOneWidget);
      expect(
        tester
            .getSize(find.byKey(const ValueKey('payment-proof-image')))
            .height,
        greaterThan(250),
      );
      expect(find.byType(InteractiveViewer), findsOneWidget);
      expect(find.byType(KitchenStatusTimeline), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('products are grouped under one category heading', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: KitchenPrepSection(
              items: const [
                PedidoItemModel(
                  nombre: 'Pizza de queso',
                  cantidad: 1,
                  precio: 10,
                  categoryName: 'Pizzas',
                ),
                PedidoItemModel(
                  nombre: 'Pizza campesina',
                  cantidad: 2,
                  precio: 12,
                  categoryName: 'Pizzas',
                ),
                PedidoItemModel(
                  nombre: 'Refresco',
                  cantidad: 1,
                  precio: 3,
                  categoryName: 'Bebidas',
                ),
              ],
            ),
          ),
        ),
      ),
    );
    expect(find.text('Pizzas'), findsOneWidget);
    expect(find.text('Bebidas'), findsOneWidget);
    expect(find.text('Pizza de queso'), findsOneWidget);
    expect(find.text('Pizza campesina'), findsOneWidget);
    expect(find.text('Refresco'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Pizzas')).dy,
      lessThan(tester.getTopLeft(find.text('Pizza de queso')).dy),
    );
    expect(
      tester.getTopLeft(find.text('Pizza campesina')).dy,
      lessThan(tester.getTopLeft(find.text('Bebidas')).dy),
    );
    expect(
      tester.getTopLeft(find.text('Bebidas')).dy,
      lessThan(tester.getTopLeft(find.text('Refresco')).dy),
    );
  });

  testWidgets('map action overlays preview and opens navigation', (
    tester,
  ) async {
    var opened = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: KitchenDeliveryCard(
              isDelivery: true,
              customerName: 'Cliente',
              customerEmail: '',
              customerPhone: '',
              address: 'Calle 1',
              coordinatesLabel: '10.5, -66.9',
              mapPreview: const ColoredBox(color: Colors.blueGrey),
              onOpenMap: () => opened = true,
            ),
          ),
        ),
      ),
    );

    final button = find.text('Ver mapa');
    expect(button, findsOneWidget);
    expect(
      find.ancestor(of: button, matching: find.byType(Stack)),
      findsOneWidget,
    );
    await tester.tap(button);
    expect(opened, isTrue);
  });

  test('old pending orders with payment evidence stay pending', () {
    for (final age in [const Duration(minutes: 16), const Duration(hours: 2)]) {
      final order = PedidoModel.fromMap({
        'id': 'old-${age.inMinutes}',
        'comercio_id': 'merchant',
        'estado': 'pendiente',
        'created_at': DateTime.now().subtract(age).toIso8601String(),
        'detalles': {
          'referencia_pago': '1234',
          'comprobante_url': 'storage://comprobantes/merchant/proof.png',
        },
      });
      expect(order.statusBucket, OrderStatusBucket.pending);
      expect(order.hasComprobante, isTrue);
      expect(order.paymentReference, '1234');
    }
  });

  test('dashboard and detail never automatically cancel pending orders', () {
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
    testWidgets('relative order time fits at ${width.toInt()}px', (
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
    });

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
}
