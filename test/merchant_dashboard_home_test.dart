import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  test('greeting changes by time of day', () {
    expect(
      MerchantHomeHeader.greetingFor(DateTime(2026, 9, 17, 8)),
      'Buenos días',
    );
    expect(
      MerchantHomeHeader.greetingFor(DateTime(2026, 9, 17, 15)),
      'Buenas tardes',
    );
    expect(
      MerchantHomeHeader.greetingFor(DateTime(2026, 9, 17, 21)),
      'Buenas noches',
    );
  });

  test('nav destinations have titles', () {
    expect(MerchantNavDestination.home.title, 'Inicio');
    expect(MerchantNavDestination.orders.title, 'Pedidos');
    expect(MerchantNavDestination.digitalMenu.title, 'Menú digital');
  });

  test('formats a long Spanish date', () {
    expect(
      MerchantHomeHeader.longDateEs(DateTime(2026, 9, 17)),
      'Jueves, 17 de septiembre de 2026',
    );
  });

  testWidgets('sidebar highlights Inicio and shows plan', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 248,
            child: MerchantDashboardSidebar(
              selected: MerchantNavDestination.home,
              planName: 'Profesional',
              onSelect: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(find.text('Inicio'), findsOneWidget);
    expect(find.text('Profesional'), findsOneWidget);
    expect(find.text('Pedidos'), findsOneWidget);
  });

  testWidgets('collapsed sidebar keeps icons and hides labels', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: MerchantDashboardSidebar.collapsedWidth,
            child: MerchantDashboardSidebar(
              selected: MerchantNavDestination.orders,
              planName: 'Profesional',
              collapsed: true,
              onToggleCollapsed: () {},
              onSelect: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(find.text('Pedidos'), findsNothing);
    expect(find.byIcon(Icons.shopping_bag_outlined), findsOneWidget);
    expect(find.byTooltip('Expandir menú'), findsOneWidget);
  });

  testWidgets('mobile header shows greeting and status', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MerchantHomeHeader(
            commerceName: 'omg burgers!',
            businessOnline: true,
            isUpdatingOnline: false,
            onToggleOnline: _noopBool,
            onOpenNotifications: _noop,
            onOpenProfile: _noop,
            showMenuButton: true,
          ),
        ),
      ),
    );

    expect(find.textContaining('omg burgers!'), findsWidgets);
    expect(find.text('Negocio abierto'), findsOneWidget);
    expect(find.byIcon(Icons.menu_rounded), findsOneWidget);
  });
}

void _noop() {}
void _noopBool(bool value) {}

