import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';

import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/screens/category_screen.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  late Future<_DashboardData> _dashboardFuture;
  late Stream<List<PedidoModel>> _recentOrdersStream;
  StreamSubscription<List<PedidoModel>>? _recentOrdersSubscription;
  final ScrollController _dashboardScrollController = ScrollController();
  final PageController _newsPageController = PageController();
  final TextEditingController _ordersSearchController = TextEditingController();

  _OrderFilter _orderFilter = _OrderFilter.all;
  int _visibleOrdersCount = 10;
  int _activeNewsIndex = 0;

  bool _isUpdatingBusiness = false;
  bool _supportsBusinessOnlineColumn = true;
  bool _businessOnline = true;
  bool _didInitBusinessOnline = false;
  MagicOnboardingResult? _highlightedCatalogResult;

  Set<String> _seenOrderIds = <String>{};
  bool _didPrimeOrderAlert = false;
  Timer? _newsAutoPlayTimer;
  Timer? _catalogHighlightTimer;
  String _ordersSearchQuery = '';

  final List<_NewsItem> _newsItems = const [
    _NewsItem(
      title: 'Nuevos pedidos en tiempo real',
      description: 'Activa notificaciones para responder mas rapido y vender mas.',
      icon: Icons.notifications_active_rounded,
      accent: Color(0xFFFFB04A),
    ),
    _NewsItem(
      title: 'Comparte tu menu digital',
      description: 'Envialo por WhatsApp y redes para captar nuevos clientes.',
      icon: Icons.share_rounded,
      accent: Color(0xFF5AD8A6),
    ),
    _NewsItem(
      title: 'Actualiza tus categorias',
      description: 'Un menu ordenado aumenta conversion y reduce dudas del cliente.',
      icon: Icons.auto_awesome_rounded,
      accent: Color(0xFF8BB3FF),
    ),
  ];

  bool get _hasWebUrlConfigured => AppLinks.productionUrl.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    _dashboardFuture = _fetchDashboardData();
    _recentOrdersStream = _buildRecentOrdersStream();
    _subscribeToRecentOrders();
    _dashboardScrollController.addListener(_onDashboardScroll);
    _startNewsAutoplay();
  }

  @override
  void dispose() {
    _recentOrdersSubscription?.cancel();
    _dashboardScrollController.dispose();
    _newsPageController.dispose();
    _ordersSearchController.dispose();
    _newsAutoPlayTimer?.cancel();
    _catalogHighlightTimer?.cancel();
    super.dispose();
  }

  Future<void> _openMagicOnboarding() async {
    final result = await Navigator.of(context).push<MagicOnboardingResult>(
      MaterialPageRoute(builder: (_) => const MagicOnboardingScreen()),
    );

    if (result != null && mounted) {
      _catalogHighlightTimer?.cancel();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Catálogo "${result.catalog.nombre}" listo con ${result.createdCategories} categorías y ${result.createdProducts} productos.',
          ),
        ),
      );
      setState(() {
        _highlightedCatalogResult = result;
        _dashboardFuture = _fetchDashboardData();
        _recentOrdersStream = _buildRecentOrdersStream();
      });
      _catalogHighlightTimer = Timer(const Duration(seconds: 8), () {
        if (!mounted) return;
        setState(() => _highlightedCatalogResult = null);
      });
      _subscribeToRecentOrders();
    }
  }

  Widget _buildNewCatalogHighlight() {
    final result = _highlightedCatalogResult;
    if (result == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0xFF2C1B11), Color(0xFF17110D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: result.isNewCatalog
              ? const Color(0x66FFB04A)
              : const Color(0x445AD8A6),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: result.isNewCatalog
                  ? const Color(0x1AFFB04A)
                  : const Color(0x1A5AD8A6),
            ),
            child: Icon(
              result.isNewCatalog ? Icons.fiber_new_rounded : Icons.flash_on_rounded,
              color: result.isNewCatalog
                  ? const Color(0xFFFFB04A)
                  : const Color(0xFF5AD8A6),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  result.isNewCatalog ? 'Nuevo catálogo creado' : 'Catálogo actualizado',
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFFFE2BF),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  result.catalog.nombre,
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${result.createdCategories} categorías · ${result.createdProducts} productos',
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFE4CCAC),
                    fontSize: 12.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _refreshDashboard() async {
    if (!mounted) return;
    setState(() {
      _dashboardFuture = _fetchDashboardData();
      _recentOrdersStream = _buildRecentOrdersStream();
      _visibleOrdersCount = 10;
    });
    _subscribeToRecentOrders();
  }

  void _onDashboardScroll() {
    if (!_dashboardScrollController.hasClients) return;
    final position = _dashboardScrollController.position;
    if (position.pixels >= position.maxScrollExtent - 220) {
      if (!mounted) return;
      setState(() {
        _visibleOrdersCount += 10;
      });
    }
  }

  void _startNewsAutoplay() {
    _newsAutoPlayTimer?.cancel();
    _newsAutoPlayTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_newsPageController.hasClients || _newsItems.isEmpty) {
        return;
      }
      final next = (_activeNewsIndex + 1) % _newsItems.length;
      _newsPageController.animateToPage(
        next,
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeInOut,
      );
    });
  }

  Future<void> _openNotificationsSheet() async {
    final rows = await Supabase.instance.client
        .from('pedidos')
        .select('id, order_id, estado, created_at')
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .order('created_at', ascending: false)
        .limit(12);

    if (!mounted) return;

    final items = (rows as List<dynamic>)
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList();

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF17120E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    const Icon(Icons.notifications_active, color: Color(0xFFFFB04A)),
                    const SizedBox(width: 8),
                    Text(
                      'Notificaciones',
                      style: GoogleFonts.poppins(
                        color: const Color(0xFFFFE2BF),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (items.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Text(
                      'No hay novedades recientes.',
                      style: TextStyle(color: Colors.white70),
                    ),
                  )
                else
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: items.length,
                      separatorBuilder: (_, index) => const Divider(
                        color: Color(0x33FFFFFF),
                        height: 1,
                      ),
                      itemBuilder: (context, index) {
                        final item = items[index];
                        final rawStatus =
                            (item['estado']?.toString() ?? '').toLowerCase();
                        final done = rawStatus.contains('complet');
                        final label = done ? 'Completado' : 'Pendiente';
                        final color =
                            done ? const Color(0xFF1AB15E) : const Color(0xFFFFB04A);
                        final orderText = item['order_id']?.toString() ??
                            item['id']?.toString() ??
                            'Pedido';

                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(
                            done
                                ? Icons.check_circle_rounded
                                : Icons.timelapse_rounded,
                            color: color,
                          ),
                          title: Text(
                            orderText,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white),
                          ),
                          subtitle: Text(
                            label,
                            style: TextStyle(color: color),
                          ),
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
    final nameController = TextEditingController(text: comercio.nombre);
    final whatsappController = TextEditingController(text: comercio.whatsapp ?? '');

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1A140E),
        title: const Text('Editar negocio'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(labelText: 'Nombre del negocio'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: whatsappController,
              keyboardType: TextInputType.phone,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(labelText: 'WhatsApp'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );

    if (confirmed != true) {
      nameController.dispose();
      whatsappController.dispose();
      return;
    }

    try {
      await Supabase.instance.client
          .from('comercios')
          .update({
            'nombre': nameController.text.trim(),
            'whatsapp': whatsappController.text.trim(),
          })
          .eq('id', SupabaseConfig.currentComercioId);

      await _refreshDashboard();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo guardar la configuracion: $error')),
      );
    } finally {
      nameController.dispose();
      whatsappController.dispose();
    }
  }

  Future<void> _updateBusinessOnline(bool value) async {
    if (_isUpdatingBusiness) return;

    final previous = _businessOnline;
    setState(() {
      _businessOnline = value;
      _isUpdatingBusiness = true;
    });

    try {
      if (_supportsBusinessOnlineColumn) {
        await Supabase.instance.client
            .from('comercios')
            .update({'en_linea': value})
            .eq('id', SupabaseConfig.currentComercioId);
      }
    } on PostgrestException catch (error) {
      final code = (error.code ?? '').toUpperCase();
      final message = error.message.toLowerCase();

      if (code == 'PGRST204' || message.contains('en_linea')) {
        _supportsBusinessOnlineColumn = false;
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'La columna en_linea no existe en comercios. Crea la columna para guardar este estado.',
            ),
          ),
        );
      } else {
        rethrow;
      }

      setState(() => _businessOnline = previous);
    } catch (error) {
      if (!mounted) return;
      setState(() => _businessOnline = previous);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo actualizar estado en linea: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isUpdatingBusiness = false);
      }
    }
  }

  void _subscribeToRecentOrders() {
    _recentOrdersSubscription?.cancel();
    _seenOrderIds = <String>{};
    _didPrimeOrderAlert = false;

    _recentOrdersSubscription = _recentOrdersStream.listen((orders) {
      final currentIds = orders.map((order) => order.id).toSet();

      if (!_didPrimeOrderAlert) {
        _seenOrderIds = currentIds;
        _didPrimeOrderAlert = true;
        return;
      }

      final newOrders = orders
          .where((order) => !_seenOrderIds.contains(order.id))
          .toList();

      _seenOrderIds = currentIds;

      if (newOrders.isEmpty || !mounted) return;

      SystemSound.play(SystemSoundType.alert);
      final latestOrder = newOrders.first;
      final orderLabel = latestOrder.orderId ?? latestOrder.id;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Nuevo pedido recibido: $orderLabel'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    });
  }

  Future<void> _openOrderDetail(PedidoModel pedido) async {
    final orderId = pedido.orderId;
    if (orderId == null || orderId.trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Este pedido no tiene ORDER_ID disponible.')),
      );
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OrderDetailScreen(orderId: orderId),
      ),
    );

    if (!mounted) return;
    setState(() {
      _dashboardFuture = _fetchDashboardData();
      _recentOrdersStream = _buildRecentOrdersStream();
    });
    _subscribeToRecentOrders();
  }

  Future<void> _openPublicMenu() async {
    if (!SupabaseConfig.hasCurrentComercioId) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay comercio configurado para abrir el menú.'),
        ),
      );
      return;
    }

    final url = AppLinks.publicMenuByComercio(SupabaseConfig.currentComercioId);
    debugPrint('Abriendo Menú Público: $url');

    final uri = Uri.parse(url);
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);

    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('No se pudo abrir el menú público: $url')),
      );
    }
  }

  Future<void> _copyPublicMenuUrl() async {
    if (!SupabaseConfig.hasCurrentComercioId) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay comercio configurado para copiar la URL.'),
        ),
      );
      return;
    }

    final url = AppLinks.publicMenuByComercio(SupabaseConfig.currentComercioId);
    debugPrint('Copiando Menú Público: $url');

    await Clipboard.setData(ClipboardData(text: url));

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('URL del menú copiada al portapapeles.')),
    );
  }

  Future<void> _sharePublicMenu() async {
    if (!SupabaseConfig.hasCurrentComercioId) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay comercio configurado para compartir el menú.'),
        ),
      );
      return;
    }

    final url = AppLinks.publicMenuByComercio(SupabaseConfig.currentComercioId);
    await SharePlus.instance.share(
      ShareParams(
        text: 'Mira nuestro menú digital: $url',
        subject: 'Menú digital Kosmenu',
      ),
    );
  }

  void _showQRCode(BuildContext context) {
    if (!SupabaseConfig.hasCurrentComercioId) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No hay comercio configurado para generar el QR.'),
        ),
      );
      return;
    }

    final finalUrl = AppLinks.publicMenuByComercio(
      SupabaseConfig.currentComercioId,
    );
    debugPrint('URL GENERADA: $finalUrl');

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Tu Menú Digital'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Escanea para ver el menú:'),
            const SizedBox(height: 20),
            QrImageView(data: finalUrl, version: QrVersions.auto, size: 200.0),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }

  Stream<List<PedidoModel>> _buildRecentOrdersStream() {
    return Supabase.instance.client
        .from('pedidos')
        .stream(primaryKey: ['id'])
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .order('created_at', ascending: false)
        .limit(200)
        .map(
          (rows) => rows
              .map((row) => PedidoModel.fromMap(Map<String, dynamic>.from(row)))
              .toList(),
        );
  }

  _OrderStatus _getOrderStatus(PedidoModel pedido) {
    final raw = (pedido.estado ?? '').trim().toLowerCase();
    if (raw.contains('complet')) {
      return _OrderStatus.completed;
    }
    return _OrderStatus.pending;
  }

  bool _matchesOrderFilter(PedidoModel pedido) {
    if (_orderFilter == _OrderFilter.all) {
      return true;
    }
    final status = _getOrderStatus(pedido);
    return (_orderFilter == _OrderFilter.pending &&
            status == _OrderStatus.pending) ||
        (_orderFilter == _OrderFilter.completed &&
            status == _OrderStatus.completed);
  }

  bool _matchesOrderSearch(PedidoModel pedido) {
    final query = _ordersSearchQuery.trim().toLowerCase();
    if (query.isEmpty) return true;

    final fields = <String>[
      pedido.id,
      pedido.orderId ?? '',
      pedido.estado ?? '',
      pedido.metodoPago ?? '',
      pedido.clienteEmail ?? '',
      pedido.total != null ? pedido.total!.toStringAsFixed(2) : '',
      pedido.createdAt?.toIso8601String() ?? '',
    ];

    return fields.any((field) => field.toLowerCase().contains(query));
  }

  String _orderFilterLabel(_OrderFilter filter) {
    switch (filter) {
      case _OrderFilter.all:
        return 'Todos';
      case _OrderFilter.pending:
        return 'Pendientes';
      case _OrderFilter.completed:
        return 'Completados';
    }
  }

  IconData _orderFilterIcon(_OrderFilter filter) {
    switch (filter) {
      case _OrderFilter.all:
        return Icons.receipt_long_rounded;
      case _OrderFilter.pending:
        return Icons.timelapse_rounded;
      case _OrderFilter.completed:
        return Icons.check_circle_rounded;
    }
  }

  Future<void> _onNavbarMenuSelected(_NavbarMenuAction action) async {
    switch (action) {
      case _NavbarMenuAction.share:
        await _sharePublicMenu();
        break;
      case _NavbarMenuAction.openWeb:
        await _openPublicMenu();
        break;
      case _NavbarMenuAction.copyLink:
        await _copyPublicMenuUrl();
        break;
      case _NavbarMenuAction.magicMenu:
        await _openMagicOnboarding();
        break;
      case _NavbarMenuAction.qr:
        _showQRCode(context);
        break;
      case _NavbarMenuAction.refresh:
        await _refreshDashboard();
        break;
    }
  }

  Future<_DashboardData> _fetchDashboardData() async {
    if (!SupabaseConfig.hasCurrentComercioId) {
      throw StateError(
        'Configura SupabaseConfig.currentComercioId para cargar datos privados del local.',
      );
    }

    final client = Supabase.instance.client;
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
    final results = await Future.wait<dynamic>([
      comercioFuture,
      categoriasFuture,
      productosFuture,
    ]);

    return _DashboardData(
      comercio: ComercioModel.fromMap(
        Map<String, dynamic>.from(
          (results[0] as Map?) ?? const <String, dynamic>{},
        ),
      ),
      categoryCount: (results[1] as List<dynamic>).length,
      productCount: (results[2] as List<dynamic>).length,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final safeBottomInset = MediaQuery.of(context).viewPadding.bottom;
    final listBottomPadding = safeBottomInset + 96;

    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Panel de Control'),
        actions: [
          IconButton(
            tooltip: 'Notificaciones',
            icon: const Icon(Icons.notifications_none_rounded),
            onPressed: _openNotificationsSheet,
          ),
          PopupMenuButton<_NavbarMenuAction>(
            tooltip: 'Más acciones',
            icon: const Icon(Icons.more_vert_rounded),
            color: const Color(0xFF1B140F),
            onSelected: (value) {
              _onNavbarMenuSelected(value);
            },
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: _NavbarMenuAction.share,
                child: _NavbarMenuItemRow(
                  icon: Icons.share_outlined,
                  label: 'Compartir menú',
                ),
              ),
              PopupMenuItem(
                value: _NavbarMenuAction.openWeb,
                child: _NavbarMenuItemRow(
                  icon: Icons.open_in_browser,
                  label: 'Abrir web',
                ),
              ),
              PopupMenuItem(
                value: _NavbarMenuAction.copyLink,
                child: _NavbarMenuItemRow(
                  icon: Icons.copy_all_outlined,
                  label: 'Copiar enlace',
                ),
              ),
              PopupMenuDivider(),
              PopupMenuItem(
                value: _NavbarMenuAction.magicMenu,
                child: _NavbarMenuItemRow(
                  icon: Icons.camera_alt,
                  label: 'Magic menú',
                ),
              ),
              PopupMenuItem(
                value: _NavbarMenuAction.qr,
                child: _NavbarMenuItemRow(
                  icon: Icons.qr_code,
                  label: 'Ver QR',
                ),
              ),
              PopupMenuItem(
                value: _NavbarMenuAction.refresh,
                child: _NavbarMenuItemRow(
                  icon: Icons.refresh_rounded,
                  label: 'Refrescar panel',
                ),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFFF6B00),
        onPressed: _openMagicOnboarding,
        child: const Icon(Icons.camera_alt),
      ),
      body: SafeArea(
        bottom: true,
        child: FutureBuilder<_DashboardData>(
          future: _dashboardFuture,
          builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(
                      colorScheme.secondary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Cargando estadísticas...',
                    style: GoogleFonts.poppins(color: Colors.white70),
                  ),
                ],
              ),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Error cargando dashboard: ${snapshot.error}',
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            );
          }

          final data = snapshot.data;
          if (data == null) {
            return const Center(
              child: Text(
                'No se pudo cargar el dashboard',
                style: TextStyle(color: Colors.white),
              ),
            );
          }

          final webBadgeText = _hasWebUrlConfigured ? 'En Línea' : 'Sin URL';
          final webBadgeColor = _hasWebUrlConfigured
              ? const Color(0xFF1AB15E)
              : const Color(0xFFE67E22);

          if (!_didInitBusinessOnline) {
            _businessOnline = data.comercio.enLinea;
            _didInitBusinessOnline = true;
          }

          return RefreshIndicator(
            onRefresh: _refreshDashboard,
            color: const Color(0xFFFFB04A),
            child: ListView(
              controller: _dashboardScrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(16, 16, 16, listBottomPadding),
              children: [
              _buildNewCatalogHighlight(),
              _StaggeredReveal(
                order: 1,
                child: GridView.count(
                  crossAxisCount: 3,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    Hero(
                      tag: 'hero-stat-productos',
                      child: _StatCard(
                        title: 'Productos',
                        value: '${data.productCount}',
                        icon: Icons.restaurant_menu,
                      ),
                    ),
                    _StatCard(
                      title: 'Categorías',
                      value: '${data.categoryCount}',
                      icon: Icons.grid_view_rounded,
                    ),
                    _StatCard(
                      title: 'Estado Web',
                      value: webBadgeText,
                      icon: Icons.public,
                      valueColor: webBadgeColor,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _StaggeredReveal(
                order: 2,
                child: Card(
                elevation: 3,
                color: const Color(0x0017120E),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF2A1C12), Color(0xFF15100C)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    border: Border.all(color: const Color(0x55B07432)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x33000000),
                        blurRadius: 16,
                        offset: Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0x22FFB04A),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: const Color(0x44FFB04A)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.space_dashboard_rounded,
                                size: 16,
                                color: Color(0xFFFFC977),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Panel principal',
                                style: GoogleFonts.poppins(
                                  color: const Color(0xFFFFD49A),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          data.comercio.nombre,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            height: 1.1,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Gestiona tu menú y tus pedidos desde un solo lugar.',
                          style: GoogleFonts.poppins(
                            color: const Color(0xFFE7CCAA),
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 16),
                        LayoutBuilder(
                          builder: (context, constraints) {
                            final compact = constraints.maxWidth < 450;

                            final manageButton = FilledButton.icon(
                              style: FilledButton.styleFrom(
                                backgroundColor: const Color(0xFFFF6B00),
                                foregroundColor: Colors.white,
                                minimumSize: const Size.fromHeight(52),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 18,
                                  vertical: 14,
                                ),
                                textStyle: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 15,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                              onPressed: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => const CategoryListScreen(),
                                  ),
                                );
                              },
                              icon: const Icon(Icons.inventory_2_outlined),
                              label: const Text(
                                'Administrar Menú',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            );

                            final qrButton = OutlinedButton.icon(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFFFFC977),
                                side: const BorderSide(
                                  color: Color(0xFF7E5930),
                                ),
                                minimumSize: const Size.fromHeight(48),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                                textStyle: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                              onPressed: () => _showQRCode(context),
                              icon: const Icon(Icons.qr_code_2),
                              label: const Text(
                                'Generar QR menú',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            );

                            if (compact) {
                              return Column(
                                children: [
                                  SizedBox(
                                    width: double.infinity,
                                    child: manageButton,
                                  ),
                                  const SizedBox(height: 10),
                                  Hero(
                                    tag: 'hero-generate-qr-action',
                                    child: SizedBox(
                                      width: double.infinity,
                                      child: qrButton,
                                    ),
                                  ),
                                ],
                              );
                            }

                            return Row(
                              children: [
                                Expanded(child: manageButton),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Hero(
                                    tag: 'hero-generate-qr-action',
                                    child: qrButton,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              )),
              const SizedBox(height: 14),
              _StaggeredReveal(
                order: 3,
                child: Card(
                color: const Color(0xFF17120E),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Atajos y noticias',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFE2BF),
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        height: 140,
                        child: PageView.builder(
                          controller: _newsPageController,
                          itemCount: _newsItems.length,
                          onPageChanged: (index) {
                            if (!mounted) return;
                            setState(() => _activeNewsIndex = index);
                          },
                          itemBuilder: (context, index) {
                            final item = _newsItems[index];
                            return Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: _NewsCard(item: item),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: List.generate(_newsItems.length, (index) {
                          final active = index == _activeNewsIndex;
                          return AnimatedContainer(
                            duration: const Duration(milliseconds: 220),
                            width: active ? 18 : 8,
                            height: 8,
                            margin: const EdgeInsets.only(right: 6),
                            decoration: BoxDecoration(
                              color: active
                                  ? const Color(0xFFFFB04A)
                                  : const Color(0x44FFFFFF),
                              borderRadius: BorderRadius.circular(999),
                            ),
                          );
                        }),
                      ),
                    ],
                  ),
                ),
              )),
              const SizedBox(height: 14),
              _StaggeredReveal(
                order: 4,
                child: Card(
                color: const Color(0xFF17120E),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Configuracion del negocio',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFE2BF),
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(
                          Icons.store_mall_directory_rounded,
                          color: Color(0xFFFFB04A),
                        ),
                        title: Text(
                          data.comercio.nombre,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white),
                        ),
                        subtitle: Text(
                          data.comercio.whatsapp?.trim().isNotEmpty == true
                              ? 'WhatsApp: ${data.comercio.whatsapp}'
                              : 'Sin WhatsApp configurado',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white70),
                        ),
                        trailing: TextButton.icon(
                          onPressed: () => _editBusinessInfo(data.comercio),
                          icon: const Icon(Icons.edit_outlined, size: 16),
                          label: const Text('Editar'),
                        ),
                      ),
                      const Divider(color: Color(0x33FFFFFF)),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text(
                          'Negocio en linea',
                          style: TextStyle(color: Colors.white),
                        ),
                        subtitle: Text(
                          _businessOnline
                              ? 'Los clientes pueden realizar pedidos.'
                              : 'Tu menu sigue visible, pero fuera de servicio.',
                          style: const TextStyle(color: Colors.white70),
                        ),
                        value: _businessOnline,
                        onChanged: _isUpdatingBusiness
                            ? null
                            : (value) => _updateBusinessOnline(value),
                      ),
                    ],
                  ),
                ),
              )),
              const SizedBox(height: 16),
              _StaggeredReveal(
                order: 5,
                child: Text(
                  'Pedidos',
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFFFE2BF),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              _ElegantSearchBar(
                controller: _ordersSearchController,
                hintText: 'Buscar pedidos por ID, correo, estado o metodo...',
                onChanged: (value) {
                  if (!mounted) return;
                  setState(() {
                    _ordersSearchQuery = value;
                    _visibleOrdersCount = 10;
                  });
                },
                onClear: () {
                  _ordersSearchController.clear();
                  if (!mounted) return;
                  setState(() {
                    _ordersSearchQuery = '';
                    _visibleOrdersCount = 10;
                  });
                },
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _OrderFilter.values.map((filter) {
                    final selected = _orderFilter == filter;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        selected: selected,
                        onSelected: (_) {
                          if (!mounted) return;
                          setState(() {
                            _orderFilter = filter;
                            _visibleOrdersCount = 10;
                          });
                        },
                        label: Text(_orderFilterLabel(filter)),
                        avatar: Icon(
                          _orderFilterIcon(filter),
                          size: 16,
                          color: selected
                              ? const Color(0xFF1A1209)
                              : const Color(0xFFFFD49A),
                        ),
                        labelStyle: GoogleFonts.poppins(
                          color: selected
                              ? const Color(0xFF1A1209)
                              : const Color(0xFFFFD49A),
                          fontWeight: FontWeight.w600,
                        ),
                        selectedColor: const Color(0xFFFFB04A),
                        backgroundColor: const Color(0xFF2A1C12),
                        side: BorderSide(
                          color: selected
                              ? const Color(0xFFFFB04A)
                              : const Color(0xFF5A4028),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                        showCheckmark: false,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 10),
              StreamBuilder<List<PedidoModel>>(
                stream: _recentOrdersStream,
                builder: (context, ordersSnapshot) {
                  if (ordersSnapshot.connectionState ==
                          ConnectionState.waiting &&
                      !ordersSnapshot.hasData) {
                    return const Card(
                      color: Color(0xFF17120E),
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                    );
                  }

                  if (ordersSnapshot.hasError) {
                    return Card(
                      color: const Color(0xFF17120E),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Error cargando pedidos: ${ordersSnapshot.error}',
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    );
                  }

                  final orders = ordersSnapshot.data ?? const <PedidoModel>[];
                  final filteredOrders = orders
                      .where(_matchesOrderFilter)
                      .where(_matchesOrderSearch)
                      .toList();
                  final visibleCount = _visibleOrdersCount < filteredOrders.length
                      ? _visibleOrdersCount
                      : filteredOrders.length;
                  final visibleOrders = filteredOrders.take(visibleCount).toList();

                  if (filteredOrders.isEmpty) {
                    return const Card(
                      color: Color(0xFF17120E),
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text(
                          'No hay pedidos para este filtro',
                          style: TextStyle(color: Colors.white),
                        ),
                      ),
                    );
                  }

                  return Column(
                    children: [
                      ...visibleOrders
                        .map(
                          (pedido) {
                            final status = _getOrderStatus(pedido);
                            final statusColor = status == _OrderStatus.completed
                                ? const Color(0xFF1AB15E)
                                : const Color(0xFFFFB04A);
                            final statusIcon = status == _OrderStatus.completed
                                ? Icons.check_circle_rounded
                                : Icons.timelapse_rounded;
                            final statusLabel = status == _OrderStatus.completed
                                ? 'Completado'
                                : 'Pendiente';

                            return Card(
                              color: const Color(0xFF17120E),
                              child: ListTile(
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 6,
                                ),
                                onTap: pedido.orderId != null
                                    ? () => _openOrderDetail(pedido)
                                    : null,
                                leading: Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: statusColor.withValues(alpha: 0.16),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Icon(statusIcon, color: statusColor),
                                ),
                                title: Text(
                                  'Pedido ${(pedido.orderId ?? pedido.id).substring(0, (pedido.orderId ?? pedido.id).length < 16 ? (pedido.orderId ?? pedido.id).length : 16)}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: Colors.white),
                                ),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const SizedBox(height: 3),
                                    Text(
                                      pedido.clienteEmail != null &&
                                              pedido.clienteEmail!
                                                  .trim()
                                                  .isNotEmpty
                                          ? '${pedido.clienteEmail} • ${pedido.metodoPago ?? 'Método sin definir'}'
                                          : (pedido.createdAt != null
                                                ? 'Fecha: ${pedido.createdAt}'
                                                : 'Fecha no disponible'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        color: Colors.white70,
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: statusColor.withValues(alpha: 0.16),
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            statusIcon,
                                            size: 14,
                                            color: statusColor,
                                          ),
                                          const SizedBox(width: 4),
                                          Text(
                                            statusLabel,
                                            style: TextStyle(
                                              color: statusColor,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                trailing: ConstrainedBox(
                                  constraints: const BoxConstraints(
                                    minWidth: 68,
                                  ),
                                  child: Text(
                                    pedido.total != null
                                        ? '\$${pedido.total!.toStringAsFixed(2)}'
                                        : statusLabel,
                                    textAlign: TextAlign.end,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Color(0xFFFF6B00),
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      if (visibleCount < filteredOrders.length)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12),
                          child: Center(
                            child: Text(
                              'Desliza para cargar mas pedidos...',
                              style: TextStyle(color: Colors.white70),
                            ),
                          ),
                        ),
                    ],
                  );
                },
              ),
            ],
          ));
          },
        ),
      ),
    );
  }
}

