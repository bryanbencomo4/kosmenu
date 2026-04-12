import 'dart:async';

import 'package:app_links/app_links.dart' as deep_links;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/theme/app_theme.dart';
import 'package:kosmenu_app/screens/auth_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/screens/order_gate_screen.dart';
import 'package:kosmenu_app/screens/public_menu_view.dart';
import 'package:kosmenu_app/services/order_gate_handler.dart';
import 'package:kosmenu_app/services/push_notification_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
    ),
  );

  await _initializeSupabase();
  await Future<void>.delayed(const Duration(milliseconds: 150));

  runApp(const KosmenuApp());
}

Future<void> _initializeSupabase() {
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
  final PushNotificationService _pushNotifications =
      PushNotificationService.instance;

  StreamSubscription<Uri>? _appLinkSubscription;
  StreamSubscription<String>? _pushTapSubscription;

  @override
  void initState() {
    super.initState();
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

    if (uri.path == '/' || uri.path.isEmpty) {
      return MaterialPageRoute(
        settings: settings,
        builder: (_) => const _BrandedEntryScreen(),
      );
    }

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
    return MaterialApp(
      title: 'elmenuxfa.com',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      initialRoute: _resolveInitialRoute(),
      onGenerateRoute: _onGenerateRoute,
      theme: AppTheme.lightTheme(),
    );
  }
}

class _BrandedEntryScreen extends StatefulWidget {
  const _BrandedEntryScreen();

  @override
  State<_BrandedEntryScreen> createState() => _BrandedEntryScreenState();
}

class _BrandedEntryScreenState extends State<_BrandedEntryScreen> {
  bool _startExit = false;
  bool _showAuth = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 880), () {
      if (!mounted) return;
      setState(() => _startExit = true);
    });

    Future<void>.delayed(const Duration(milliseconds: 1460), () {
      if (!mounted) return;
      setState(() => _showAuth = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 420),
      switchInCurve: Curves.easeOut,
      switchOutCurve: Curves.easeIn,
      transitionBuilder: (child, animation) {
        final fade = CurvedAnimation(parent: animation, curve: Curves.easeOut);
        final slide = Tween<Offset>(
          begin: const Offset(0, 0.08),
          end: Offset.zero,
        ).animate(fade);
        return FadeTransition(
          opacity: fade,
          child: SlideTransition(position: slide, child: child),
        );
      },
      child: _showAuth
          ? const AuthGate(key: ValueKey<String>('auth'))
          : _BrandedSplash(
              key: const ValueKey<String>('splash'),
              exiting: _startExit,
            ),
    );
  }
}

class _BrandedSplash extends StatelessWidget {
  const _BrandedSplash({super.key, required this.exiting});

  final bool exiting;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF5B21B6),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isotipoWidth = (constraints.maxWidth * 0.36)
                .clamp(108.0, 160.0)
                .toDouble();

            return Center(
              child: SingleChildScrollView(
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0.94, end: 1),
                  duration: const Duration(milliseconds: 760),
                  curve: Curves.easeOutBack,
                  builder: (context, value, child) {
                    final introOpacity = value.clamp(0.0, 1.0).toDouble();
                    final introScale = value;
                    final outOpacity = exiting ? 0.0 : 1.0;
                    final outOffset = exiting
                        ? const Offset(0, -0.12)
                        : Offset.zero;
                    final outScale = exiting ? 0.9 : 1.0;

                    return AnimatedSlide(
                      duration: const Duration(milliseconds: 420),
                      curve: Curves.easeInOutCubic,
                      offset: outOffset,
                      child: AnimatedScale(
                        duration: const Duration(milliseconds: 420),
                        curve: Curves.easeInOutCubic,
                        scale: outScale,
                        child: AnimatedOpacity(
                          duration: const Duration(milliseconds: 360),
                          curve: Curves.easeIn,
                          opacity: outOpacity,
                          child: Opacity(
                            opacity: introOpacity,
                            child: Transform.scale(
                              scale: introScale,
                              child: child,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Image.asset(
                        'assets/branding/isotipo.png',
                        width: isotipoWidth,
                        fit: BoxFit.contain,
                        filterQuality: FilterQuality.high,
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'elmenuxfa.com',
                        style: TextStyle(
                          color: const Color(0xFFF4ECFF),
                          fontSize: constraints.maxWidth < 380 ? 34 : 38,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.8,
                          shadows: const [
                            Shadow(
                              color: Color(0x40000000),
                              blurRadius: 12,
                              offset: Offset(0, 5),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
