import 'dart:async';

import 'package:app_links/app_links.dart' as deep_links;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/screens/auth_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/screens/order_gate_screen.dart';
import 'package:kosmenu_app/screens/public_menu_view.dart';
import 'package:kosmenu_app/services/order_gate_handler.dart';
import 'package:kosmenu_app/services/push_notification_service.dart';
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

class KosmenuApp extends StatefulWidget {
  const KosmenuApp({super.key});

  @override
  State<KosmenuApp> createState() => _KosmenuAppState();
}

class _KosmenuAppState extends State<KosmenuApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  final deep_links.AppLinks _appLinks = deep_links.AppLinks();
  final PushNotificationService _pushNotifications = PushNotificationService.instance;

  StreamSubscription<Uri>? _appLinkSubscription;
  StreamSubscription<String>? _pushTapSubscription;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _bindIncomingOrderLinks();
      _initializePushNotifications();
    }
  }

  @override
  void dispose() {
    _appLinkSubscription?.cancel();
    _pushTapSubscription?.cancel();
    _pushNotifications.dispose();
    super.dispose();
  }

  Future<void> _initializePushNotifications() async {
    try {
      await _pushNotifications.initialize();
      _pushTapSubscription = _pushNotifications.orderTapStream.listen((orderId) {
        if (orderId.trim().isEmpty) {
          return;
        }

        final uri = Uri.parse(
          'https://kosmenu.vercel.app/orders/${Uri.encodeComponent(orderId)}',
        );

        WidgetsBinding.instance.addPostFrameCallback((_) {
          _openOrderLink(uri, replaceStack: true);
        });
      });
    } catch (error) {
      debugPrint('Push notification setup error: $error');
    }
  }

  String _resolveInitialRoute() {
    if (kIsWeb) {
      return Uri.base.path.isEmpty ? '/' : Uri.base.path;
    }

    return '/';
  }

  Future<void> _bindIncomingOrderLinks() async {
    try {
      final initialUri = await _appLinks.getInitialLink();
      if (initialUri != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _openOrderLink(initialUri, replaceStack: true);
        });
      }
    } catch (error) {
      debugPrint('Order deep link init error: $error');
    }

    _appLinkSubscription = _appLinks.uriLinkStream.listen(
      (uri) => _openOrderLink(uri),
      onError: (error) {
        debugPrint('Order deep link stream error: $error');
      },
    );
  }

  void _openOrderLink(Uri uri, {bool replaceStack = false}) {
    final orderId = OrderGateHandler.extractOrderId(uri);
    if (orderId == null || orderId.isEmpty) {
      return;
    }

    final routeName = '/orders/${Uri.encodeComponent(orderId)}';
    final navigator = _navigatorKey.currentState;
    if (navigator == null) {
      return;
    }

    if (replaceStack) {
      navigator.pushNamedAndRemoveUntil(
        routeName,
        (route) => route.isFirst,
        arguments: uri.toString(),
      );
      return;
    }

    navigator.pushNamedAndRemoveUntil(
      routeName,
      (route) => route.isFirst,
      arguments: uri.toString(),
    );
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

    if (uri.pathSegments.length == 2 &&
        (uri.pathSegments.first == 'orders' ||
            uri.pathSegments.first == 'order')) {
      final orderId = uri.pathSegments[1];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => OrderGateScreen(orderId: orderId),
      );
    }

    if (uri.pathSegments.length == 3 &&
        uri.pathSegments.first == 'orders' &&
        uri.pathSegments[1] == 'view') {
      final orderId = uri.pathSegments[2];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => OrderDetailScreen(orderId: orderId),
      );
    }

    if (uri.pathSegments.length == 3 &&
        uri.pathSegments.first == 'orders' &&
        uri.pathSegments[1] == 'public') {
      final orderId = uri.pathSegments[2];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => OrderDetailScreen(orderId: orderId, readOnlyView: true),
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
      navigatorKey: _navigatorKey,
      initialRoute: _resolveInitialRoute(),
      onGenerateRoute: _onGenerateRoute,
      theme: baseTheme.copyWith(
        textTheme: GoogleFonts.poppinsTextTheme(baseTheme.textTheme),
      ),
    );
  }
}
