import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/widgets/whatsapp_order_format_selector.dart';

Widget selector({String? value, ValueChanged<String>? onChanged}) =>
    MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: WhatsappOrderFormatSelector(
            value: value,
            onChanged: onChanged,
            titleColor: Colors.black,
            descriptionColor: Colors.grey,
            activeColor: Colors.green,
          ),
        ),
      ),
    );

void main() {
  for (final width in [320.0, 390.0, 768.0]) {
    testWidgets('selector defaults to summary and fits at $width pixels', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(selector());
      expect(
        tester
            .widget<RadioGroup<String>>(find.byType(RadioGroup<String>))
            .groupValue,
        'summary',
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('detailed requires selection and can return to summary', (
    tester,
  ) async {
    String value = 'summary';
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => WhatsappOrderFormatSelector(
              value: value,
              onChanged: (next) => update(() => value = next),
              titleColor: Colors.black,
              descriptionColor: Colors.grey,
              activeColor: Colors.green,
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Comanda por WhatsApp'));
    await tester.pump();
    expect(value, 'detailed');
    await tester.tap(find.text('Resumen + enlace'));
    await tester.pump();
    expect(value, 'summary');
  });

  testWidgets('read-only selector cannot opt in', (tester) async {
    await tester.pumpWidget(selector());
    await tester.tap(find.text('Comanda por WhatsApp'));
    await tester.pump();
    expect(
      tester
          .widget<RadioGroup<String>>(find.byType(RadioGroup<String>))
          .groupValue,
      'summary',
    );
    expect(
      tester
          .widgetList<RadioListTile<String>>(find.byType(RadioListTile<String>))
          .every((tile) => tile.enabled == false),
      isTrue,
    );
  });
}
