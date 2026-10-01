import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/exchange_rate_adjustment.dart';
import 'package:kosmenu_app/widgets/exchange_adjustment_panel.dart';

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

Widget _harness({
  required TextEditingController controller,
  bool enabled = true,
  double? factor = 1.149425287,
  String issue = '',
}) {
  const source = 0.30;
  final effective = resolveEffectiveExchangeRate(
    ExchangeRateConfig(
      mode: 'auto',
      adjustment: factor == null
          ? null
          : ExchangeRateAdjustment(enabled: true, factor: factor),
    ),
    source,
  );
  return MaterialApp(
    theme: ThemeData.dark(),
    home: Scaffold(
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            child: ExchangeAdjustmentPanel(
              baseCurrency: 'COP',
              quoteCurrency: 'VES',
              enabled: enabled,
              referenceController: controller,
              referenceFromCode: 'VES',
              referenceToCode: 'COP',
              issue: issue,
              sourceRate: source,
              effectiveRate: effective,
              sourceLabel: 'P2P',
              factor: factor,
              referenceValue: 3,
              accent: Colors.purple,
              onToggled: (_) {},
              onReferenceChanged: (_) {},
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  for (final width in _widths) {
    testWidgets(
      'panel at ${width.toInt()}px has no overflow and 44px targets',
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        final controller = TextEditingController(text: '3');
        addTearDown(controller.dispose);
        await tester.pumpWidget(_harness(controller: controller));
        await tester.pumpAndSettle();

        expect(tester.takeException(), isNull);
        expect(find.text('Ajustar esta tasa para mi negocio'), findsOneWidget);
        expect(find.text('Tasa aplicada ahora'), findsOneWidget);
        expect(find.text('0,3448 VES por 1 COP'), findsOneWidget);
        expect(find.textContaining('17.241,38 Bs'), findsOneWidget);
        expect(
          find.textContaining('Se actualizará automáticamente con P2P'),
          findsOneWidget,
        );
        // The raw factor stays hidden until "Ver detalles" is opened.
        expect(find.textContaining('1,149425'), findsNothing);

        expect(
          tester.getSize(find.byType(TextField)).height,
          greaterThanOrEqualTo(44),
        );
        expect(
          tester.getSize(find.byType(CheckboxListTile)).height,
          greaterThanOrEqualTo(44),
        );
        final scroll = tester.getRect(find.byType(SingleChildScrollView));
        for (final text in tester.widgetList<Text>(find.byType(Text))) {
          final rect = tester.getRect(find.byWidget(text));
          expect(rect.right, lessThanOrEqualTo(scroll.right + 0.5));
          expect(rect.left, greaterThanOrEqualTo(scroll.left - 0.5));
        }

        await tester.tap(find.text('Ver detalles'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.textContaining('+14,94 %'), findsOneWidget);
        expect(
          find.textContaining('Ajuste configurado desde 1 VES = 3 COP'),
          findsOneWidget,
        );
      },
    );
  }

  testWidgets('narrow screens stack the preview with an arrow', (tester) async {
    tester.view.physicalSize = const Size(375, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = TextEditingController(text: '3');
    addTearDown(controller.dispose);
    await tester.pumpWidget(_harness(controller: controller));
    expect(find.text('↓'), findsOneWidget);
    expect(find.text('50.000 COP'), findsOneWidget);
    expect(find.text('17.241,38 Bs'), findsOneWidget);
  });

  testWidgets('mobile keyboard inset does not overflow at 320px', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    final controller = TextEditingController(text: '3');
    addTearDown(controller.dispose);
    await tester.pumpWidget(_harness(controller: controller));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty or invalid reference hides the applied values', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(_harness(controller: controller, factor: null));
    expect(find.text('Tasa aplicada ahora'), findsNothing);
    expect(find.textContaining('Bs'), findsNothing);

    await tester.pumpWidget(
      _harness(
        controller: controller,
        factor: null,
        issue: 'Ingresa un valor mayor que 0.',
      ),
    );
    expect(find.text('Ingresa un valor mayor que 0.'), findsOneWidget);
  });

  testWidgets('unchecked panel shows only the checkbox', (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      _harness(controller: controller, enabled: false, factor: null),
    );
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Ajustar esta tasa para mi negocio'), findsOneWidget);
  });
}
