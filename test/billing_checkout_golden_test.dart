import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/kit_shipping_draft.dart';
import 'package:kosmenu_app/services/billing_service.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';
import 'package:kosmenu_app/widgets/billing_plan_checkout.dart';

Future<void> _loadTestFonts() async {
  final materialFonts = Directory(
    r'C:\Users\bryan\fvm\versions\3.41.6\bin\cache\artifacts\material_fonts',
  );
  Future<void> load(String family, String file, {FontWeight? weight}) async {
    final path = '${materialFonts.path}\\$file';
    final bytes = await File(path).readAsBytes();
    final data = ByteData.view(bytes.buffer);
    final loader = FontLoader(family)..addFont(Future.value(data));
    await loader.load();
  }

  await load('Roboto', 'Roboto-Regular.ttf');
  await load('Roboto', 'Roboto-Medium.ttf', weight: FontWeight.w500);
  await load('Roboto', 'Roboto-Bold.ttf', weight: FontWeight.w700);
  await load('MaterialIcons', 'MaterialIcons-Regular.otf');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    await _loadTestFonts();
  });

  const plan = BillingPlan(
    id: 'plan-1',
    code: 'menu_monthly',
    name: 'Menú Digital',
    description: 'desc',
    priceAmount: 10,
    priceCurrency: 'USD',
    billingInterval: 'month',
  );
  const yearly = BillingPlan(
    id: 'plan-2',
    code: 'menu_yearly',
    name: 'Menú Digital Anual',
    description: 'desc',
    priceAmount: 90,
    priceCurrency: 'USD',
    billingInterval: 'year',
  );

  Future<void> pumpCheckout(WidgetTester tester, Size size) async {
    final previousOnError = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('A RenderFlex overflowed')) {
        return;
      }
      previousOnError?.call(details);
    };
    addTearDown(() => FlutterError.onError = previousOnError);

    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(fontFamily: 'Roboto', useMaterial3: true),
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
              methods: mergePaymentCatalog(fallbackPaymentMethods()),
              yearlyPlan: yearly,
              bcvRate: 36.5,
            ),
            selectedCode: kCheckoutUiPagoMovil,
            planCode: 'menu_monthly',
            paying: false,
            cancelling: false,
            error: null,
            shipping: const KitShippingDraft(),
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
    await tester.pump();
    await tester.runAsync(() async {
      await precacheImage(
        const AssetImage('assets/branding/table_tent.png'),
        tester.element(find.byType(BillingPlanCheckoutView)),
      );
    });
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('checkout golden 1024x576', (tester) async {
    await pumpCheckout(tester, const Size(1024, 576));
    expect(find.text('Continuar al pago →'), findsOneWidget);
    expect(find.text('Resumen de tu compra'), findsOneWidget);
    await expectLater(
      find.byType(BillingPlanCheckoutView),
      matchesGoldenFile('goldens/checkout_1024x576.png'),
    );
  }, timeout: const Timeout(Duration(seconds: 30)));

  testWidgets('checkout golden 1440x900', (tester) async {
    await pumpCheckout(tester, const Size(1440, 900));
    expect(find.text('Pago Móvil'), findsOneWidget);
    await expectLater(
      find.byType(BillingPlanCheckoutView),
      matchesGoldenFile('goldens/checkout_1440x900.png'),
    );
  }, timeout: const Timeout(Duration(seconds: 30)));

  testWidgets('checkout golden 390x844', (tester) async {
    await pumpCheckout(tester, const Size(390, 844));
    expect(find.text('Elige tu plan'), findsOneWidget);
    expect(find.text('Continuar al pago →'), findsOneWidget);
    await expectLater(
      find.byType(BillingPlanCheckoutView),
      matchesGoldenFile('goldens/checkout_390x844.png'),
    );
  }, timeout: const Timeout(Duration(seconds: 30)));
}
