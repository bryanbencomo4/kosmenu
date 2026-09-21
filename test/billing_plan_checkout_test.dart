import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/widgets/billing_plan_checkout.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('checkout shows automated methods and BCV amount, hides cash', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final methods = mergePaymentCatalog(fallbackPaymentMethods());
    const plan = BillingPlan(
      id: 'plan-1',
      code: 'menu_monthly',
      name: 'Menú Digital',
      description: 'Menú digital con QR, pedidos y panel de administración.',
      priceAmount: 10,
      priceCurrency: 'USD',
      billingInterval: 'month',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BillingPlanCheckoutView(
            checkout: BillingCheckoutContext(
              snapshot: const BillingSnapshot(
                plan: plan,
                subscription: null,
                latestPayment: null,
                billingExempt: false,
                businessOnline: false,
              ),
              methods: methods,
              bcvRate: 36.50,
            ),
            selectedCode: 'pago_movil',
            paying: false,
            cancelling: false,
            error: null,
            onSelectMethod: (_) {},
            onContinue: () {},
            onCancelPending: () {},
            onDashboard: () {},
            onHelp: () {},
            onRetryCrypto: () {},
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Plan y facturación'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Binance Pay'),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Binance Pay'), findsOneWidget);
    expect(find.text('Tarjeta de regalo'), findsOneWidget);
    expect(find.text('Pago Móvil'), findsOneWidget);
    expect(find.text('Efectivo'), findsNothing);
    expect(find.textContaining('Bs.'), findsWidgets);
    expect(find.textContaining('Pagar'), findsOneWidget);
  });

  testWidgets('desktop checkout keeps promo and methods', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final methods = mergePaymentCatalog(fallbackPaymentMethods());
    const plan = BillingPlan(
      id: 'plan-1',
      code: 'menu_monthly',
      name: 'Menú Digital',
      description: 'Menú digital con QR, pedidos y panel de administración.',
      priceAmount: 10,
      priceCurrency: 'USD',
      billingInterval: 'month',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BillingPlanCheckoutView(
            checkout: BillingCheckoutContext(
              snapshot: const BillingSnapshot(
                plan: plan,
                subscription: null,
                latestPayment: null,
                billingExempt: false,
                businessOnline: false,
              ),
              methods: methods,
              bcvRate: 36.50,
            ),
            selectedCode: null,
            paying: false,
            cancelling: false,
            error: null,
            onSelectMethod: (_) {},
            onContinue: () {},
            onCancelPending: () {},
            onDashboard: () {},
            onHelp: () {},
            onRetryCrypto: () {},
          ),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(find.text('ElMenúXFA'), findsOneWidget);
    expect(find.text('Binance Pay'), findsOneWidget);
    expect(find.text('Efectivo'), findsNothing);
  });
}
