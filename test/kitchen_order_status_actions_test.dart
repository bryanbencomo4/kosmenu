import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/widgets/kitchen_order/kitchen_order_widgets.dart';

void main() {
  PedidoModel order(String estado) => PedidoModel(
        id: '1',
        comercioId: 'c1',
        estado: estado,
      );

  test('delivery shows only the next status action', () {
    expect(
      KitchenMockupActionsBar.nextAction(estado: 'pendiente', isDelivery: true)?.status,
      'confirmado',
    );
    expect(
      KitchenMockupActionsBar.nextAction(estado: 'confirmado', isDelivery: true)?.label,
      'Marcar en camino',
    );
    expect(
      KitchenMockupActionsBar.nextAction(estado: 'en_camino', isDelivery: true)?.label,
      'Marcar entregado',
    );
    expect(
      KitchenMockupActionsBar.nextAction(estado: 'entregado', isDelivery: true),
      isNull,
    );
  });

  test('pickup also offers en camino to assign courier or deliver manually', () {
    expect(
      KitchenMockupActionsBar.nextAction(estado: 'confirmado', isDelivery: false)?.status,
      'en_camino',
    );
    expect(
      KitchenMockupActionsBar.nextAction(estado: 'confirmado', isDelivery: false)?.label,
      'Marcar en camino',
    );
  });

  testWidgets('hides primary status button after delivery invite', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: KitchenMockupActionsBar(
            estado: 'confirmado',
            isDelivery: true,
            isBusy: false,
            busyStatus: null,
            hidePrimaryAction: true,
            onStatus: (_) {},
            onCancel: () {},
          ),
        ),
      ),
    );

    expect(find.text('Marcar en camino'), findsNothing);
    expect(find.text('Cancelar pedido'), findsOneWidget);
  });

  testWidgets('delegation card explains courier takeover and recovery actions', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: KitchenDelegationCard(
            courierName: 'Carlos',
            courierPhone: '++1-555-0029',
            statusLabel: 'Invitación enviada',
            pendingAcceptance: true,
            isBusy: false,
            onRevoke: () {},
            onInviteAnother: () {},
            onDeliverManually: () {},
          ),
        ),
      ),
    );

    expect(find.text('Invitación de delivery enviada'), findsOneWidget);
    expect(
      find.textContaining('Tú no tienes que avanzar el pedido'),
      findsOneWidget,
    );
    expect(find.text('Invitar a otro repartidor'), findsOneWidget);
    expect(find.text('Hacer el delivery manualmente'), findsOneWidget);
    expect(find.text('Revocar invitación'), findsOneWidget);
  });

  test('timeline is recibido, aceptado, en camino, entregado for pickup and delivery', () {
    expect(KitchenStatusTimeline.activeStepIndex(order('pendiente'), isDelivery: true), 0);
    expect(KitchenStatusTimeline.activeStepIndex(order('confirmado'), isDelivery: true), 1);
    expect(KitchenStatusTimeline.activeStepIndex(order('en_camino'), isDelivery: true), 2);
    expect(KitchenStatusTimeline.activeStepIndex(order('entregado'), isDelivery: true), 3);
    expect(KitchenStatusTimeline.activeStepIndex(order('confirmado'), isDelivery: false), 1);
    expect(KitchenStatusTimeline.activeStepIndex(order('entregado'), isDelivery: false), 3);
  });
}
