import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/business_schedule.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/services/merchant_session.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';

void main() {
  test('nav title for sales tools is honest', () {
    expect(MerchantNavDestination.marketing.title, 'Herramientas de venta');
  });

  test('QR public URL includes src=qr', () {
    expect(AppLinks.publicMenuQrByComercio('demo'), contains('?src=qr'));
    expect(AppLinks.publicMenuByComercio('demo'), isNot(contains('src=qr')));
  });

  test('schedule reports closed and next open', () {
    final schedule = BusinessSchedule(
      days: {
        for (final key in BusinessSchedule.keys)
          key: const BusinessDaySchedule(open: false),
        'monday': const BusinessDaySchedule(
          open: true,
          ranges: [
            BusinessHoursRange(start: '08:00', end: '12:00'),
            BusinessHoursRange(start: '18:00', end: '23:00'),
          ],
        ),
      },
    );

    final mondayMorning = DateTime.utc(2026, 9, 14, 13, 30); // 09:30 Caracas
    final statusOpen = schedule.statusAt(mondayMorning);
    expect(statusOpen.isOpen, isTrue);

    final mondayAfternoon = DateTime.utc(2026, 9, 14, 18, 0); // 14:00 Caracas
    final statusClosed = schedule.statusAt(mondayAfternoon);
    expect(statusClosed.isOpen, isFalse);
    expect(statusClosed.caption, contains('Cerrado'));
    expect(statusClosed.nextOpenLabel, contains('hoy'));
  });

  test('unconfigured schedule does not pretend to be closed', () {
    final status = BusinessSchedule.empty().statusAt();
    expect(status.configured, isFalse);
    expect(status.isOpen, isFalse);
  });

  test('clients are grouped with totals instead of last order only', () {
    final orders = [
      PedidoModel(
        id: '1',
        comercioId: 'c1',
        orderId: '#00123',
        nombreCliente: 'Ana',
        clientePhone: '4120000000',
        total: 10,
        createdAt: DateTime(2026, 9, 10),
      ),
      PedidoModel(
        id: '2',
        comercioId: 'c1',
        orderId: '#00118',
        nombreCliente: 'Ana',
        clientePhone: '4120000000',
        total: 20,
        createdAt: DateTime(2026, 9, 12),
      ),
    ];
    final clients = MerchantClient.fromOrders(orders);
    expect(clients, hasLength(1));
    expect(clients.first.orderCount, 2);
    expect(clients.first.totalSpent, 30);
    expect(clients.first.recentOrders.first.orderId, '#00118');
  });

  test('credit history labels real reasons', () {
    final tx = AiCreditTransaction.fromMap({
      'id': 't1',
      'type': 'debit',
      'amount': 1,
      'reason': 'ai_image_generation_queue',
      'metadata': {'product_name': 'hamburguesa'},
      'created_at': '2026-09-17T12:00:00Z',
    });
    expect(tx.title, 'Generación foto hamburguesa');
    expect(tx.isCredit, isFalse);
  });

  test('12h labels and split ranges match the public menu contract', () {
    expect(BusinessSchedule.formatHour('12:00'), '12:00 PM');
    expect(BusinessSchedule.formatHour('15:00'), '3:00 PM');
    expect(BusinessSchedule.formatHour('18:00'), '6:00 PM');
    expect(BusinessSchedule.formatHour('22:00'), '10:00 PM');
  });

  test('new restaurant analytics stay empty instead of zeros pretending to be live', () {
    const empty = MenuAnalyticsSummary();
    expect(empty.hasTraffic, isFalse);
    expect(MerchantClient.fromOrders(const []), isEmpty);
    final parsed = MenuAnalyticsSummary.fromMap(null);
    expect(parsed.visits, 0);
    expect(parsed.hasTraffic, isFalse);
  });

  test('active restaurant funnel maps visits to conversion', () {
    final analytics = MenuAnalyticsSummary.fromMap({
      'visits': 1200,
      'product_views': 450,
      'add_to_cart': 120,
      'orders': 50,
      'conversion': 4.1,
      'avg_ticket': 18.5,
      'repeat_customers': 12,
      'top_viewed': [
        {'product_id': 'p1', 'name': 'Hamburguesa clásica', 'views': 90},
      ],
    });
    expect(analytics.hasTraffic, isTrue);
    expect(analytics.productViews, 450);
    expect(analytics.addToCart, 120);
    expect(analytics.conversion, 4.1);
    expect(analytics.topViewed.single.name, 'Hamburguesa clásica');
  });

  test('roles hide the right destinations and mutations', () {
    MerchantSession.set(role: MerchantStaffRole.caja, isOwner: false);
    expect(MerchantSession.canManageCatalog, isFalse);
    expect(MerchantSession.canSeeClients, isTrue);
    expect(MerchantSession.canOpen(MerchantNavDestination.stats), isFalse);
    expect(MerchantSession.canOpen(MerchantNavDestination.orders), isTrue);

    MerchantSession.set(role: MerchantStaffRole.cocina, isOwner: false);
    expect(MerchantSession.canSeeSalesKpis, isFalse);
    expect(MerchantSession.canOpen(MerchantNavDestination.settings), isFalse);
    expect(MerchantSession.canOpen(MerchantNavDestination.orders), isTrue);

    MerchantSession.set(role: MerchantStaffRole.marketing, isOwner: false);
    expect(MerchantSession.canSeeStats, isTrue);
    expect(MerchantSession.canSeeMarketing, isTrue);
    expect(MerchantSession.canManageCatalog, isFalse);
    expect(MerchantSession.canManageStaff, isFalse);
    expect(MerchantSession.canOpen(MerchantNavDestination.digitalMenu), isTrue);

    MerchantSession.clear();
    expect(MerchantSession.canManageCatalog, isTrue);
  });
}
