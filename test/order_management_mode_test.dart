import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/services/order_manager_service.dart';
import 'package:kosmenu_app/services/merchant_orders_repository.dart';
import 'package:kosmenu_app/widgets/kitchen_order/kitchen_order_widgets.dart';

PedidoModel order({Object? mode, double total = 18000, String id = 'manual'}) =>
    PedidoModel.fromMap({
      'id': id,
      'comercio_id': 'tenant',
      'estado': 'pendiente',
      'created_at': '2026-10-02T12:00:00Z',
      'total': total,
      'detalles': {
        'management_mode': mode,
        'total': total,
        'items': [
          {'nombre': 'Pizza', 'cantidad': 2, 'precio': total / 2},
        ],
      },
    });

void main() {
  setUpAll(() async {
    GoogleFonts.config.allowRuntimeFetching = false;
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://preview-test.example',
      anonKey: 'preview-test-key',
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/pedidos')) {
          final pedido = order(mode: 'whatsapp_manual').toMap();
          final details = Map<String, dynamic>.from(pedido['detalles'] as Map);
          details['order_id'] = 'ORD-MANUAL';
          pedido['detalles'] = details;
          return http.Response(
            jsonEncode([pedido]),
            200,
            request: request,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '[]',
          200,
          request: request,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
  });
  tearDownAll(() async => Supabase.instance.dispose());

  testWidgets('full merchant order screen is read-only for manual snapshot', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: OrderDetailScreen(
          orderId: 'ORD-MANUAL',
          initialPedido: order(mode: 'whatsapp_manual'),
          initialComercioNombre: 'Restaurante Preview',
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    final loadingWidget = tester.widget<FutureBuilder>(
      find.byWidgetPredicate((widget) => widget is FutureBuilder),
    );
    await expectLater(loadingWidget.future, completes);
    expect(
      find.text('Gestionado por WhatsApp'),
      findsWidgets,
      reason: tester
          .widgetList<Text>(find.byType(Text))
          .map((widget) => widget.data ?? '')
          .join(' | '),
    );
    expect(find.text('Aceptar pedido'), findsNothing);
    expect(find.text('Marcar en camino'), findsNothing);
    expect(find.byType(KitchenMockupActionsBar), findsNothing);
    expect(find.byType(KitchenStatusTimeline), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 3));
  });

  test('old/null/invalid orders retain platform workflow', () {
    for (final value in [null, '', 'detailed', 'manual', 'platform']) {
      final pedido = order(mode: value);
      expect(pedido.isWhatsappManual, isFalse);
      expect(pedido.statusBucket, OrderStatusBucket.pending);
      expect(
        OrderManagerService.visualStatusLabelForPedido(pedido),
        'Recibido',
      );
    }
  });

  test('manual is a separate visual bucket but retains total and products', () {
    final manual = order(mode: 'whatsapp_manual');
    final normal = order(mode: 'platform', total: 2000, id: 'platform');
    expect(manual.statusBucket, OrderStatusBucket.whatsappManual);
    expect(
      OrderManagerService.visualStatusLabelForPedido(manual),
      'Gestionado por WhatsApp',
    );
    expect(manual.estado, 'pendiente');
    final sales = [
      manual,
      normal,
    ].where((pedido) => pedido.statusBucket != OrderStatusBucket.canceled);
    expect(sales.length, 2);
    expect(
      sales.fold<double>(0, (sum, pedido) => sum + (pedido.total ?? 0)),
      20000,
    );
    expect(manual.items.single.cantidad, 2);
    final today = DateTime.utc(2026, 10, 2);
    final metrics = MerchantOrdersRepository.mergeMetricsOrders(
      fetched: [manual],
      live: [normal],
      startInclusive: today,
      endExclusive: today.add(const Duration(days: 1)),
      todayStart: today,
      tomorrow: today.add(const Duration(days: 1)),
    );
    expect(metrics.first.isWhatsappManual, isTrue);
    expect(metrics.length, 2);
  });

  testWidgets('manual merchant presentation has no timeline transitions', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              const KitchenWhatsappManualNotice(),
              KitchenStatusTimeline(
                pedido: order(mode: 'whatsapp_manual'),
                isDelivery: true,
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Gestionado por WhatsApp'), findsOneWidget);
    for (final label in [
      'Recibido',
      'Aceptado',
      'En camino',
      'Entregado',
      'Aceptar pedido',
    ]) {
      expect(find.text(label), findsNothing);
    }
  });

  testWidgets('platform timeline is unchanged', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: KitchenStatusTimeline(pedido: order(), isDelivery: true),
        ),
      ),
    );
    expect(find.text('Recibido'), findsOneWidget);
    expect(find.text('Aceptado'), findsOneWidget);
    expect(find.text('En camino'), findsOneWidget);
    expect(find.text('Entregado'), findsOneWidget);
  });

  for (final width in [320.0, 390.0, 768.0]) {
    testWidgets('manual header fits at $width pixels', (tester) async {
      tester.view.physicalSize = Size(width, 240);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: KitchenOrderHeader(
              businessName: 'Restaurante Preview',
              orderId: 'EMXFA-000156',
              statusLabel: 'Gestionado por WhatsApp',
              statusColor: Colors.green,
              manualManagement: true,
              createdAt: DateTime.now(),
            ),
          ),
        ),
      );
      expect(tester.takeException(), isNull);
    });
  }
}