enum _OrderFilter { all, pending, completed }

enum _OrderStatus { pending, completed }

enum _NavbarMenuAction { share, openWeb, copyLink, magicMenu, qr, refresh }

class _StaggeredReveal extends StatelessWidget {
  const _StaggeredReveal({
    required this.order,
    required this.child,
  });

  final int order;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final duration = Duration(milliseconds: 280 + (order * 80));
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duration,
      curve: Curves.easeOutCubic,
      builder: (context, value, child) {
        return Opacity(
          opacity: value,
          child: Transform.translate(
            offset: Offset(0, (1 - value) * 18),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}

class _NewsItem {
  final String title;
  final String description;
  final IconData icon;
  final Color accent;

  const _NewsItem({
    required this.title,
    required this.description,
    required this.icon,
    required this.accent,
  });
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.item});

  final _NewsItem item;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: const LinearGradient(
          colors: [Color(0xFF2B1C11), Color(0xFF1A140E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: item.accent.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(item.icon, color: item.accent),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.poppins(
                    color: const Color(0xFFFFE2BF),
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            item.description,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              color: const Color(0xFFD5B995),
              fontSize: 12.5,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _DashboardData {
  final ComercioModel comercio;
  final int categoryCount;
  final int productCount;

  const _DashboardData({
    required this.comercio,
    required this.categoryCount,
    required this.productCount,
  });
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    this.valueColor,
  });

  final String title;
  final String value;
  final IconData icon;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      color: const Color(0xFF17120E),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: const Color(0xFFFFB04A), size: 20),
            const Spacer(),
            Text(
              value,
              style: GoogleFonts.poppins(
                color: valueColor ?? Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              title,
              style: GoogleFonts.poppins(
                color: const Color(0xFFE6C9A8),
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavbarMenuItemRow extends StatelessWidget {
  const _NavbarMenuItemRow({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: const Color(0xFFFFD49A)),
        const SizedBox(width: 10),
        Text(
          label,
          style: GoogleFonts.poppins(
            color: const Color(0xFFFFE2BF),
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _ElegantSearchBar extends StatelessWidget {
  const _ElegantSearchBar({
    required this.controller,
    required this.hintText,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          colors: [Color(0xFF21160F), Color(0xFF17120E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: const Color(0x33FFD49A)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          const Icon(Icons.search_rounded, color: Color(0xFFFFC977), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: hintText,
                hintStyle: const TextStyle(color: Color(0x80E6C9A8)),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
          if (controller.text.trim().isNotEmpty)
            IconButton(
              onPressed: onClear,
              icon: const Icon(Icons.close_rounded, color: Colors.white70),
              tooltip: 'Limpiar búsqueda',
            ),
        ],
      ),
    );
  }
}
