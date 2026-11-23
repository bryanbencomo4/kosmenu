import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/models/kit_shipping_draft.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/widgets/billing_plan_checkout.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  const shipping = KitShippingDraft(
    recipientName: 'María González',
    phone: '+58 412 123 4567',
    email: 'tu@correo.com',
  );

  const plan = BillingPlan(
    id: 'plan-1',
    code: 'menu_monthly',
    name: 'Menú Digital',
    description: 'Menú digital con QR.',
    priceAmount: 10,
    priceCurrency: 'USD',
    billingInterval: 'month',
  );

  const yearly = BillingPlan(
    id: 'plan-2',
    code: 'menu_yearly',
    name: 'Menú Digital Anual',
    description: 'Pago anual.',
    priceAmount: 90,
    priceCurrency: 'USD',
    billingInterval: 'year',
  );

  testWidgets('checkout shows catalog methods and brand sections', (tester) async {
    final previousOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('A RenderFlex overflowed')) {
        return;
      }
      previousOnError?.call(details);
    };
    addTearDown(() => FlutterError.onError = previousOnError);

    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final methods = mergePaymentCatalog(fallbackPaymentMethods());

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
              yearlyPlan: yearly,
              bcvRate: 36.5,
            ),
            selectedCode: kCheckoutUiPagoMovil,
            planCode: 'menu_monthly',
            paying: false,
            cancelling: false,
            error: null,
            shipping: shipping,
            onShippingChanged: (_) {},
            onSelectMethod: (_) {},
            onSelectPlan: (_) {},
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

    expect(find.text('elmenuxfa.com'), findsOneWidget);
    expect(find.text('Checkout seguro'), findsOneWidget);
    expect(find.text('Elige tu plan'), findsOneWidget);
    expect(find.text('Portamenús extra'), findsOneWidget);
    expect(find.text('Tus datos'), findsOneWidget);
    expect(find.text('Método de pago'), findsOneWidget);
    expect(find.text('Pago Móvil'), findsOneWidget);
    expect(find.text('Binance Pay'), findsOneWidget);
    expect(find.text('Tarjeta de regalo'), findsOneWidget);
    expect(find.text('Transferencia bancaria'), findsNothing);
    expect(find.text('Resumen de tu compra'), findsOneWidget);
    expect(find.text('Continuar al pago →'), findsOneWidget);
    expect(find.text('Cédula / RIF'), findsNothing);
    expect(find.text('Oficina Zoom'), findsNothing);
    expect(find.byIcon(Icons.arrow_back_rounded), findsNothing);
  });
}
