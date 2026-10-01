import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/pedido.dart';
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
}
