import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/screens/auth_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await Supabase.initialize(
      url: SupabaseConfig.url,
      anonKey: SupabaseConfig.anonKey,
    );
  });

  /// Rebuilds the stack that onboarding and billing leave behind: they call
  /// `pushAndRemoveUntil(..., (route) => false)`, so the dashboard becomes the
  /// first route and the auth gate is no longer mounted anywhere.
  Future<BuildContext> pumpStackWithoutAuthGate(WidgetTester tester) async {
    late BuildContext dashboardContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            dashboardContext = context;
            return const Scaffold(body: Text('dashboard-raiz'));
          },
        ),
      ),
    );

    expect(find.text('dashboard-raiz'), findsOneWidget);
    return dashboardContext;
  }

  testWidgets(
    'cerrar sesion llega al AuthGate aunque el dashboard sea la primera ruta',
    (tester) async {
      final dashboardContext = await pumpStackWithoutAuthGate(tester);

      returnToAuthGate(dashboardContext);
      await tester.pumpAndSettle();

      // Antes esto hacia popUntil(isFirst), que dejaba justo el dashboard sin
      // sesion en pantalla en lugar del login.
      expect(find.text('dashboard-raiz'), findsNothing);
      expect(find.byType(AuthGate), findsOneWidget);
    },
  );

  testWidgets('tambien descarta las rutas apiladas sobre el dashboard', (
    tester,
  ) async {
    final dashboardContext = await pumpStackWithoutAuthGate(tester);

    // El perfil, desde donde el comerciante cierra sesion.
    late BuildContext profileContext;
    Navigator.of(dashboardContext).push(
      MaterialPageRoute(
        builder: (context) {
          profileContext = context;
          return const Scaffold(body: Text('perfil'));
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('perfil'), findsOneWidget);

    returnToAuthGate(profileContext);
    await tester.pumpAndSettle();

    expect(find.text('perfil'), findsNothing);
    expect(find.text('dashboard-raiz'), findsNothing);
    expect(find.byType(AuthGate), findsOneWidget);
  });

  testWidgets('no queda nada por desapilar despues de volver al AuthGate', (
    tester,
  ) async {
    final dashboardContext = await pumpStackWithoutAuthGate(tester);

    returnToAuthGate(dashboardContext);
    await tester.pumpAndSettle();

    final navigator = tester.state<NavigatorState>(find.byType(Navigator));
    expect(navigator.canPop(), isFalse);
  });
}
