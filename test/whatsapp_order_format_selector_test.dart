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
  testWidgets(
    'management selection remains independent and preserves format on return',
    (tester) async {
      var mode = 'platform';
      var format = 'summary';
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: StatefulBuilder(
                builder: (context, update) => WhatsappOrderFormatSelector(
                  value: format,
                  managementMode: mode,
                  showManagementMode: true,
                  titleColor: Colors.black,
                  descriptionColor: Colors.grey,
                  activeColor: Colors.green,
                  onChanged: (next) => update(() => format = next),
                  onManagementModeChanged: (next) => update(() {
                    mode = next;
                    if (next == 'whatsapp_manual') format = 'detailed';
                  }),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Comanda por WhatsApp'));
      await tester.pump();
      expect(format, 'detailed');
      expect(mode, 'platform');
      await tester.tap(find.text('Gestionar manualmente por WhatsApp'));
      await tester.pump();
      expect(mode, 'whatsapp_manual');
      expect(format, 'detailed');
      await tester.tap(find.text('Gestionar desde ElMenúXFA'));
      await tester.pump();
      expect(mode, 'platform');
      expect(format, 'detailed');
    },
  );

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
