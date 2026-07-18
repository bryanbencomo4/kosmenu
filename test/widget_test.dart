import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/main.dart';
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

  testWidgets('Kosmenu app shows initial auth welcome UI', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const KosmenuApp());
    // Branded entry transitions into AuthScreen after ~1.46s.
    await tester.pump(const Duration(milliseconds: 1600));
    await tester.pump(const Duration(milliseconds: 500));

    // Brand copy on AuthScreen (replaces legacy "Kosmenú" expectation).
    expect(find.textContaining('elmenuxfa.com'), findsWidgets);
  });
}
