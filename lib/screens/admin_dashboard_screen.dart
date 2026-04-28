import 'dart:async';
import 'package:fl_chart/fl_chart.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/services/order_manager_service.dart';
import 'package:kosmenu_app/screens/business_setup_screen.dart';
import 'package:kosmenu_app/screens/category_screen.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/screens/profile_screen.dart';
import 'package:kosmenu_app/screens/qr_generator_screen.dart';
import 'package:kosmenu_app/widgets/branded_loading_screen.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  static const Duration _pendingConfirmationWindow = Duration(minutes: 15);
  static const Color _dashboardBg = Color(0xFFF8F7FC);
  static const Color _purple = Color(0xFF6D28D9);
  static const Color _darkText = Color(0xFF11183C);
  static const Color _mutedText = Color(0xFF6B6F92);
  static const Color _green = Color(0xFF16A34A);
  static const Color _orange = Color(0xFFF97316);
  static const Color _red = Color(0xFFEF4444);

  late Future<_DashboardSnapshot> _snapshotFuture;
  late Stream<List<PedidoModel>> _ordersStream;

  StreamSubscription<List<PedidoModel>>? _ordersSubscription;
  StreamSubscription<AuthState>? _authStateSubscription;

  bool _isUpdatingBusinessOnline = false;
  bool _businessOnline = true;
  bool _didPrimeOnlineSwitch = false;

  bool _didPrimeOrderAlert = false;
  Set<String> _seenOrderIds = <String>{};
  List<PedidoModel> _latestOrders = const <PedidoModel>[];
  final Map<String, String> _optimisticStatusByOrderId = <String, String>{};
  final Set<String> _autoCancelInFlight = <String>{};

  MagicOnboardingResult? _recentCatalogResult;
  Timer? _recentCatalogTimer;
  Timer? _pendingAutoCancelTicker;
  bool _isRecoveringOrdersAuth = false;
  bool _isRestartingOrdersStream = false;
  _SalesRange _selectedSalesRange = _SalesRange.today;
  DateTimeRange? _customSalesRange;

  bool get _hasComercioId => SupabaseConfig.hasCurrentComercioId;

  @override
  void initState() {
    super.initState();
    _snapshotFuture = _fetchSnapshot();
    _ordersStream = _buildOrdersStream();
    _bindAuthStateRecovery();
    _subscribeToOrders();
    _startPendingAutoCancelTicker();
  }

  void _bindAuthStateRecovery() {
    _authStateSubscription?.cancel();
    _authStateSubscription = Supabase.instance.client.auth.onAuthStateChange
        .listen((event) {
          if (!mounted || !_hasComercioId) return;

          final authEvent = event.event;
          if (authEvent == AuthChangeEvent.signedIn ||
              authEvent == AuthChangeEvent.tokenRefreshed) {
            unawaited(_restartOrdersRealtime());
          }
        });
  }

  bool _isRealtimeJwtExpiredError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('invalidjwttoken') ||
        message.contains('token has expired') ||
        (message.contains('realtimesubscribestatus.channelerror') &&
            message.contains('jwt'));
  }

  bool _isUnrecoverableAuthError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('refresh token') ||
        message.contains('invalid_grant') ||
        message.contains('invalid refresh token') ||
        message.contains('jwt expired');
  }

  String _ordersErrorSubtitle(Object? error) {
    if (error == null) {
      return 'Intenta de nuevo en unos segundos.';
    }

    if (_isRealtimeJwtExpiredError(error)) {
      return 'La sesion de tiempo real expiro. Reintentaremos conectar automaticamente.';
    }

    return '$error';
  }

  Future<void> _restartOrdersRealtime() async {
    if (!mounted || !_hasComercioId || _isRestartingOrdersStream) return;

    _isRestartingOrdersStream = true;
    try {
      setState(() {
        _ordersStream = _buildOrdersStream();
      });
      _subscribeToOrders();
    } finally {
      _isRestartingOrdersStream = false;
    }
  }

  bool _isRealtimeTransientError(Object error) {
    final message = error.toString().toLowerCase();
    return message.contains('realtimesubscribestatus.timedout') ||
        message.contains('realtimesubscribestatus.channelerror') ||
        message.contains('websocket');
  }

  Future<void> _forceSignOutAfterAuthFailure(String reason) async {
    debugPrint('Cerrando sesion por error de auth realtime: $reason');
    try {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'Tu sesion expiro. Inicia sesion nuevamente para continuar.',
            ),
          ),
        );
      }
      await Future<void>.delayed(const Duration(milliseconds: 700));
      await Supabase.instance.client.auth.signOut();
    } catch (signOutError) {
      debugPrint('No se pudo cerrar sesion automaticamente: $signOutError');
    }
  }

  Future<void> _recoverOrdersAuthIfNeeded(Object error) async {
    if (_isRecoveringOrdersAuth || !_hasComercioId) return;
    if (!_isRealtimeJwtExpiredError(error)) return;

    _isRecoveringOrdersAuth = true;
    try {
      final client = Supabase.instance.client;
      final session = client.auth.currentSession;
      final refreshToken = session?.refreshToken ?? '';

      if (refreshToken.isEmpty) {
        await _forceSignOutAfterAuthFailure('refresh-token-missing');
        return;
      }

      await client.auth.refreshSession();

      await _restartOrdersRealtime();
    } catch (recoverError) {
      debugPrint('No se pudo recuperar auth realtime: $recoverError');
      if (_isUnrecoverableAuthError(recoverError)) {
        await _forceSignOutAfterAuthFailure(recoverError.toString());
      }
    } finally {
      _isRecoveringOrdersAuth = false;
    }
  }

  void _startPendingAutoCancelTicker() {
    _pendingAutoCancelTicker?.cancel();
    _pendingAutoCancelTicker = Timer.periodic(const Duration(seconds: 10), (_) {
      if (!mounted) return;
      unawaited(_autoCancelExpiredPendingOrders(_latestOrders));
    });
  }

  bool _isPendingExpired(PedidoModel pedido) {
    if (pedido.statusBucket != OrderStatusBucket.pending) return false;
    final createdAt = pedido.createdAt;
    if (createdAt == null) return false;
    return DateTime.now().difference(createdAt) >= _pendingConfirmationWindow;
  }

  Future<void> _autoCancelExpiredPendingOrders(
    Iterable<PedidoModel> orders,
  ) async {
    final expired = orders
        .where((pedido) => !pedido.hasParseError)
        .where(_isPendingExpired)
        .where((pedido) => !_autoCancelInFlight.contains(pedido.id))
        .toList(growable: false);

    if (expired.isEmpty) return;

    var canceledCount = 0;

    for (final pedido in expired) {
      _autoCancelInFlight.add(pedido.id);
      try {
        final detalles = Map<String, dynamic>.from(pedido.detalles);
        detalles['cancellation'] = <String, dynamic>{
          'source': 'timeout',
          'reason': 'timeout_no_confirmacion',
          'at': DateTime.now().toIso8601String(),
        };

        await Supabase.instance.client
            .from('pedidos')
            .update({'estado': 'cancelado', 'detalles': detalles})
            .eq('id', pedido.id)
            .eq('estado', 'pendiente');
        canceledCount += 1;
      } catch (error) {
        debugPrint(
          'No se pudo autocancelar pedido vencido ${pedido.id}: $error',
        );
      } finally {
        _autoCancelInFlight.remove(pedido.id);
      }
    }

    if (canceledCount > 0 && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(
            canceledCount == 1
                ? 'Se canceló 1 pedido pendiente por tiempo agotado.'
                : 'Se cancelaron $canceledCount pedidos pendientes por tiempo agotado.',
          ),
        ),
      );
    }
  }

  @override
  void dispose() {
    _ordersSubscription?.cancel();
    _authStateSubscription?.cancel();
    _recentCatalogTimer?.cancel();
    _pendingAutoCancelTicker?.cancel();
    super.dispose();
  }

  Future<_DashboardSnapshot> _fetchSnapshot() async {
    if (!_hasComercioId) {
      return const _DashboardSnapshot(
        comercio: ComercioModel(id: '', nombre: 'Comercio'),
        categoryCount: 0,
        productCount: 0,
        lastDayRevenue: 0,
      );
    }

    final client = Supabase.instance.client;
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final yesterdayStart = todayStart.subtract(const Duration(days: 1));
    final comercioFuture = client
        .from('comercios')
        .select()
        .eq('id', SupabaseConfig.currentComercioId)
        .limit(1)
        .maybeSingle();
    final categoriasFuture = client
        .from('categorias')
        .select('id')
        .eq('comercio_id', SupabaseConfig.currentComercioId);
    final productosFuture = client
        .from('productos')
        .select('id')
        .eq('comercio_id', SupabaseConfig.currentComercioId);
    final creditsFuture = client.functions.invoke(
      'get-ai-credits',
      method: HttpMethod.get,
      queryParameters: <String, String>{
        'commerce_id': SupabaseConfig.currentComercioId,
      },
    );
    final yesterdayOrdersFuture = client
        .from('pedidos')
        .select('id, comercio_id, total, detalles, estado, created_at')
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .gte('created_at', yesterdayStart.toIso8601String())
        .lt('created_at', todayStart.toIso8601String());

    final results = await Future.wait<dynamic>([
      comercioFuture,
      categoriasFuture,
      productosFuture,
      creditsFuture,
      yesterdayOrdersFuture,
    ]);

    final comercio = ComercioModel.fromMap(
      Map<String, dynamic>.from(
        (results[0] as Map?) ?? const <String, dynamic>{},
      ),
    );

    if (comercio.id.trim().isNotEmpty) {
      SupabaseConfig.setCurrentComercioId(comercio.id, slug: comercio.slug);
    }

    final creditsResponse = results[3] as FunctionResponse;
    final creditsPayload = _functionResponseMap(creditsResponse.data);
    final aiCreditsBalance = _toDoubleSafe(creditsPayload['credits_balance']);
    final aiCreditsUsed = _toDoubleSafe(creditsPayload['credits_used']);

    final yesterdayOrders = (results[4] as List<dynamic>)
        .map(
          (row) => PedidoModel.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .where((pedido) => !pedido.hasParseError)
        .toList(growable: false);

    final lastDayRevenue = yesterdayOrders.fold<double>(
      0,
      (sum, pedido) => sum + (pedido.total ?? 0),
    );
    final yesterdayTotalOrders = yesterdayOrders.length;
    final yesterdayCompletedOrders = yesterdayOrders
        .where((pedido) => pedido.statusBucket == OrderStatusBucket.completed)
        .length;
    final yesterdayPendingOrders = yesterdayOrders
        .where((pedido) => pedido.statusBucket == OrderStatusBucket.pending)
        .length;
    final yesterdayCanceledOrders = yesterdayOrders
        .where((pedido) => pedido.statusBucket == OrderStatusBucket.canceled)
        .length;

    return _DashboardSnapshot(
      comercio: comercio,
      categoryCount: (results[1] as List<dynamic>).length,
      productCount: (results[2] as List<dynamic>).length,
      aiCreditsBalance: aiCreditsBalance,
      aiCreditsUsed: aiCreditsUsed,
      lastDayRevenue: lastDayRevenue,
      yesterdayTotalOrders: yesterdayTotalOrders,
      yesterdayCompletedOrders: yesterdayCompletedOrders,
      yesterdayPendingOrders: yesterdayPendingOrders,
      yesterdayCanceledOrders: yesterdayCanceledOrders,
    );
  }

  Stream<List<PedidoModel>> _buildOrdersStream() {
    if (!_hasComercioId) {
      return Stream<List<PedidoModel>>.value(const <PedidoModel>[]);
    }

    return Supabase.instance.client
        .from('pedidos')
        .stream(primaryKey: ['id'])
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .order('created_at', ascending: false)
        .limit(250)
        .map(
          (rows) => rows
              .map((row) => PedidoModel.fromMap(Map<String, dynamic>.from(row)))
              .toList(growable: false),
        );
  }

  void _subscribeToOrders() {
    _ordersSubscription?.cancel();
    _seenOrderIds = <String>{};
    _didPrimeOrderAlert = false;

    _ordersSubscription = _ordersStream.listen(
      (orders) {
        if (_optimisticStatusByOrderId.isNotEmpty) {
          for (final pedido in orders) {
            final optimistic = _optimisticStatusByOrderId[pedido.id];
            if (optimistic == null) continue;

            final serverStatus = _normalizeStatusString(pedido.estado);
            final optimisticStatus = _normalizeStatusString(optimistic);
            if (serverStatus == optimisticStatus) {
              _optimisticStatusByOrderId.remove(pedido.id);
            }
          }
        }

        _latestOrders = orders;
        final validOrders = orders.where((order) => !order.hasParseError);
        unawaited(_autoCancelExpiredPendingOrders(validOrders));
        final currentIds = validOrders.map((e) => e.id).toSet();

        if (!_didPrimeOrderAlert) {
          _seenOrderIds = currentIds;
          _didPrimeOrderAlert = true;
          return;
        }

        final newOrders = validOrders.where(
          (e) => !_seenOrderIds.contains(e.id),
        );
        _seenOrderIds = currentIds;

        if (newOrders.isEmpty || !mounted) return;

        final newest = newOrders.first;
        final orderLabel = newest.orderId ?? newest.id;
        final statusBucket = newest.statusBucket;
        SystemSound.play(SystemSoundType.alert);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'Nuevo pedido recibido: $orderLabel · ${statusBucket.label}',
            ),
          ),
        );
      },
      onError: (Object error, StackTrace stackTrace) {
        debugPrint('Orders stream error: $error');
        unawaited(_recoverOrdersAuthIfNeeded(error));
        if (_isRealtimeTransientError(error) &&
            !_isRealtimeJwtExpiredError(error)) {
          unawaited(_restartOrdersRealtime());
        }
      },
    );
  }

  Future<void> _refreshDashboard() async {
    if (!mounted) return;
    setState(() {
      _snapshotFuture = _fetchSnapshot();
      _ordersStream = _buildOrdersStream();
    });
    _subscribeToOrders();
  }

  Future<void> _openProfile() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ProfileScreen()));
    if (!mounted) return;
    await _refreshDashboard();
  }

  Future<void> _openMagicOnboarding() async {
    final result = await Navigator.of(context).push<MagicOnboardingResult>(
      MaterialPageRoute(builder: (_) => const MagicOnboardingScreen()),
    );

    if (result == null || !mounted) return;

    _recentCatalogTimer?.cancel();
    setState(() {
      _recentCatalogResult = result;
    });

    _recentCatalogTimer = Timer(const Duration(seconds: 8), () {
      if (!mounted) return;
      setState(() => _recentCatalogResult = null);
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Catálogo "${result.catalog.nombre}" listo con ${result.createdCategories} categorías y ${result.createdProducts} productos.',
        ),
      ),
    );

    await _refreshDashboard();
  }

  Future<void> _openOrderDetail(PedidoModel pedido) async {
    final orderId = pedido.orderId;
    if (orderId == null || orderId.trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Este pedido no tiene ORDER_ID disponible.'),
        ),
      );
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => OrderDetailScreen(orderId: orderId)),
    );

    if (!mounted) return;
    await _refreshDashboard();
  }

  Future<ComercioModel> _resolveCurrentComercio() async {
    final id = SupabaseConfig.currentComercioId.trim();
    if (id.isEmpty) {
      return const ComercioModel(id: '', nombre: 'Comercio');
    }

    try {
      final row = await Supabase.instance.client
          .from('comercios')
          .select()
          .eq('id', id)
          .limit(1)
          .maybeSingle();

      if (row == null) {
        return ComercioModel(
          id: id,
          slug: SupabaseConfig.currentComercioSlug,
          nombre: 'Comercio',
        );
      }

      final comercio = ComercioModel.fromMap(Map<String, dynamic>.from(row));
      SupabaseConfig.setCurrentComercioId(comercio.id, slug: comercio.slug);
      return comercio;
    } catch (_) {
      return ComercioModel(
        id: id,
        slug: SupabaseConfig.currentComercioSlug,
        nombre: 'Comercio',
      );
    }
  }

  Future<void> _openPublicMenu() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado para abrir el menú.');
      return;
    }

    final comercio = await _resolveCurrentComercio();
    final url = getPublicMenuUrl(comercio);
    final launched = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );

    if (!launched && mounted) {
      _showInfo('No se pudo abrir el menú público.');
    }
  }

  Future<void> _openAssistedPublicMenu(ComercioModel comercio) async {
    final baseUrl = _buildPublicUrl(comercio).trim();
    if (baseUrl.isEmpty) {
      _showInfo('No hay una URL pública disponible para este comercio.');
      return;
    }

    final uri = Uri.parse(baseUrl);
    final assistedUri = uri.replace(
      queryParameters: <String, String>{
        ...uri.queryParameters,
        'mode': 'assisted',
        'source': 'dashboard',
      },
    );

    final launched = await launchUrl(
      assistedUri,
      mode: LaunchMode.externalApplication,
    );

    if (!launched && mounted) {
      _showInfo('No se pudo abrir el menú de venta asistida.');
    }
  }

  Future<void> _copyPublicMenuUrl() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado para copiar la URL.');
      return;
    }

    final comercio = await _resolveCurrentComercio();
    await Clipboard.setData(ClipboardData(text: getPublicMenuUrl(comercio)));
    _showInfo('URL del menú copiada al portapapeles.');
  }

  Future<void> _sharePublicMenu() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado para compartir el menú.');
      return;
    }

    final comercio = await _resolveCurrentComercio();
    final url = getPublicMenuUrl(comercio);

    await SharePlus.instance.share(
      ShareParams(
        text: 'Mira nuestro menú digital: $url',
        subject: 'Menú digital',
      ),
    );
  }

  Future<void> _openQrGenerator() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado para generar el QR.');
      return;
    }

    final comercio = await _resolveCurrentComercio();
    if (!mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => QrGeneratorScreen(comercio: comercio)),
    );
  }

  Future<void> _openCurrentMenuManager() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado para gestionar el menú.');
      return;
    }

    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CategoryListScreen()));

    if (!mounted) return;
    await _refreshDashboard();
  }

  Future<void> _openNotificationsSheet() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado.');
      return;
    }

    final rows = await Supabase.instance.client
        .from('pedidos')
        .select('id, estado, created_at, detalles')
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .order('created_at', ascending: false)
        .limit(12);

    if (!mounted) return;

    final items = (rows as List<dynamic>)
        .map(
          (row) => PedidoModel.fromMap(Map<String, dynamic>.from(row as Map)),
        )
        .where((pedido) => !pedido.hasParseError)
        .toList();

    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Icon(Icons.notifications_active_outlined),
                    const SizedBox(width: 8),
                    Text(
                      'Últimos movimientos',
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (items.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 22),
                    child: Text('No hay novedades recientes.'),
                  )
                else
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final pedido = items[index];
                        final bucket = pedido.statusBucket;
                        final title = pedido.orderId ?? pedido.id;
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: Icon(bucket.icon, color: bucket.color),
                          title: Text(title),
                          subtitle: Text(bucket.label),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _editBusinessInfo(ComercioModel comercio) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BusinessSetupScreen(initialComercio: comercio),
      ),
    );
    if (!mounted) return;
    await _refreshDashboard();
  }

  Future<void> _updateBusinessOnline(bool value) async {
    if (_isUpdatingBusinessOnline) return;

    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) {
      _showInfo('No hay un comercio activo para actualizar su estado.');
      return;
    }

    final previous = _businessOnline;
    setState(() {
      _businessOnline = value;
      _isUpdatingBusinessOnline = true;
    });

    try {
      await Supabase.instance.client
          .from('comercios')
          .update({'en_linea': value})
          .eq('id', comercioId);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(
            value
                ? 'Negocio en línea y aceptando pedidos.'
                : 'Negocio pausado para nuevos pedidos.',
          ),
        ),
      );
    } on PostgrestException catch (error) {
      final code = (error.code ?? '').toUpperCase();
      final message = error.message.toLowerCase();
      final missingOnlineColumn =
          code == 'PGRST204' || message.contains('en_linea');

      if (mounted) {
        setState(() => _businessOnline = previous);
      }

      if (missingOnlineColumn) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'No se pudo guardar el estado porque falta la columna en_linea en comercios.',
            ),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'No se pudo actualizar el estado en línea. Intenta de nuevo.\n$error',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() => _businessOnline = previous);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text(
              'No se pudo actualizar el estado en línea. Intenta de nuevo.\n$error',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUpdatingBusinessOnline = false);
      }
    }
  }

  DateTime _startOfDay(DateTime date) =>
      DateTime(date.year, date.month, date.day);

  DateTime _endOfDayExclusive(DateTime date) =>
      DateTime(date.year, date.month, date.day + 1);

  DateTime _subtractFromToday(int days) =>
      _startOfDay(DateTime.now()).subtract(Duration(days: days));

  String _monthShortEs(int month) {
    const names = <String>[
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    final safe = month.clamp(1, 12);
    return names[safe - 1];
  }

  String _shortDate(DateTime date) {
    final dd = date.day.toString().padLeft(2, '0');
    final mm = date.month.toString().padLeft(2, '0');
    return '$dd/$mm';
  }

  String _compactChartDateLabel(DateTime date, {DateTime? previous}) {
    final day = date.day.toString().padLeft(2, '0');
    final shouldShowMonth =
        previous == null ||
        previous.month != date.month ||
        previous.year != date.year;

    if (!shouldShowMonth) {
      return day;
    }

    return '$day ${_monthShortEs(date.month)}';
  }

  String _fullChartDateLabel(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    return '$day ${_monthShortEs(date.month)}';
  }

  String _hourAxisLabel(int hour) => hour.toString().padLeft(2, '0');

  String _hourTooltipLabel(DateTime day, int hour) {
    final hh = hour.toString().padLeft(2, '0');
    return '${_fullChartDateLabel(day)} $hh:00';
  }

  String _activeRangeLabel() {
    if (_selectedSalesRange != _SalesRange.custom) {
      return _selectedSalesRange.label;
    }
    final range = _customSalesRange;
    if (range == null) return _selectedSalesRange.label;
    return '${_shortDate(range.start)} - ${_shortDate(range.end)}';
  }

  _SalesRangeWindow _resolveSalesRangeWindow(Iterable<PedidoModel> orders) {
    final todayStart = _startOfDay(DateTime.now());
    final tomorrow = _endOfDayExclusive(DateTime.now());
    final currentMonthStart = DateTime(todayStart.year, todayStart.month);

    switch (_selectedSalesRange) {
      case _SalesRange.today:
        return _SalesRangeWindow(
          startInclusive: todayStart,
          endExclusive: tomorrow,
        );
      case _SalesRange.yesterday:
        return _SalesRangeWindow(
          startInclusive: todayStart.subtract(const Duration(days: 1)),
          endExclusive: todayStart,
        );
      case _SalesRange.lastWeek:
        return _SalesRangeWindow(
          startInclusive: _subtractFromToday(6),
          endExclusive: tomorrow,
        );
      case _SalesRange.lastFortnight:
        return _SalesRangeWindow(
          startInclusive: _subtractFromToday(14),
          endExclusive: tomorrow,
        );
      case _SalesRange.thisMonth:
        return _SalesRangeWindow(
          startInclusive: currentMonthStart,
          endExclusive: tomorrow,
        );
      case _SalesRange.lastMonth:
        return _SalesRangeWindow(
          startInclusive: _subtractFromToday(29),
          endExclusive: tomorrow,
        );
      case _SalesRange.last3Months:
        return _SalesRangeWindow(
          startInclusive: _subtractFromToday(89),
          endExclusive: tomorrow,
        );
      case _SalesRange.last6Months:
        return _SalesRangeWindow(
          startInclusive: _subtractFromToday(179),
          endExclusive: tomorrow,
        );
      case _SalesRange.lastYear:
        return _SalesRangeWindow(
          startInclusive: _subtractFromToday(364),
          endExclusive: tomorrow,
        );
      case _SalesRange.allTime:
        DateTime? earliest;
        for (final order in orders) {
          final created = order.createdAt?.toLocal();
          if (created == null) continue;
          final day = _startOfDay(created);
          if (earliest == null || day.isBefore(earliest)) {
            earliest = day;
          }
        }
        return _SalesRangeWindow(
          startInclusive: earliest ?? todayStart,
          endExclusive: tomorrow,
        );
      case _SalesRange.custom:
        final custom = _customSalesRange;
        if (custom == null) {
          return _SalesRangeWindow(
            startInclusive: todayStart,
            endExclusive: tomorrow,
          );
        }
        return _SalesRangeWindow(
          startInclusive: _startOfDay(custom.start),
          endExclusive: _endOfDayExclusive(custom.end),
        );
    }
  }

  bool _isWithinSelectedSalesRange(
    DateTime? date,
    Iterable<PedidoModel> orders,
  ) {
    if (date == null) return false;
    final local = date.toLocal();
    final window = _resolveSalesRangeWindow(orders);
    return !local.isBefore(window.startInclusive) &&
        local.isBefore(window.endExclusive);
  }

  double _toDoubleSafe(dynamic value) {
    if (value is num) return value.toDouble();
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return 0;
    return double.tryParse(raw.replaceAll(',', '.')) ?? 0;
  }

  double _resolvePedidoTotal(PedidoModel pedido) {
    final direct = pedido.total;
    if (direct != null && direct > 0) return direct;

    final detalles = pedido.detalles;
    final resumenRaw = detalles['resumen'];
    final resumen = resumenRaw is Map
        ? Map<String, dynamic>.from(resumenRaw)
        : const <String, dynamic>{};

    final candidates = <dynamic>[
      detalles['total'],
      detalles['total_pedido'],
      detalles['monto_total'],
      detalles['amount_total'],
      resumen['total'],
      resumen['monto_total'],
    ];

    for (final candidate in candidates) {
      final parsed = _toDoubleSafe(candidate);
      if (parsed > 0) return parsed;
    }

    final itemsTotal = pedido.items.fold<double>(
      0,
      (sum, item) => sum + item.total,
    );
    return itemsTotal > 0 ? itemsTotal : 0;
  }

  _SalesHistorySeries _buildSalesHistoryForSelectedRange(
    Iterable<PedidoModel> orders,
  ) {
    final window = _resolveSalesRangeWindow(orders);
    final filtered = orders
        .where((pedido) => pedido.statusBucket != OrderStatusBucket.canceled)
        .where(
          (pedido) => _isWithinSelectedSalesRange(pedido.createdAt, orders),
        )
        .toList(growable: false);

    if (_selectedSalesRange == _SalesRange.today ||
        _selectedSalesRange == _SalesRange.yesterday) {
      final dayStart = window.startInclusive;
      final values = List<double>.filled(24, 0);
      final labels = List<String>.generate(24, _hourAxisLabel);
      final tooltipLabels = List<String>.generate(
        24,
        (hour) => _hourTooltipLabel(dayStart, hour),
      );

      for (final pedido in filtered) {
        final createdAt = pedido.createdAt?.toLocal();
        if (createdAt == null) continue;
        values[createdAt.hour] += _resolvePedidoTotal(pedido);
      }

      return _SalesHistorySeries(
        values: values,
        labels: labels,
        tooltipLabels: tooltipLabels,
      );
    }

    final spanDays = window.endExclusive
        .difference(window.startInclusive)
        .inDays;

    if (spanDays <= 31) {
      final values = <double>[];
      final labels = <String>[];
      final tooltipLabels = <String>[];

      var cursor = window.startInclusive;
      DateTime? previousBucketStart;
      while (cursor.isBefore(window.endExclusive)) {
        final bucketEnd = cursor.add(const Duration(days: 1));

        final total = filtered.fold<double>(0, (sum, pedido) {
          final created = pedido.createdAt?.toLocal();
          if (created == null) return sum;
          if (created.isBefore(cursor) || !created.isBefore(bucketEnd)) {
            return sum;
          }
          return sum + _resolvePedidoTotal(pedido);
        });

        values.add(total);
        labels.add(
          _compactChartDateLabel(cursor, previous: previousBucketStart),
        );
        tooltipLabels.add(_fullChartDateLabel(cursor));
        previousBucketStart = cursor;
        cursor = bucketEnd;
      }

      return _SalesHistorySeries(
        values: values,
        labels: labels,
        tooltipLabels: tooltipLabels,
      );
    }

    final monthStarts = <DateTime>[];
    var monthCursor = DateTime(
      window.startInclusive.year,
      window.startInclusive.month,
    );
    final monthEnd = DateTime(
      window.endExclusive.year,
      window.endExclusive.month,
    );
    while (!monthCursor.isAfter(monthEnd)) {
      monthStarts.add(monthCursor);
      monthCursor = DateTime(monthCursor.year, monthCursor.month + 1);
    }

    final desiredBuckets = monthStarts.length <= 12 ? monthStarts.length : 12;
    final groupSize = (monthStarts.length / desiredBuckets).ceil();
    final values = <double>[];
    final labels = <String>[];
    final tooltipLabels = <String>[];

    for (var i = 0; i < monthStarts.length; i += groupSize) {
      final bucketStart = monthStarts[i];
      final nextIndex = (i + groupSize) < monthStarts.length
          ? i + groupSize
          : monthStarts.length;
      final bucketEnd = nextIndex < monthStarts.length
          ? monthStarts[nextIndex]
          : window.endExclusive;

      final total = filtered.fold<double>(0, (sum, pedido) {
        final created = pedido.createdAt?.toLocal();
        if (created == null) return sum;
        if (created.isBefore(bucketStart) || !created.isBefore(bucketEnd)) {
          return sum;
        }
        return sum + _resolvePedidoTotal(pedido);
      });

      values.add(total);
      labels.add(_monthShortEs(bucketStart.month));
      tooltipLabels.add(_fullChartDateLabel(bucketStart));
    }

    return _SalesHistorySeries(
      values: values,
      labels: labels,
      tooltipLabels: tooltipLabels,
    );
  }

  String _normalizeStatusString(String? value) {
    final raw = (value ?? '').trim().toLowerCase();
    if (raw.isEmpty) return 'pendiente';
    return raw;
  }

  double _deltaPercentVsYesterday({
    required int todayValue,
    required int yesterdayValue,
  }) {
    if (yesterdayValue == 0) {
      return todayValue > 0 ? 100 : 0;
    }

    return ((todayValue - yesterdayValue) / yesterdayValue.abs()) * 100;
  }

  PedidoModel _pedidoWithOptimisticStatus(PedidoModel pedido) {
    final overrideStatus = _optimisticStatusByOrderId[pedido.id];
    if (overrideStatus == null || overrideStatus.trim().isEmpty) {
      return pedido;
    }

    final map = Map<String, dynamic>.from(pedido.toMap());
    map['estado'] = overrideStatus;
    return PedidoModel.fromMap(map);
  }

  List<PedidoModel> _applyOptimisticStatuses(Iterable<PedidoModel> orders) {
    return orders.map(_pedidoWithOptimisticStatus).toList(growable: false);
  }

  String _buildPublicUrl(ComercioModel comercio) {
    return getPublicMenuUrl(comercio);
  }

  Map<String, dynamic> _functionResponseMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', item));
    }
    return const <String, dynamic>{};
  }

  void _showInfo(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final media = MediaQuery.of(context);
    final bottomInset = media.viewPadding.bottom;
    final screenWidth = media.size.width;
    final isSmallScreen = screenWidth < 390;

    return FutureBuilder<_DashboardSnapshot>(
      future: _snapshotFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const BrandedLoadingScreen(withScaffold: true);
        }

        final dashboardData = snapshot.data;

        return Scaffold(
          backgroundColor: _dashboardBg,
          floatingActionButton: dashboardData == null
              ? null
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final compactFab = constraints.maxWidth < 390;
                    if (compactFab) {
                      return FloatingActionButton(
                        heroTag: 'assisted-order-fab',
                        backgroundColor: _purple,
                        foregroundColor: Colors.white,
                        onPressed: () =>
                            _openAssistedPublicMenu(dashboardData.comercio),
                        child: const Icon(Icons.add_rounded),
                      );
                    }

                    return FloatingActionButton.extended(
                      heroTag: 'assisted-order-fab',
                      backgroundColor: _purple,
                      foregroundColor: Colors.white,
                      onPressed: () =>
                          _openAssistedPublicMenu(dashboardData.comercio),
                      icon: const Icon(Icons.receipt_long_rounded),
                      label: const Text('Nuevo pedido'),
                    );
                  },
                ),
          body: SafeArea(
            child: Builder(
              builder: (context) {
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline_rounded, size: 44),
                          const SizedBox(height: 10),
                          Text(
                            'No se pudo cargar el dashboard.',
                            style: theme.textTheme.titleMedium,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            '${snapshot.error}',
                            style: theme.textTheme.bodySmall,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 14),
                          FilledButton.icon(
                            onPressed: _refreshDashboard,
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('Intentar de nuevo'),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                final data = snapshot.data;
                if (data == null) {
                  return const Center(child: Text('No hay datos disponibles.'));
                }

                if (!_didPrimeOnlineSwitch) {
                  _businessOnline = data.comercio.enLinea;
                  _didPrimeOnlineSwitch = true;
                }

                return StreamBuilder<List<PedidoModel>>(
                  stream: _ordersStream,
                  builder: (context, ordersSnapshot) {
                    final allOrders = _applyOptimisticStatuses(
                      ordersSnapshot.data ?? const <PedidoModel>[],
                    );
                    final malformedOrders = allOrders
                        .where((pedido) => pedido.hasParseError)
                        .toList(growable: false);
                    final validOrders = allOrders
                        .where((pedido) => !pedido.hasParseError)
                        .toList(growable: false);

                    final recentOrders = validOrders
                        .take(3)
                        .toList(growable: false);

                    final pendingCount = validOrders
                        .where(
                          (pedido) =>
                              pedido.statusBucket == OrderStatusBucket.pending,
                        )
                        .length;
                    final completedCount = validOrders
                        .where(
                          (pedido) =>
                              pedido.statusBucket ==
                              OrderStatusBucket.completed,
                        )
                        .length;
                    final canceledCount = validOrders
                        .where(
                          (pedido) =>
                              pedido.statusBucket == OrderStatusBucket.canceled,
                        )
                        .length;
                    final selectedOrders = validOrders
                        .where(
                          (o) => _isWithinSelectedSalesRange(
                            o.createdAt,
                            validOrders,
                          ),
                        )
                        .where(
                          (o) => o.statusBucket != OrderStatusBucket.canceled,
                        )
                        .toList(growable: false);
                    final selectedCount = selectedOrders.length;
                    final selectedRevenue = selectedOrders.fold<double>(
                      0,
                      (sum, o) => sum + _resolvePedidoTotal(o),
                    );
                    final double ticketPromedio = selectedCount == 0
                        ? 0.0
                        : (selectedRevenue / selectedCount);
                    final salesSeries = _buildSalesHistoryForSelectedRange(
                      validOrders,
                    );
                    final ordersLabel = _selectedSalesRange.ordersLabel;
                    final incomeLabel = _selectedSalesRange.incomeLabel;

                    return RefreshIndicator(
                      onRefresh: _refreshDashboard,
                      child: ListView(
                        padding: EdgeInsets.fromLTRB(
                          16,
                          12,
                          16,
                          (isSmallScreen ? 124 : 136) + bottomInset,
                        ),
                        children: [
                          _DashboardHeader(
                            commerceName: data.comercio.nombre,
                            darkText: _darkText,
                            mutedText: _mutedText,
                            onOpenNotifications: _openNotificationsSheet,
                            onOpenProfile: _openProfile,
                            onActionSelected: (value) async {
                              switch (value) {
                                case _DashboardAction.refresh:
                                  await _refreshDashboard();
                                  break;
                                case _DashboardAction.magicMenu:
                                  await _openMagicOnboarding();
                                  break;
                                case _DashboardAction.shareMenu:
                                  await _sharePublicMenu();
                                  break;
                                case _DashboardAction.copyLink:
                                  await _copyPublicMenuUrl();
                                  break;
                                case _DashboardAction.openWeb:
                                  await _openPublicMenu();
                                  break;
                                case _DashboardAction.showQr:
                                  await _openQrGenerator();
                                  break;
                                case _DashboardAction.manageMenu:
                                  await _openCurrentMenuManager();
                                  break;
                              }
                            },
                          ),
                          const SizedBox(height: 14),
                          if (_recentCatalogResult != null)
                            _CatalogUpdateBanner(result: _recentCatalogResult!),
                          _CompactKpiScroller(
                            cards: [
                              _CompactKpiCardData(
                                title: 'Pedidos',
                                value: '${validOrders.length}',
                                icon: Icons.shopping_bag_outlined,
                                color: _purple,
                                deltaPercent: _deltaPercentVsYesterday(
                                  todayValue: validOrders.length,
                                  yesterdayValue: data.yesterdayTotalOrders,
                                ),
                              ),
                              _CompactKpiCardData(
                                title: 'Completados',
                                value: '$completedCount',
                                icon: Icons.check_circle_outline_rounded,
                                color: _green,
                                deltaPercent: _deltaPercentVsYesterday(
                                  todayValue: completedCount,
                                  yesterdayValue: data.yesterdayCompletedOrders,
                                ),
                              ),
                              _CompactKpiCardData(
                                title: 'Pendientes',
                                value: '$pendingCount',
                                icon: Icons.access_time_rounded,
                                color: _orange,
                                deltaPercent: _deltaPercentVsYesterday(
                                  todayValue: pendingCount,
                                  yesterdayValue: data.yesterdayPendingOrders,
                                ),
                                downColor: _orange,
                              ),
                              _CompactKpiCardData(
                                title: 'Cancelados',
                                value: '$canceledCount',
                                icon: Icons.cancel_outlined,
                                color: _red,
                                deltaPercent: _deltaPercentVsYesterday(
                                  todayValue: canceledCount,
                                  yesterdayValue: data.yesterdayCanceledOrders,
                                ),
                                downColor: _red,
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),
                          _CompactBusinessConfigBanner(
                            title: 'Configuración del negocio',
                            subtitle:
                                'Administra tu perfil público y abre el menú en segundos.',
                            onEdit: () => _editBusinessInfo(data.comercio),
                            onManageMenu: _openCurrentMenuManager,
                            purple: _purple,
                          ),
                          const SizedBox(height: 12),
                          _CompactSalesSummaryCard(
                            salesToday: selectedRevenue,
                            ordersToday: selectedCount,
                            averageTicket: ticketPromedio,
                            darkText: _darkText,
                            mutedText: _mutedText,
                            purple: _purple,
                            salesHistory: salesSeries.values,
                            salesLabels: salesSeries.labels,
                            salesTooltipLabels: salesSeries.tooltipLabels,
                            rangeLabel: _activeRangeLabel(),
                            ordersLabel: ordersLabel,
                            incomeLabel: incomeLabel,
                            onRangeSelected: (range) async {
                              if (range == _SalesRange.custom) {
                                final earliest = validOrders
                                    .map((o) => o.createdAt?.toLocal())
                                    .whereType<DateTime>()
                                    .fold<DateTime?>(null, (acc, date) {
                                      if (acc == null || date.isBefore(acc)) {
                                        return date;
                                      }
                                      return acc;
                                    });

                                final firstDate = earliest != null
                                    ? _startOfDay(earliest)
                                    : _startOfDay(
                                        DateTime.now().subtract(
                                          const Duration(days: 365 * 5),
                                        ),
                                      );

                                final picked = await showDateRangePicker(
                                  context: context,
                                  firstDate: firstDate,
                                  lastDate: DateTime.now(),
                                  initialDateRange: _customSalesRange,
                                  helpText: 'Selecciona un rango',
                                  locale: const Locale('es'),
                                );

                                if (!mounted || picked == null) return;
                                setState(() {
                                  _customSalesRange = picked;
                                  _selectedSalesRange = _SalesRange.custom;
                                });
                                return;
                              }

                              if (_selectedSalesRange == range) return;
                              setState(() => _selectedSalesRange = range);
                            },
                          ),
                          const SizedBox(height: 14),
                          _CompactBusinessInfoCard(
                            comercio: data.comercio,
                            aiCreditsBalance: data.aiCreditsBalance,
                            aiCreditsUsed: data.aiCreditsUsed,
                            isUpdatingBusinessOnline: _isUpdatingBusinessOnline,
                            businessOnline: _businessOnline,
                            onToggleOnline: _updateBusinessOnline,
                            darkText: _darkText,
                            mutedText: _mutedText,
                            purple: _purple,
                          ),
                          const SizedBox(height: 16),
                          _SectionTitle(
                            title: 'Pedidos recientes',
                            actionLabel: validOrders.length > 3
                                ? 'Ver todos'
                                : null,
                            onActionTap: validOrders.length > 3
                                ? () => _openAllOrdersSheet(validOrders)
                                : null,
                          ),
                          const SizedBox(height: 10),
                          if (ordersSnapshot.hasError)
                            _EmptyStateCard(
                              title: 'No se pudieron cargar los pedidos',
                              subtitle: _ordersErrorSubtitle(
                                ordersSnapshot.error,
                              ),
                              icon: Icons.error_outline_rounded,
                              actionLabel: 'Reintentar',
                              onAction: _refreshDashboard,
                            )
                          else if (recentOrders.isEmpty &&
                              malformedOrders.isEmpty)
                            _EmptyStateCard(
                              title: 'Sin pedidos recientes',
                              subtitle:
                                  'Aún no recibes pedidos. Aquí aparecerán los últimos cuando entren.',
                              icon: Icons.inbox_outlined,
                            )
                          else ...[
                            ...malformedOrders.map(
                              (pedido) => _MalformedOrderTile(pedido: pedido),
                            ),
                            ...recentOrders.map(
                              (pedido) => _CompactRecentOrderTile(
                                pedido: pedido,
                                onTap: () => _openOrderDetail(pedido),
                                darkText: _darkText,
                                mutedText: _mutedText,
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
        );
      },
    );
  }

  Future<void> _openAllOrdersSheet(List<PedidoModel> orders) async {
    if (!mounted) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.82,
          maxChildSize: 0.96,
          minChildSize: 0.55,
          builder: (context, controller) {
            return ListView.separated(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
              itemCount: orders.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final pedido = orders[index];
                return _CompactRecentOrderTile(
                  pedido: pedido,
                  onTap: () async {
                    Navigator.of(sheetContext).pop();
                    await _openOrderDetail(pedido);
                  },
                  darkText: _darkText,
                  mutedText: _mutedText,
                );
              },
            );
          },
        );
      },
    );
  }
}

class _DashboardHeader extends StatelessWidget {
  const _DashboardHeader({
    required this.commerceName,
    required this.darkText,
    required this.mutedText,
    required this.onOpenNotifications,
    required this.onOpenProfile,
    required this.onActionSelected,
  });

  final String commerceName;
  final Color darkText;
  final Color mutedText;
  final VoidCallback onOpenNotifications;
  final VoidCallback onOpenProfile;
  final ValueChanged<_DashboardAction> onActionSelected;

  @override
  Widget build(BuildContext context) {
    final resolvedName = commerceName.trim().isEmpty
        ? 'Comercio'
        : commerceName.trim();

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '¡Hola, $resolvedName! 👋',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: darkText,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Aquí tienes un resumen de tu negocio.',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: mutedText,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _HeaderCircleButton(
              icon: Icons.notifications_none_rounded,
              tooltip: 'Notificaciones',
              onTap: onOpenNotifications,
            ),
            _HeaderCircleButton(
              icon: Icons.account_circle_outlined,
              tooltip: 'Perfil',
              onTap: onOpenProfile,
            ),
            PopupMenuButton<_DashboardAction>(
              tooltip: 'Más acciones',
              onSelected: onActionSelected,
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: _DashboardAction.refresh,
                  child: _MenuActionRow(
                    icon: Icons.refresh_rounded,
                    label: 'Refrescar dashboard',
                  ),
                ),
                PopupMenuDivider(),
                PopupMenuItem(
                  value: _DashboardAction.magicMenu,
                  child: _MenuActionRow(
                    icon: Icons.auto_awesome_rounded,
                    label: 'Escanear con IA',
                  ),
                ),
                PopupMenuItem(
                  value: _DashboardAction.manageMenu,
                  child: _MenuActionRow(
                    icon: Icons.restaurant_menu_rounded,
                    label: 'Gestionar menú actual',
                  ),
                ),
                PopupMenuItem(
                  value: _DashboardAction.showQr,
                  child: _MenuActionRow(
                    icon: Icons.qr_code_2_rounded,
                    label: 'Generar QR',
                  ),
                ),
                PopupMenuItem(
                  value: _DashboardAction.shareMenu,
                  child: _MenuActionRow(
                    icon: Icons.share_rounded,
                    label: 'Compartir menú',
                  ),
                ),
                PopupMenuItem(
                  value: _DashboardAction.copyLink,
                  child: _MenuActionRow(
                    icon: Icons.copy_all_rounded,
                    label: 'Copiar enlace',
                  ),
                ),
                PopupMenuItem(
                  value: _DashboardAction.openWeb,
                  child: _MenuActionRow(
                    icon: Icons.open_in_browser_rounded,
                    label: 'Abrir menú web',
                  ),
                ),
              ],
              child: const _HeaderCircleButton(
                icon: Icons.more_horiz_rounded,
                tooltip: 'Más acciones',
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _HeaderCircleButton extends StatelessWidget {
  const _HeaderCircleButton({
    required this.icon,
    required this.tooltip,
    this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Tooltip(
          message: tooltip,
          child: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0xFFE5E7EB)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x120F172A),
                  blurRadius: 8,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            child: Icon(icon, size: 18, color: const Color(0xFF11183C)),
          ),
        ),
      ),
    );
  }
}

class _CompactKpiCardData {
  const _CompactKpiCardData({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
    required this.deltaPercent,
    this.downColor,
  });

  final String title;
  final String value;
  final IconData icon;
  final Color color;
  final double deltaPercent;
  final Color? downColor;
}

class _CompactKpiScroller extends StatelessWidget {
  const _CompactKpiScroller({required this.cards});

  final List<_CompactKpiCardData> cards;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 124,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: cards.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final item = cards[index];
          return _CompactKpiCard(data: item);
        },
      ),
    );
  }
}

