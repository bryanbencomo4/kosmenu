import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/delivery_courier_service.dart';
import 'package:kosmenu_app/widgets/assign_courier/courier_card.dart';
import 'package:kosmenu_app/widgets/assign_courier/empty_courier_state.dart';
import 'package:flutter/material.dart';

void main() {
  const courier = DeliveryCourier(
    id: 'c1',
    alias: 'Bryan',
    phoneE164: '++1-555-0042',
    normalizedPhone: '584140821633',
    completedOrdersCount: 3,
  );

  testWidgets('empty courier state exposes register action', (tester) async {
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: EmptyCourierState(onRegister: () => tapped = true),
        ),
      ),
    );
    expect(find.text('Aún no has registrado un repartidor'), findsOneWidget);
    await tester.tap(find.text('Registrar repartidor'));
    expect(tapped, isTrue);
  });

  testWidgets('courier card shows name, phone and selection', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CourierCard(
            courier: courier,
            selected: true,
            onTap: _noop,
          ),
        ),
      ),
    );
    expect(find.text('Bryan'), findsOneWidget);
    expect(find.byIcon(Icons.check_rounded), findsOneWidget);
  });
}

void _noop() {}
