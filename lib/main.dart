import 'dart:async';

import 'package:app_links/app_links.dart' as deep_links;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/screens/auth_screen.dart';
import 'package:kosmenu_app/screens/billing_plan_screen.dart' deferred as billing_screen;
import 'package:kosmenu_app/screens/mobile_camera_capture_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/screens/order_gate_screen.dart';
import 'package:kosmenu_app/screens/public_menu_view.dart' deferred as public_menu;
import 'package:kosmenu_app/services/merchant_deep_link.dart';
import 'package:kosmenu_app/services/order_gate_handler.dart';
import 'package:kosmenu_app/services/push_notification_service.dart';
import 'package:kosmenu_app/widgets/deferred_library_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

/// Replaces Flutter's release-mode error box, which paints a bare gray
/// rectangle with no message (its text is only built behind an `assert`), so a
/// failed build is indistinguishable from a broken page and leaves the merchant
/// with no way out.
///
/// Built from widgets that need no inherited ancestors (no `MediaQuery`,
/// `Material` or `Scaffold`) because this can be rendered anywhere in the tree,
/// including above the app's own providers.
Widget _buildRecoverableErrorScreen(FlutterErrorDetails details) {
  final exceptionText = details.exceptionAsString().trim();
  debugPrint('UI build error: $exceptionText');
  if (details.stack != null) {
    debugPrint('${details.stack}');
  }

  return Directionality(
    textDirection: TextDirection.ltr,
    child: Container(
      color: const Color(0xFF1B1236),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFD8B4FE),
            size: 44,
          ),
          const SizedBox(height: 14),
          const Text(
            'Algo se interrumpio en esta pantalla.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFFF8F5FF),
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Vuelve al inicio para continuar. Si vuelve a pasar, recarga la '
            'pagina.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFFB9AED7), fontSize: 14),
          ),
          if (exceptionText.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              exceptionText.length > 280
                  ? '${exceptionText.substring(0, 280)}…'
                  : exceptionText,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFFC4B5FD),
                fontSize: 11,
                height: 1.35,
              ),
            ),
          ],
          const SizedBox(height: 18),
          GestureDetector(
            onTap: () => _navigatorKey.currentState?.pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const AuthGate()),
              (route) => false,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
              decoration: BoxDecoration(
                color: const Color(0xFF8B5CF6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text(
                'Volver al inicio',
                style: TextStyle(
                  color: Color(0xFFFFFFFF),
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  passwordRecoveryPending.value =
      kIsWeb && Uri.base.queryParameters['flow'] == 'password-recovery';
  ErrorWidget.builder = _buildRecoverableErrorScreen;
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
    ),
  );

  await _initializeSupabase();

  runApp(const KosmenuApp());
}

Future<void> _initializeSupabase() {
  SupabaseConfig.assertRuntimeConfig();

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
  final deep_links.AppLinks _appLinks = deep_links.AppLinks();
  final PushNotificationService _pushNotifications =
      PushNotificationService.instance;
  final OrderGateHandler _orderGateHandler = const OrderGateHandler();

  StreamSubscription<Uri>? _appLinkSubscription;
  StreamSubscription<String>? _pushTapSubscription;
  StreamSubscription<AuthState>? _authRecoverySubscription;

  @override
  void initState() {
    super.initState();
    _authRecoverySubscription = Supabase.instance.client.auth.onAuthStateChange
        .listen((state) {
          if (state.event == AuthChangeEvent.passwordRecovery) {
            passwordRecoveryPending.value = true;
          }
        });
    if (!kIsWeb) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        unawaited(_bindIncomingOrderLinks());
        unawaited(_initializePushNotifications());
      });
    }
  }

  @override
  void dispose() {
    _appLinkSubscription?.cancel();
    _pushTapSubscription?.cancel();
    _authRecoverySubscription?.cancel();
    _pushNotifications.dispose();
    super.dispose();
  }

  Future<void> _initializePushNotifications() async {
    try {
      await _pushNotifications.initialize();
      _pushTapSubscription = _pushNotifications.orderTapStream.listen((
        orderId,
      ) {
        if (orderId.trim().isEmpty) {
          return;
        }

        unawaited(_openOrderFromPush(orderId));
      });
    } catch (error) {
      debugPrint('Push notification setup error: $error');
    }
  }

  Future<void> _openOrderFromPush(String orderId) async {
    try {
      final decision = await _orderGateHandler.resolve(orderId);
      if (!mounted) {
        return;
      }

      final navigator = _navigatorKey.currentState;
      if (navigator == null) {
        return;
      }

      late final String routeName;
      switch (decision.target) {
        case OrderGateTarget.app:
          routeName = '/orders/view/${Uri.encodeComponent(decision.orderId)}';
          break;
        case OrderGateTarget.publicApp:
        case OrderGateTarget.deniedApp:
          routeName = '/orders/public/${Uri.encodeComponent(decision.orderId)}';
          break;
        case OrderGateTarget.web:
          routeName = '/orders/${Uri.encodeComponent(decision.orderId)}';
          break;
      }

      navigator.pushNamedAndRemoveUntil(
        routeName,
        (route) => route.isFirst,
        arguments: 'push-notification',
      );
    } catch (error) {
      debugPrint('Push order navigation error: $error');
    }
  }

  String _resolveInitialRoute() {
    if (kIsWeb) {
      final uri = Uri.base;
      if (uri.queryParameters['flow'] == 'password-recovery') {
        return '/auth/recovery';
      }
      final orderId = OrderGateHandler.extractOrderId(uri);
      if (orderId != null && orderId.isNotEmpty) {
        MerchantDeepLink.rememberOrder(
          orderId,
          fallbackUri: _fallbackOrderUri(uri, orderId),
          openPaymentProof: uri.queryParameters['comprobante'] == '1',
        );
        // Enter through AuthGate/dashboard. Flutter would otherwise split
        // `/orders/view/{id}` into `/orders/view` and treat "view" as an order.
        return '/';
      }
      return uri.path.isEmpty ? '/' : uri.path;
    }

    return '/';
  }

  Uri? _fallbackOrderUri(Uri uri, String orderId) {
    if (uri.queryParameters['comprobante'] == '1') return null;
    final fullFallback = uri.queryParameters['fallback'] ?? '';
    if (fullFallback.trim().isNotEmpty) {
      return Uri.tryParse(fullFallback);
    }

    final token = uri.queryParameters['fallbackToken']?.trim() ?? '';
    if (token.isNotEmpty) {
      return Uri.parse(
        AppLinks.orderDetailsById(
          orderId,
          forceWebView: true,
          trackingToken: token,
        ),
      );
    }

    final shortCode = uri.queryParameters['shortCode']?.trim() ?? '';
    if (shortCode.isEmpty) return null;
    return Uri.parse(AppLinks.shortOrderByCode(shortCode));
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
    if (uri.scheme == 'com.kosmenu.app' && uri.host == 'reset-password') {
      passwordRecoveryPending.value = true;
      return;
    }

    final orderId = OrderGateHandler.extractOrderId(uri);
    if (orderId == null || orderId.isEmpty) {
      return;
    }

    final routeName = '/orders/${Uri.encodeComponent(orderId)}';
    final navigator = _navigatorKey.currentState;
    if (navigator == null) {
      return;
    }

    if (uri.queryParameters['comprobante'] == '1') {
      MerchantDeepLink.rememberOrder(orderId, openPaymentProof: true);
      navigator.pushNamedAndRemoveUntil('/', (_) => false);
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

    if (uri.path == '/' || uri.path.isEmpty) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const AuthGate(),
      );
    }

    if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'capture') {
      final encodedPayload = uri.pathSegments[1];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) =>
            MobileCameraCaptureScreen(encodedPayload: encodedPayload),
      );
    }

    if (uri.pathSegments.length == 2 && uri.pathSegments.first == 'v') {
      final comercioId = uri.pathSegments[1];
      final assistedMode = uri.queryParameters['mode'] == 'assisted';
      final entrySource = uri.queryParameters['source'];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => DeferredLibraryScreen(
          load: public_menu.loadLibrary,
          builder: () => public_menu.PublicMenuView(
            comercioId: comercioId,
            assistedMode: assistedMode,
            entrySource: entrySource,
          ),
        ),
      );
    }

    if (uri.pathSegments.length == 2 &&
        (uri.pathSegments.first == 'orders' ||
            uri.pathSegments.first == 'order')) {
      final orderId = uri.pathSegments[1];
      if (orderId != 'view' && orderId != 'public') {
        return MaterialPageRoute(
          settings: settings,
          builder: (_) => OrderGateScreen(orderId: orderId),
        );
      }
    }

    if (uri.pathSegments.length == 3 &&
        uri.pathSegments.first == 'orders' &&
        uri.pathSegments[1] == 'view') {
      final orderId = uri.pathSegments[2];
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => OrderDetailScreen(
          orderId: orderId,
          openPaymentProof: uri.queryParameters['comprobante'] == '1',
        ),
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

    if (uri.path == '/payment/success' || uri.path == '/billing') {
      final showSuccess = uri.path == '/payment/success';
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => DeferredLibraryScreen(
          load: billing_screen.loadLibrary,
          builder: () => showSuccess
              ? billing_screen.BillingPaymentSuccessScreen()
              : billing_screen.BillingPlanScreen(),
        ),
      );
    }

    if (uri.path == '/payment/pending') {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => DeferredLibraryScreen(
          load: billing_screen.loadLibrary,
          builder: () => billing_screen.BillingPlanScreen(),
        ),
      );
    }

    return MaterialPageRoute(
      settings: settings,
      builder: (_) => const AuthGate(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'elmenuxfa.com',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      initialRoute: _resolveInitialRoute(),
      onGenerateInitialRoutes: (initialRoute) {
        return <Route<dynamic>>[
          _onGenerateRoute(RouteSettings(name: initialRoute)),
        ];
      },
      onGenerateRoute: _onGenerateRoute,
      theme: AppTheme.lightTheme(),
      // Window chrome / web host tint while the first route paints.
      color: const Color(0xFF5B21B6),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('es'), Locale('en')],
    );
  }
}