class _CompactKpiCard extends StatelessWidget {
  const _CompactKpiCard({required this.data});

  final _CompactKpiCardData data;

  @override
  Widget build(BuildContext context) {
    final isUp = data.deltaPercent >= 0;
    final trendColor = isUp
        ? const Color(0xFF16A34A)
        : (data.downColor ?? const Color(0xFFEF4444));
    final trendValue = data.deltaPercent.abs().round();

    return Container(
      width: 132,
      height: 124,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE8EAF2)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: data.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(data.icon, color: data.color, size: 18),
          ),
          const Spacer(),
          Text(
            data.value,
            style: GoogleFonts.poppins(
              fontSize: 34,
              fontWeight: FontWeight.w800,
              color: const Color(0xFF11183C),
              height: 1,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            data.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 11.5,
              color: const Color(0xFF6B6F92),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(
                isUp
                    ? Icons.arrow_drop_up_rounded
                    : Icons.arrow_drop_down_rounded,
                size: 14,
                color: trendColor,
              ),
              Text(
                '$trendValue% vs ayer',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 10.5,
                  color: trendColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CompactBusinessConfigBanner extends StatelessWidget {
  const _CompactBusinessConfigBanner({
    required this.title,
    required this.subtitle,
    required this.onEdit,
    required this.onManageMenu,
    required this.purple,
  });

  final String title;
  final String subtitle;
  final VoidCallback onEdit;
  final VoidCallback onManageMenu;
  final Color purple;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
      decoration: BoxDecoration(
        color: purple,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A6D28D9),
            blurRadius: 14,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.storefront_rounded, color: purple, size: 21),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    color: Colors.white.withValues(alpha: 0.86),
                    fontWeight: FontWeight.w500,
                    fontSize: 11.5,
                    height: 1.15,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              FilledButton(
                onPressed: onManageMenu,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: purple,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  minimumSize: const Size(0, 34),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(
                  'Menú actual',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              FilledButton(
                onPressed: onEdit,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white.withValues(alpha: 0.14),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  minimumSize: const Size(0, 34),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  elevation: 0,
                  side: const BorderSide(color: Colors.white24),
                ),
                child: Text(
                  'Editar',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CompactSalesSummaryCard extends StatelessWidget {
  const _CompactSalesSummaryCard({
    required this.salesToday,
    required this.ordersToday,
    required this.averageTicket,
    required this.darkText,
    required this.mutedText,
    required this.purple,
    this.salesHistory,
    this.salesLabels,
    this.salesTooltipLabels,
    required this.rangeLabel,
    required this.ordersLabel,
    required this.incomeLabel,
    required this.onRangeSelected,
  });

  final double salesToday;
  final int ordersToday;
  final double averageTicket;
  final Color darkText;
  final Color mutedText;
  final Color purple;
  final List<double>? salesHistory;
  final List<String>? salesLabels;
  final List<String>? salesTooltipLabels;
  final String rangeLabel;
  final String ordersLabel;
  final String incomeLabel;
  final ValueChanged<_SalesRange> onRangeSelected;

  @override
  Widget build(BuildContext context) {
    final chartData =
        salesHistory ?? const <double>[120, 180, 140, 200, 248, 220, 210];
    final labels =
        salesLabels ?? const <String>['00', '04', '08', '12', '16', '20', '24'];
    final tooltipLabels = salesTooltipLabels ?? labels;

    var highlightIndex = 0;
    var peak = -1.0;
    for (var i = 0; i < chartData.length; i++) {
      if (chartData[i] >= peak) {
        peak = chartData[i];
        highlightIndex = i;
      }
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'Resumen de ventas',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: darkText,
                ),
              ),
              const Spacer(),
              PopupMenuButton<_SalesRange>(
                onSelected: onRangeSelected,
                itemBuilder: (context) => const [
                  PopupMenuItem(value: _SalesRange.today, child: Text('Hoy')),
                  PopupMenuItem(
                    value: _SalesRange.yesterday,
                    child: Text('Ayer'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.lastWeek,
                    child: Text('Última semana'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.lastFortnight,
                    child: Text('Última quincena'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.thisMonth,
                    child: Text('Este mes'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.lastMonth,
                    child: Text('Último mes'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.last3Months,
                    child: Text('Últimos 3 meses'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.last6Months,
                    child: Text('Últimos 6 meses'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.lastYear,
                    child: Text('Último año'),
                  ),
                  PopupMenuItem(
                    value: _SalesRange.allTime,
                    child: Text('Desde el principio'),
                  ),
                  PopupMenuDivider(),
                  PopupMenuItem(
                    value: _SalesRange.custom,
                    child: Text('Personalizado'),
                  ),
                ],
                child: Container(
                  height: 30,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8F8FD),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFE9EAF4)),
                  ),
                  child: Row(
                    children: [
                      Text(
                        rangeLabel,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: mutedText,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Icon(
                        Icons.keyboard_arrow_down_rounded,
                        size: 16,
                        color: mutedText,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 122,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Ventas totales',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: mutedText,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '\$${salesToday.toStringAsFixed(2)}',
                      style: GoogleFonts.poppins(
                        fontSize: 38,
                        height: 0.98,
                        fontWeight: FontWeight.w700,
                        color: darkText,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(
                          Icons.arrow_upward_rounded,
                          color: Color(0xFF16A34A),
                          size: 16,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          '15% vs ayer',
                          style: GoogleFonts.poppins(
                            fontSize: 12.3,
                            fontWeight: FontWeight.w600,
                            color: const Color(0xFF16A34A),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 108,
                  child: _SalesSummaryChart(
                    salesHistory: chartData,
                    labels: labels,
                    tooltipLabels: tooltipLabels,
                    color: purple,
                    highlightIndex: highlightIndex,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _SalesMiniCard(
                  data: _SalesMiniData(
                    label: 'Ticket promedio',
                    value: '\$${averageTicket.toStringAsFixed(2)}',
                    color: const Color(0xFF8B5CF6),
                    icon: Icons.receipt_rounded,
                  ),
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: _SalesMiniCard(
                  data: _SalesMiniData(
                    label: ordersLabel,
                    value: '$ordersToday',
                    color: const Color(0xFF3B82F6),
                    icon: Icons.bar_chart_rounded,
                  ),
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: _SalesMiniCard(
                  data: _SalesMiniData(
                    label: incomeLabel,
                    value: '\$${salesToday.toStringAsFixed(2)}',
                    color: const Color(0xFF22C55E),
                    icon: Icons.attach_money_rounded,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SalesSummaryChart extends StatefulWidget {
  const _SalesSummaryChart({
    required this.salesHistory,
    required this.labels,
    required this.tooltipLabels,
    required this.color,
    required this.highlightIndex,
  });

  final List<double> salesHistory;
  final List<String> labels;
  final List<String> tooltipLabels;
  final Color color;
  final int highlightIndex;

  @override
  State<_SalesSummaryChart> createState() => _SalesSummaryChartState();
}

class _SalesSummaryChartState extends State<_SalesSummaryChart> {
  late int _selectedIndex;

  void _updateSelectedIndexFromDx(double dx, double width) {
    if (widget.salesHistory.length <= 1 || width <= 0) {
      return;
    }

    final clampedDx = dx.clamp(0.0, width);
    final ratio = clampedDx / width;
    final nextIndex = (ratio * (widget.salesHistory.length - 1)).round().clamp(
      0,
      widget.salesHistory.length - 1,
    );

    if (nextIndex == _selectedIndex) {
      return;
    }

    setState(() {
      _selectedIndex = nextIndex;
    });
  }

  @override
  void initState() {
    super.initState();
    _selectedIndex = widget.highlightIndex;
  }

  @override
  void didUpdateWidget(covariant _SalesSummaryChart oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.highlightIndex != oldWidget.highlightIndex ||
        widget.salesHistory.length != oldWidget.salesHistory.length ||
        widget.labels.length != oldWidget.labels.length ||
        widget.tooltipLabels.length != oldWidget.tooltipLabels.length) {
      _selectedIndex = widget.highlightIndex;
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxY = widget.salesHistory.reduce((a, b) => a > b ? a : b);
    final safeHighlight = _selectedIndex.clamp(
      0,
      widget.salesHistory.length - 1,
    );
    final selectedValue = widget.salesHistory[safeHighlight];
    final selectedLabel = widget.tooltipLabels[safeHighlight];

    return LayoutBuilder(
      builder: (context, constraints) {
        final isHourlyAxis = widget.labels.every((label) => label.length <= 2);
        final maxVisibleLabels = isHourlyAxis
            ? (constraints.maxWidth < 280 ? 6 : 8)
            : (constraints.maxWidth < 280 ? 4 : 5);
        final labelStep = widget.labels.length <= maxVisibleLabels
            ? 1
            : ((widget.labels.length - 1) / (maxVisibleLabels - 1)).ceil();
        final xRatio = widget.salesHistory.length <= 1
            ? 0.5
            : safeHighlight / (widget.salesHistory.length - 1);
        final bubbleLeft = (constraints.maxWidth * xRatio) - 38;

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) {
            _updateSelectedIndexFromDx(
              details.localPosition.dx,
              constraints.maxWidth,
            );
          },
          onHorizontalDragStart: (details) {
            _updateSelectedIndexFromDx(
              details.localPosition.dx,
              constraints.maxWidth,
            );
          },
          onHorizontalDragUpdate: (details) {
            _updateSelectedIndexFromDx(
              details.localPosition.dx,
              constraints.maxWidth,
            );
          },
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              IgnorePointer(
                child: LineChart(
                  LineChartData(
                    lineTouchData: const LineTouchData(enabled: false),
                    gridData: FlGridData(show: false),
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      rightTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      topTitles: const AxisTitles(
                        sideTitles: SideTitles(showTitles: false),
                      ),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 26,
                          interval: 1,
                          getTitlesWidget: (value, meta) {
                            final index = value.toInt();
                            if (index < 0 || index >= widget.labels.length) {
                              return const SizedBox.shrink();
                            }

                            final isBoundary =
                                index == 0 || index == widget.labels.length - 1;
                            final shouldShow =
                                isBoundary || index % labelStep == 0;
                            if (!shouldShow) {
                              return const SizedBox.shrink();
                            }

                            final text = widget.labels[index];
                            return SideTitleWidget(
                              meta: meta,
                              space: 6,
                              child: Text(
                                text,
                                style: GoogleFonts.poppins(
                                  fontSize: isHourlyAxis ? 10 : 9,
                                  fontWeight: FontWeight.w500,
                                  color: const Color(0xFF6B6F92),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    borderData: FlBorderData(show: false),
                    minX: 0,
                    maxX: (widget.salesHistory.length - 1).toDouble(),
                    minY: 0,
                    maxY: maxY <= 0 ? 1 : maxY * 1.28,
                    extraLinesData: ExtraLinesData(
                      verticalLines: [
                        VerticalLine(
                          x: safeHighlight.toDouble(),
                          color: widget.color.withValues(alpha: 0.28),
                          strokeWidth: 1,
                          dashArray: const [4, 4],
                        ),
                      ],
                    ),
                    lineBarsData: [
                      LineChartBarData(
                        spots: [
                          for (int i = 0; i < widget.salesHistory.length; i++)
                            FlSpot(i.toDouble(), widget.salesHistory[i]),
                        ],
                        isCurved: true,
                        color: widget.color,
                        barWidth: 2.2,
                        isStrokeCapRound: true,
                        dotData: FlDotData(
                          show: true,
                          getDotPainter: (spot, percent, barData, index) {
                            final isHighlight = index == safeHighlight;
                            return FlDotCirclePainter(
                              radius: isHighlight ? 4.8 : 2.4,
                              color: widget.color,
                              strokeWidth: isHighlight ? 2 : 0,
                              strokeColor: Colors.white,
                            );
                          },
                        ),
                        belowBarData: BarAreaData(show: false),
                      ),
                    ],
                  ),
                  duration: const Duration(milliseconds: 120),
                ),
              ),
              Positioned(
                left: bubbleLeft.clamp(0, constraints.maxWidth - 88),
                top: -8,
                child: IgnorePointer(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF312E81),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          selectedLabel,
                          style: GoogleFonts.poppins(
                            fontSize: 8,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withValues(alpha: 0.86),
                            height: 1,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '\$${selectedValue.toStringAsFixed(2)}',
                          style: GoogleFonts.poppins(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                            height: 1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SalesMiniData {
  const _SalesMiniData({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  final String label;
  final String value;
  final Color color;
  final IconData icon;
}

class _SalesMiniCard extends StatelessWidget {
  const _SalesMiniCard({required this.data});

  final _SalesMiniData data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
      decoration: BoxDecoration(
        color: data.color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: data.color.withValues(alpha: 0.16),
              shape: BoxShape.circle,
            ),
            child: Icon(data.icon, size: 11, color: data.color),
          ),
          const SizedBox(height: 4),
          Text(
            data.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 9.2,
              color: const Color(0xFF6B6F92),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              data.value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.poppins(
                fontSize: 25,
                height: 0.95,
                color: const Color(0xFF11183C),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactBusinessInfoCard extends StatelessWidget {
  const _CompactBusinessInfoCard({
    required this.comercio,
    required this.aiCreditsBalance,
    required this.aiCreditsUsed,
    required this.isUpdatingBusinessOnline,
    required this.businessOnline,
    required this.onToggleOnline,
    required this.darkText,
    required this.mutedText,
    required this.purple,
  });

  final ComercioModel comercio;
  final double aiCreditsBalance;
  final double aiCreditsUsed;
  final bool isUpdatingBusinessOnline;
  final bool businessOnline;
  final ValueChanged<bool> onToggleOnline;
  final Color darkText;
  final Color mutedText;
  final Color purple;

  @override
  Widget build(BuildContext context) {
    final whatsappLabel = (comercio.whatsapp ?? '').trim().isEmpty
        ? 'Sin configurar'
        : comercio.whatsapp!.trim();
    final slugLabel = (comercio.slug ?? '').trim().isEmpty
        ? 'Sin slug'
        : '@${comercio.slug!.trim()}';

    Widget infoLine({
      required String label,
      required String value,
      required IconData icon,
    }) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 7),
        child: Row(
          children: [
            Icon(icon, size: 15, color: purple),
            const SizedBox(width: 7),
            Text(
              '$label:',
              style: GoogleFonts.poppins(
                fontSize: 11.2,
                color: mutedText,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.poppins(
                  fontSize: 11.8,
                  color: darkText,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE8EAF2)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x100F172A),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Información de tu negocio',
            style: GoogleFonts.poppins(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: darkText,
            ),
          ),
          const SizedBox(height: 8),
          infoLine(
            label: 'Nombre',
            value: comercio.nombre,
            icon: Icons.storefront_rounded,
          ),
          infoLine(
            label: 'WhatsApp',
            value: whatsappLabel,
            icon: Icons.phone_in_talk_outlined,
          ),
          infoLine(
            label: 'Slug',
            value: slugLabel,
            icon: Icons.alternate_email_rounded,
          ),
          infoLine(
            label: 'Créditos IA',
            value:
                '${aiCreditsBalance.toStringAsFixed(aiCreditsBalance % 1 == 0 ? 0 : 2)} disponibles · ${aiCreditsUsed.toStringAsFixed(aiCreditsUsed % 1 == 0 ? 0 : 2)} usados',
            icon: Icons.auto_awesome_rounded,
          ),
          const SizedBox(height: 2),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFF6F2FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(
                  businessOnline
                      ? Icons.wifi_tethering_rounded
                      : Icons.wifi_tethering_off_rounded,
                  size: 16,
                  color: businessOnline
                      ? const Color(0xFF16A34A)
                      : const Color(0xFFEF4444),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    businessOnline ? 'Negocio en línea' : 'Negocio pausado',
                    style: GoogleFonts.poppins(
                      fontSize: 11.6,
                      fontWeight: FontWeight.w600,
                      color: darkText,
                    ),
                  ),
                ),
                if (isUpdatingBusinessOnline)
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Transform.scale(
                    scale: 0.82,
                    child: Switch.adaptive(
                      value: businessOnline,
                      onChanged: onToggleOnline,
                      activeThumbColor: purple,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CompactRecentOrderTile extends StatelessWidget {
  const _CompactRecentOrderTile({
    required this.pedido,
    required this.onTap,
    required this.darkText,
    required this.mutedText,
  });

  final PedidoModel pedido;
  final VoidCallback onTap;
  final Color darkText;
  final Color mutedText;

  String get _shortOrderId {
    final value = (pedido.orderId ?? pedido.id).trim();
    if (value.length <= 10) {
      return value;
    }
    return '${value.substring(0, 10)}…';
  }

  String get _hourLabel {
    final created = pedido.createdAt;
    if (created == null) {
      return '--:--';
    }
    final local = created.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final status = pedido.statusBucket;

    return SizedBox(
      height: 72,
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE8EAF2)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0D0F172A),
                  blurRadius: 8,
                  offset: Offset(0, 3),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: status.color.withValues(alpha: 0.14),
                  ),
                  child: Icon(status.icon, size: 17, color: status.color),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _shortOrderId,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: darkText,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$_hourLabel · ${status.label}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: mutedText,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  pedido.total != null
                      ? '\$${pedido.total!.toStringAsFixed(2)}'
                      : '--',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: darkText,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(Icons.chevron_right_rounded, color: mutedText, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

enum _DashboardAction {
  refresh,
  magicMenu,
  manageMenu,
  showQr,
  shareMenu,
  copyLink,
  openWeb,
}

enum _SalesRange {
  today,
  yesterday,
  lastWeek,
  lastFortnight,
  thisMonth,
  lastMonth,
  last3Months,
  last6Months,
  lastYear,
  allTime,
  custom,
}

extension _SalesRangeUi on _SalesRange {
  String get label {
    switch (this) {
      case _SalesRange.today:
        return 'Hoy';
      case _SalesRange.yesterday:
        return 'Ayer';
      case _SalesRange.lastWeek:
        return 'Última semana';
      case _SalesRange.lastFortnight:
        return 'Última quincena';
      case _SalesRange.thisMonth:
        return 'Este mes';
      case _SalesRange.lastMonth:
        return 'Último mes';
      case _SalesRange.last3Months:
        return 'Últimos 3 meses';
      case _SalesRange.last6Months:
        return 'Últimos 6 meses';
      case _SalesRange.lastYear:
        return 'Último año';
      case _SalesRange.allTime:
        return 'Desde el principio';
      case _SalesRange.custom:
        return 'Personalizado';
    }
  }

  String get ordersLabel {
    switch (this) {
      case _SalesRange.today:
        return 'Pedidos hoy';
      case _SalesRange.yesterday:
        return 'Pedidos ayer';
      case _SalesRange.lastWeek:
        return 'Pedidos semana';
      case _SalesRange.lastFortnight:
        return 'Pedidos quincena';
      case _SalesRange.thisMonth:
        return 'Pedidos este mes';
      case _SalesRange.lastMonth:
        return 'Pedidos mes';
      case _SalesRange.last3Months:
        return 'Pedidos 3 meses';
      case _SalesRange.last6Months:
        return 'Pedidos 6 meses';
      case _SalesRange.lastYear:
        return 'Pedidos año';
      case _SalesRange.allTime:
        return 'Pedidos total';
      case _SalesRange.custom:
        return 'Pedidos rango';
    }
  }

  String get incomeLabel {
    switch (this) {
      case _SalesRange.today:
        return 'Ingresos hoy';
      case _SalesRange.yesterday:
        return 'Ingresos ayer';
      case _SalesRange.lastWeek:
        return 'Ingresos semana';
      case _SalesRange.lastFortnight:
        return 'Ingresos quincena';
      case _SalesRange.thisMonth:
        return 'Ingresos este mes';
      case _SalesRange.lastMonth:
        return 'Ingresos mes';
      case _SalesRange.last3Months:
        return 'Ingresos 3 meses';
      case _SalesRange.last6Months:
        return 'Ingresos 6 meses';
      case _SalesRange.lastYear:
        return 'Ingresos año';
      case _SalesRange.allTime:
        return 'Ingresos total';
      case _SalesRange.custom:
        return 'Ingresos rango';
    }
  }
}

class _SalesRangeWindow {
  const _SalesRangeWindow({
    required this.startInclusive,
    required this.endExclusive,
  });

  final DateTime startInclusive;
  final DateTime endExclusive;
}

class _SalesHistorySeries {
  const _SalesHistorySeries({
    required this.values,
    required this.labels,
    required this.tooltipLabels,
  });

  final List<double> values;
  final List<String> labels;
  final List<String> tooltipLabels;
}

class _DashboardSnapshot {
  const _DashboardSnapshot({
    required this.comercio,
    required this.categoryCount,
    required this.productCount,
    this.aiCreditsBalance = 0,
    this.aiCreditsUsed = 0,
    double? lastDayRevenue,
    this.yesterdayTotalOrders = 0,
    this.yesterdayCompletedOrders = 0,
    this.yesterdayPendingOrders = 0,
    this.yesterdayCanceledOrders = 0,
  }) : _lastDayRevenue = lastDayRevenue;

  final ComercioModel comercio;
  final int categoryCount;
  final int productCount;
  final double aiCreditsBalance;
  final double aiCreditsUsed;
  final double? _lastDayRevenue;
  final int yesterdayTotalOrders;
  final int yesterdayCompletedOrders;
  final int yesterdayPendingOrders;
  final int yesterdayCanceledOrders;

  double get lastDayRevenue => _lastDayRevenue ?? 0;
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final textColor = color.computeLuminance() > 0.6
        ? const Color(0xFF1F2937)
        : color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({
    required this.title,
    this.actionLabel,
    this.onActionTap,
  });

  final String title;
  final String? actionLabel;
  final VoidCallback? onActionTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        if (actionLabel != null && onActionTap != null)
          TextButton(onPressed: onActionTap, child: Text(actionLabel!)),
      ],
    );
  }
}

class _MalformedOrderTile extends StatelessWidget {
  const _MalformedOrderTile({required this.pedido});

  final PedidoModel pedido;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = pedido.orderId?.trim().isNotEmpty == true
        ? 'Pedido ${pedido.orderId}'
        : 'Pedido con error de parseo';
    final details = pedido.parseErrorMessage?.trim().isNotEmpty == true
        ? pedido.parseErrorMessage!.trim()
        : 'El registro llegó mal formado desde Supabase y fue aislado.';

    return Card(
      color: const Color(0xFFFFF1F2),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFFDA4AF)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: const Color(0xFFE11D48).withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFE11D48),
          ),
        ),
        title: Text(
          title,
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w700,
            color: const Color(0xFF9F1239),
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            details,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        trailing: const _StatusPill(label: 'Error', color: Color(0xFFE11D48)),
      ),
    );
  }
}

class _EmptyStateCard extends StatelessWidget {
  const _EmptyStateCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Icon(icon, size: 30),
            const SizedBox(height: 8),
            Text(
              title,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            if (onAction != null && (actionLabel ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              FilledButton.tonalIcon(
                onPressed: onAction,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CatalogUpdateBanner extends StatelessWidget {
  const _CatalogUpdateBanner({required this.result});

  final MagicOnboardingResult result;

  @override
  Widget build(BuildContext context) {
    final accent = result.isNewCatalog
        ? const Color(0xFF8B5CF6)
        : const Color(0xFF22C55E);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: accent.withValues(alpha: 0.14),
        border: Border.all(color: accent.withValues(alpha: 0.32)),
      ),
      child: Row(
        children: [
          Icon(
            result.isNewCatalog ? Icons.fiber_new_rounded : Icons.bolt_rounded,
            color: accent,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              result.isNewCatalog
                  ? 'Nuevo catálogo: ${result.catalog.nombre}'
                  : 'Catálogo actualizado: ${result.catalog.nombre}',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuActionRow extends StatelessWidget {
  const _MenuActionRow({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [Icon(icon, size: 18), const SizedBox(width: 10), Text(label)],
    );
  }
}
