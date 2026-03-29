import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/screens/auth_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/screens/public_menu_view.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await _initializeSupabase();
  await Future<void>.delayed(const Duration(milliseconds: 150));

  runApp(const KosmenuApp());
}

Future<void> _initializeSupabase() {
  if (kDebugMode) {
    debugPrint('Supabase URL: ${SupabaseConfig.url}');
    debugPrint(
      'Supabase key prefix: ${SupabaseConfig.anonKey.isNotEmpty ? SupabaseConfig.anonKey.substring(0, 3) : 'EMPTY'}',
    );
  }

  final parsedUrl = Uri.tryParse(SupabaseConfig.url);
  if (parsedUrl == null || !parsedUrl.hasAuthority) {
    throw StateError('Supabase URL is invalid: ${SupabaseConfig.url}');
  }

  if (SupabaseConfig.anonKey.isEmpty ||
      !SupabaseConfig.anonKey.startsWith('eyJ')) {
    throw StateError(
      'SUPABASE_ANON_KEY is empty or invalid. Paste the full anon key from Supabase dashboard.',
    );
  }

  return Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
    authOptions: const FlutterAuthClientOptions(
      authFlowType: AuthFlowType.pkce,
    ),
  );
}

class KosmenuApp extends StatelessWidget {
  const KosmenuApp({super.key});

  String _resolveInitialRoute() {
    if (kIsWeb) {
      return Uri.base.path.isEmpty ? '/' : Uri.base.path;
    }

    final defaultRouteName = WidgetsBinding
        .instance
        .platformDispatcher
        .defaultRouteName;

    if (defaultRouteName.isEmpty || defaultRouteName == '/') {
      return '/';
    }

    return defaultRouteName;
  }

  Route<dynamic> _onGenerateRoute(RouteSettings settings) {
    final routeName = settings.name ?? '/';
    final uri = Uri.parse(routeName.isEmpty ? '/' : routeName);

    if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'v') {
      final comercioId = uri.pathSegments[1];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => PublicMenuView(comercioId: comercioId),
      );
    }

    if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'orders') {
      final orderId = uri.pathSegments[1];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => OrderDetailScreen(orderId: orderId),
      );
    }

    return MaterialPageRoute(
      settings: settings,
      builder: (_) => const AuthGate(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final baseTheme = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFFFF6B00),
        brightness: Brightness.dark,
      ),
    );

    return MaterialApp(
      title: 'Kosmenu',
      debugShowCheckedModeBanner: false,
      initialRoute: _resolveInitialRoute(),
      onGenerateRoute: _onGenerateRoute,
      theme: baseTheme.copyWith(
        textTheme: GoogleFonts.poppinsTextTheme(baseTheme.textTheme),
      ),
    );
  }
}
