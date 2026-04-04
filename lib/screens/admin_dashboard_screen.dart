import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/screens/category_screen.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/order_detail_screen.dart';
import 'package:kosmenu_app/screens/profile_screen.dart';
import 'package:kosmenu_app/screens/qr_generator_screen.dart';
import 'package:share_plus/share_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  late Future<_DashboardSnapshot> _snapshotFuture;
  late Stream<List<PedidoModel>> _ordersStream;

  StreamSubscription<List<PedidoModel>>? _ordersSubscription;
  final TextEditingController _ordersSearchController = TextEditingController();
    final TextEditingController _manualOrderEmailController =
      TextEditingController();
    final TextEditingController _manualOrderTotalController =
      TextEditingController();
    final TextEditingController _manualOrderNotesController =
      TextEditingController();
    final TextEditingController _manualOrderPaymentController =
      TextEditingController();

  _OrderFilter _orderFilter = _OrderFilter.all;
  String _ordersSearchQuery = '';

  bool _isUpdatingBusinessOnline = false;
  bool _supportsBusinessOnlineColumn = true;
  bool _businessOnline = true;
  bool _didPrimeOnlineSwitch = false;

  bool _didPrimeOrderAlert = false;
  Set<String> _seenOrderIds = <String>{};

  MagicOnboardingResult? _recentCatalogResult;
  Timer? _recentCatalogTimer;

  bool get _hasComercioId => SupabaseConfig.hasCurrentComercioId;

  @override
  void initState() {
    super.initState();
    _snapshotFuture = _fetchSnapshot();
    _ordersStream = _buildOrdersStream();
    _subscribeToOrders();
  }

  @override
  void dispose() {
    _ordersSubscription?.cancel();
    _ordersSearchController.dispose();
    _manualOrderEmailController.dispose();
    _manualOrderTotalController.dispose();
    _manualOrderNotesController.dispose();
    _manualOrderPaymentController.dispose();
    _recentCatalogTimer?.cancel();
    super.dispose();
  }

  Future<_DashboardSnapshot> _fetchSnapshot() async {
    if (!_hasComercioId) {
      return const _DashboardSnapshot(
        comercio: ComercioModel(id: '', nombre: 'Comercio'),
        categoryCount: 0,
        productCount: 0,
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

    final comercio = ComercioModel.fromMap(
      Map<String, dynamic>.from(
        (results[0] as Map?) ?? const <String, dynamic>{},
      ),
    );

    if (comercio.id.trim().isNotEmpty) {
      SupabaseConfig.setCurrentComercioId(comercio.id, slug: comercio.slug);
    }

    return _DashboardSnapshot(
      comercio: comercio,
      categoryCount: (results[1] as List<dynamic>).length,
      productCount: (results[2] as List<dynamic>).length,
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
              .toList(),
        );
  }

  void _subscribeToOrders() {
    _ordersSubscription?.cancel();
    _seenOrderIds = <String>{};
    _didPrimeOrderAlert = false;

    _ordersSubscription = _ordersStream.listen(
      (orders) {
        final currentIds = orders.map((e) => e.id).toSet();

        if (!_didPrimeOrderAlert) {
          _seenOrderIds = currentIds;
          _didPrimeOrderAlert = true;
          return;
        }

        final newOrders = orders.where((e) => !_seenOrderIds.contains(e.id));
        _seenOrderIds = currentIds;

        if (newOrders.isEmpty || !mounted) return;

        final newest = newOrders.first;
        final orderLabel = newest.orderId ?? newest.id;
        SystemSound.play(SystemSoundType.alert);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            content: Text('Nuevo pedido recibido: $orderLabel'),
          ),
        );
      },
      onError: (Object error, StackTrace stackTrace) {
        debugPrint('Orders stream error: $error');
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

  Future<void> _openNotificationsSheet() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado.');
      return;
    }

    final rows = await Supabase.instance.client
        .from('pedidos')
        .select('id, order_id, estado, created_at')
        .eq('comercio_id', SupabaseConfig.currentComercioId)
        .order('created_at', ascending: false)
        .limit(12);

    if (!mounted) return;

    final items = (rows as List<dynamic>)
        .map((e) => Map<String, dynamic>.from(e as Map))
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
                        final item = items[index];
                        final rawStatus =
                            (item['estado']?.toString() ?? '').toLowerCase();
                        final done = rawStatus.contains('complet');
                        final color = done
                            ? const Color(0xFF15803D)
                            : const Color(0xFFF59E0B);
                        final title =
                            item['order_id']?.toString() ??
                            item['id']?.toString() ??
                            'Pedido';
                        return ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: Icon(
                            done
                                ? Icons.check_circle_rounded
                                : Icons.timelapse_rounded,
                            color: color,
                          ),
                          title: Text(title),
                          subtitle: Text(done ? 'Completado' : 'Pendiente'),
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

  String _generateManualOrderCode() {
    final now = DateTime.now();
    final seed = now.microsecondsSinceEpoch.toString();
    final suffix = seed.substring(seed.length - 6);
    return 'MAN-${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}-$suffix';
  }

  Future<void> _openCreateManualOrderSheet() async {
    if (!_hasComercioId) {
      _showInfo('No hay comercio configurado para crear pedidos.');
      return;
    }

    _manualOrderEmailController.clear();
    _manualOrderTotalController.clear();
    _manualOrderNotesController.clear();
    _manualOrderPaymentController.text = 'Efectivo';
    var isSaving = false;

    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      showDragHandle: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return SafeArea(
              top: false,
              child: AnimatedPadding(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(context).viewInsets.bottom,
                ),
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    6,
                    16,
                    16 + MediaQuery.of(context).viewPadding.bottom,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Crear pedido manual',
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _manualOrderTotalController,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Total',
                          hintText: 'Ej: 120000 o 25.50',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _manualOrderPaymentController,
                        decoration: const InputDecoration(
                          labelText: 'Metodo de pago',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _manualOrderEmailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email cliente (opcional)',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _manualOrderNotesController,
                        minLines: 2,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          labelText: 'Notas internas (opcional)',
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: isSaving
                                  ? null
                                  : () => Navigator.of(context).pop(),
                              child: const Text('Cancelar'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: isSaving
                                  ? null
                                  : () async {
                                      final totalValue = double.tryParse(
                                        _manualOrderTotalController.text
                                            .trim()
                                            .replaceAll(',', '.'),
                                      );
                                      if (totalValue == null || totalValue <= 0) {
                                        _showInfo('Ingresa un total valido mayor a 0.');
                                        return;
                                      }

                                      final orderCode = _generateManualOrderCode();
                                        final email =
                                          _manualOrderEmailController.text.trim();
                                        final method = _manualOrderPaymentController
                                            .text
                                            .trim()
                                            .isEmpty
                                          ? 'Efectivo'
                                          : _manualOrderPaymentController.text
                                            .trim();

                                      setModalState(() => isSaving = true);
                                      try {
                                        final payload = <String, dynamic>{
                                          'comercio_id': SupabaseConfig.currentComercioId,
                                          'estado': 'pendiente',
                                          'total': totalValue,
                                          'order_id': orderCode,
                                          if (email.isNotEmpty) 'cliente_email': email,
                                          'detalles': {
                                            'order_id': orderCode,
                                            if (email.isNotEmpty)
                                              'cliente_email': email,
                                            'metodo_pago': method,
                                            'origen': 'manual_dashboard',
                                            if (_manualOrderNotesController.text
                                                .trim()
                                                .isNotEmpty)
                                              'notas': _manualOrderNotesController
                                                  .text
                                                  .trim(),
                                            'items': const <Map<String, dynamic>>[],
                                            'total': totalValue,
                                          },
                                        };

                                        await Supabase.instance.client
                                            .from('pedidos')
                                            .insert(payload);

                                        if (!context.mounted || !mounted) return;
                                        Navigator.of(context).pop();
                                        _showInfo('Pedido manual creado: $orderCode');
                                        await _refreshDashboard();
                                      } catch (error) {
                                        if (!mounted) return;
                                        _showInfo('No se pudo crear el pedido: $error');
                                        if (context.mounted) {
                                          setModalState(() => isSaving = false);
                                        }
                                      }
                                    },
                              icon: const Icon(Icons.add_task_rounded),
                              label: Text(
                                isSaving ? 'Guardando...' : 'Crear pedido',
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _editBusinessInfo(ComercioModel comercio) async {
    final nameController = TextEditingController(text: comercio.nombre);
    final whatsappController = TextEditingController(
      text: comercio.whatsapp ?? '',
    );

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Editar negocio'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Nombre'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: whatsappController,
                keyboardType: TextInputType.phone,
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
        );
      },
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
      _showInfo('No se pudo guardar la configuración: $error');
    } finally {
      nameController.dispose();
      whatsappController.dispose();
    }
  }

  Future<void> _updateBusinessOnline(bool value) async {
    if (_isUpdatingBusinessOnline) return;

    final previous = _businessOnline;
    setState(() {
      _businessOnline = value;
      _isUpdatingBusinessOnline = true;
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
        _showInfo(
          'La columna en_linea no existe en comercios. Agrega la columna para guardar este estado.',
        );
      } else {
        _showInfo('No se pudo actualizar estado en línea: $error');
      }
      if (mounted) {
        setState(() => _businessOnline = previous);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _businessOnline = previous);
      }
      _showInfo('No se pudo actualizar estado en línea: $error');
    } finally {
      if (mounted) {
        setState(() => _isUpdatingBusinessOnline = false);
      }
    }
  }

  bool _isOrderCompleted(PedidoModel pedido) {
    final raw = (pedido.estado ?? '').trim().toLowerCase();
    return raw.contains('complet');
  }

  bool _isToday(DateTime? date) {
    if (date == null) return false;
    final now = DateTime.now();
    return date.year == now.year && date.month == now.month && date.day == now.day;
  }

  bool _matchesFilter(PedidoModel pedido) {
    if (_orderFilter == _OrderFilter.all) return true;
    final completed = _isOrderCompleted(pedido);
    if (_orderFilter == _OrderFilter.completed) return completed;
    return !completed;
  }

  bool _matchesSearch(PedidoModel pedido) {
    final query = _ordersSearchQuery.trim().toLowerCase();
    if (query.isEmpty) return true;

    final fields = <String>[
      pedido.id,
      pedido.orderId ?? '',
      pedido.estado ?? '',
      pedido.clienteEmail ?? '',
      pedido.metodoPago ?? '',
      pedido.total?.toStringAsFixed(2) ?? '',
      pedido.createdAt?.toIso8601String() ?? '',
    ];

    return fields.any((value) => value.toLowerCase().contains(query));
  }

  Future<void> _goToMenuManagement() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CategoryListScreen()));
    if (!mounted) return;
    await _refreshDashboard();
  }

  String _buildPublicUrl(ComercioModel comercio) {
    return getPublicMenuUrl(comercio);
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
    final colorScheme = theme.colorScheme;
    final bottomInset = MediaQuery.of(context).viewPadding.bottom;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            tooltip: 'Notificaciones',
            onPressed: _openNotificationsSheet,
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          IconButton(
            tooltip: 'Perfil',
            onPressed: _openProfile,
            icon: const Icon(Icons.account_circle_outlined),
          ),
          PopupMenuButton<_DashboardAction>(
            tooltip: 'Más acciones',
            onSelected: (value) async {
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
              }
            },
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
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreateManualOrderSheet,
        icon: const Icon(Icons.receipt_long_rounded),
        label: const Text('Crear pedido'),
      ),
      body: SafeArea(
        child: FutureBuilder<_DashboardSnapshot>(
          future: _snapshotFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }

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
                final allOrders = ordersSnapshot.data ?? const <PedidoModel>[];
                final filteredOrders = allOrders
                    .where(_matchesFilter)
                    .where(_matchesSearch)
                    .toList();

                final completedCount = allOrders.where(_isOrderCompleted).length;
                final pendingCount = allOrders.length - completedCount;
                final todayCount = allOrders.where((o) => _isToday(o.createdAt)).length;
                final todayRevenue = allOrders
                    .where((o) => _isToday(o.createdAt))
                    .fold<double>(0, (sum, o) => sum + (o.total ?? 0));

                return RefreshIndicator(
                  onRefresh: _refreshDashboard,
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(
                      16,
                      12,
                      16,
                      110 + bottomInset,
                    ),
                    children: [
                      if (_recentCatalogResult != null)
                        _CatalogUpdateBanner(result: _recentCatalogResult!),
                      _BusinessHeroCard(
                        comercio: data.comercio,
                        businessOnline: _businessOnline,
                        onManageMenu: _goToMenuManagement,
                        onOpenWeb: _openPublicMenu,
                        onCopyUrl: _copyPublicMenuUrl,
                        publicUrl: _buildPublicUrl(data.comercio),
                      ),
                      const SizedBox(height: 14),
                      _SectionTitle(
                        title: 'Indicadores',
                        actionLabel: 'Refrescar',
                        onActionTap: _refreshDashboard,
                      ),
                      const SizedBox(height: 10),
                      GridView.count(
                        crossAxisCount: 2,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        childAspectRatio: 1.28,
                        children: [
                          _KpiCard(
                            label: 'Productos',
                            value: '${data.productCount}',
                            icon: Icons.restaurant_menu_rounded,
                          ),
                          _KpiCard(
                            label: 'Categorías',
                            value: '${data.categoryCount}',
                            icon: Icons.grid_view_rounded,
                          ),
                          _KpiCard(
                            label: 'Pedidos hoy',
                            value: '$todayCount',
                            icon: Icons.receipt_long_rounded,
                          ),
                          _KpiCard(
                            label: 'Ingresos hoy',
                            value: '\$${todayRevenue.toStringAsFixed(2)}',
                            icon: Icons.paid_rounded,
                            highlight: colorScheme.primary,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _StatusRow(
                        pendingCount: pendingCount,
                        completedCount: completedCount,
                        businessOnline: _businessOnline,
                      ),
                      const SizedBox(height: 16),
                      const SizedBox(height: 6),
                      _BusinessSettingsCard(
                        comercio: data.comercio,
                        isUpdatingBusinessOnline: _isUpdatingBusinessOnline,
                        businessOnline: _businessOnline,
                        onEditInfo: () => _editBusinessInfo(data.comercio),
                        onToggleOnline: _updateBusinessOnline,
                      ),
                      const SizedBox(height: 16),
                      _SectionTitle(title: 'Pedidos recientes'),
                      const SizedBox(height: 10),
                      _OrderSearchField(
                        controller: _ordersSearchController,
                        onChanged: (value) {
                          if (!mounted) return;
                          setState(() => _ordersSearchQuery = value);
                        },
                        onClear: () {
                          _ordersSearchController.clear();
                          if (!mounted) return;
                          setState(() => _ordersSearchQuery = '');
                        },
                      ),
                      const SizedBox(height: 8),
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
                                  setState(() => _orderFilter = filter);
                                },
                                label: Text(filter.label),
                                avatar: Icon(filter.icon, size: 16),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (ordersSnapshot.hasError)
                        _EmptyStateCard(
                          title: 'No se pudieron cargar los pedidos',
                          subtitle: '${ordersSnapshot.error}',
                          icon: Icons.error_outline_rounded,
                        )
                      else if (filteredOrders.isEmpty)
                        const _EmptyStateCard(
                          title: 'Sin pedidos para este filtro',
                          subtitle:
                              'Intenta cambiar el filtro o esperar nuevos pedidos.',
                          icon: Icons.inbox_outlined,
                        )
                      else
                        ...filteredOrders.map(
                          (pedido) => _OrderTile(
                            pedido: pedido,
                            completed: _isOrderCompleted(pedido),
                            onTap: () => _openOrderDetail(pedido),
                          ),
                        ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

enum _DashboardAction { refresh, magicMenu, showQr, shareMenu, copyLink, openWeb }

enum _OrderFilter { all, pending, completed }

extension on _OrderFilter {
  String get label {
    switch (this) {
      case _OrderFilter.all:
        return 'Todos';
      case _OrderFilter.pending:
        return 'Pendientes';
      case _OrderFilter.completed:
        return 'Completados';
    }
  }

  IconData get icon {
    switch (this) {
      case _OrderFilter.all:
        return Icons.receipt_long_rounded;
      case _OrderFilter.pending:
        return Icons.timelapse_rounded;
      case _OrderFilter.completed:
        return Icons.check_circle_rounded;
    }
  }
}

class _DashboardSnapshot {
  const _DashboardSnapshot({
    required this.comercio,
    required this.categoryCount,
    required this.productCount,
  });

  final ComercioModel comercio;
  final int categoryCount;
  final int productCount;
}

class _BusinessHeroCard extends StatelessWidget {
  const _BusinessHeroCard({
    required this.comercio,
    required this.businessOnline,
    required this.onManageMenu,
    required this.onOpenWeb,
    required this.onCopyUrl,
    required this.publicUrl,
  });

  final ComercioModel comercio;
  final bool businessOnline;
  final VoidCallback onManageMenu;
  final VoidCallback onOpenWeb;
  final VoidCallback onCopyUrl;
  final String publicUrl;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final palette = _BusinessCardPalette.fromMenuPalette(
      comercio.menuPalette,
      colorScheme,
      primaryArgb: comercio.menuPalettePrimaryArgb,
      accentArgb: comercio.menuPaletteAccentArgb,
      surfaceArgb: comercio.menuPaletteSurfaceArgb,
      textArgb: comercio.menuPaletteTextArgb,
    );

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          colors: [palette.surfaceStart, palette.surfaceEnd],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: palette.primary.withValues(alpha: 0.4)),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: palette.primary.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: palette.primary.withValues(alpha: 0.44),
                  ),
                ),
                child: _BusinessLogoAvatar(
                  logoUrl: comercio.logoUrl,
                  fallbackColor: palette.primary,
                  onSurface: palette.onSurface,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      comercio.nombre,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        color: palette.onSurface,
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '@${(comercio.slug ?? '').trim().isEmpty ? 'tu-slug' : comercio.slug!.trim()}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.poppins(
                        color: palette.onSurface.withValues(alpha: 0.82),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              _StatusPill(
                label: businessOnline ? 'En línea' : 'Pausado',
                color: businessOnline
                    ? palette.success
                    : palette.warning,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: palette.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: palette.accent.withValues(alpha: 0.45)),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.link_rounded,
                  size: 16,
                  color: palette.onSurfaceMuted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SelectableText(
                      publicUrl,
                      style: GoogleFonts.poppins(
                        color: palette.onSurface,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                IconButton(
                  tooltip: 'Copiar URL completa',
                  onPressed: onCopyUrl,
                  icon: Icon(
                    Icons.copy_all_rounded,
                    size: 18,
                    color: palette.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: palette.primary,
                    foregroundColor: palette.onPrimary,
                  ),
                  onPressed: onManageMenu,
                  icon: const Icon(Icons.inventory_2_outlined),
                  label: const Text('Administrar menú'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: palette.onSurface,
                    side: BorderSide(
                      color: palette.accent.withValues(alpha: 0.7),
                    ),
                  ),
                  onPressed: onOpenWeb,
                  icon: const Icon(Icons.open_in_browser_rounded),
                  label: const Text('Abrir web'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
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

class _BusinessLogoAvatar extends StatelessWidget {
  const _BusinessLogoAvatar({
    required this.logoUrl,
    required this.fallbackColor,
    required this.onSurface,
  });

  final String? logoUrl;
  final Color fallbackColor;
  final Color onSurface;

  @override
  Widget build(BuildContext context) {
    final trimmed = logoUrl?.trim() ?? '';
    if (trimmed.isEmpty) {
      return Icon(Icons.storefront_rounded, color: fallbackColor);
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.network(
        trimmed,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) {
          return Container(
            color: fallbackColor.withValues(alpha: 0.18),
            alignment: Alignment.center,
            child: Icon(Icons.image_not_supported_rounded, color: onSurface),
          );
        },
      ),
    );
  }
}

class _BusinessCardPalette {
  const _BusinessCardPalette({
    required this.surfaceStart,
    required this.surfaceEnd,
    required this.primary,
    required this.accent,
    required this.onSurface,
    required this.onSurfaceMuted,
    required this.onPrimary,
    required this.success,
    required this.warning,
  });

  final Color surfaceStart;
  final Color surfaceEnd;
  final Color primary;
  final Color accent;
  final Color onSurface;
  final Color onSurfaceMuted;
  final Color onPrimary;
  final Color success;
  final Color warning;

  static _BusinessCardPalette fromMenuPalette(
    String? rawPalette,
    ColorScheme colorScheme,
    {
      int? primaryArgb,
      int? accentArgb,
      int? surfaceArgb,
      int? textArgb,
    }
  ) {
    if (primaryArgb != null && surfaceArgb != null && textArgb != null) {
      final primary = Color(primaryArgb);
      final accent = Color(accentArgb ?? primaryArgb);
      final surface = Color(surfaceArgb);
      final text = Color(textArgb);
      final surfaceStart = Color.lerp(surface, primary, 0.22) ?? surface;
      final onPrimary = primary.computeLuminance() > 0.5
          ? const Color(0xFF1F2937)
          : Colors.white;
      return _BusinessCardPalette(
        surfaceStart: surfaceStart,
        surfaceEnd: surface,
        primary: primary,
        accent: accent,
        onSurface: text,
        onSurfaceMuted: text.withValues(alpha: 0.78),
        onPrimary: onPrimary,
        success: const Color(0xFF4ADE80),
        warning: const Color(0xFFFBBF24),
      );
    }

    final id = (rawPalette ?? '').trim().toLowerCase();
    switch (id) {
      case 'uva':
        return const _BusinessCardPalette(
          surfaceStart: Color(0xFF2B1455),
          surfaceEnd: Color(0xFF1A1030),
          primary: Color(0xFF8B5CF6),
          accent: Color(0xFFC4B5FD),
          onSurface: Color(0xFFF5F3FF),
          onSurfaceMuted: Color(0xFFD6CCF5),
          onPrimary: Color(0xFF1A1030),
          success: Color(0xFF4ADE80),
          warning: Color(0xFFFBBF24),
        );
      case 'cafe':
        return const _BusinessCardPalette(
          surfaceStart: Color(0xFF332015),
          surfaceEnd: Color(0xFF1E150F),
          primary: Color(0xFFF59E0B),
          accent: Color(0xFFFCD34D),
          onSurface: Color(0xFFFFF7ED),
          onSurfaceMuted: Color(0xFFF2D7B0),
          onPrimary: Color(0xFF2B1708),
          success: Color(0xFF4ADE80),
          warning: Color(0xFFFBBF24),
        );
      case 'oliva':
        return const _BusinessCardPalette(
          surfaceStart: Color(0xFF203019),
          surfaceEnd: Color(0xFF152114),
          primary: Color(0xFFA3E635),
          accent: Color(0xFFD9F99D),
          onSurface: Color(0xFFF7FEE7),
          onSurfaceMuted: Color(0xFFDCE8BE),
          onPrimary: Color(0xFF22330F),
          success: Color(0xFF4ADE80),
          warning: Color(0xFFFBBF24),
        );
      case 'oceano':
        return const _BusinessCardPalette(
          surfaceStart: Color(0xFF12314A),
          surfaceEnd: Color(0xFF0F2233),
          primary: Color(0xFF38BDF8),
          accent: Color(0xFFBAE6FD),
          onSurface: Color(0xFFEFF9FF),
          onSurfaceMuted: Color(0xFFBCD9EE),
          onPrimary: Color(0xFF062033),
          success: Color(0xFF4ADE80),
          warning: Color(0xFFFBBF24),
        );
      default:
        final onSurface = colorScheme.onPrimaryContainer;
        return _BusinessCardPalette(
          surfaceStart: colorScheme.primaryContainer,
          surfaceEnd: colorScheme.surfaceContainerHighest,
          primary: colorScheme.primary,
          accent: colorScheme.secondary,
          onSurface: onSurface,
          onSurfaceMuted: onSurface.withValues(alpha: 0.78),
          onPrimary: colorScheme.onPrimary,
          success: const Color(0xFF16A34A),
          warning: const Color(0xFFF59E0B),
        );
    }
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

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    required this.icon,
    this.highlight,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color? highlight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final accent = highlight ?? colorScheme.primary;

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: accent, size: 20),
          const Spacer(),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.pendingCount,
    required this.completedCount,
    required this.businessOnline,
  });

  final int pendingCount;
  final int completedCount;
  final bool businessOnline;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MiniInfoCard(
            icon: Icons.timelapse_rounded,
            label: 'Pendientes',
            value: '$pendingCount',
            color: const Color(0xFFF59E0B),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MiniInfoCard(
            icon: Icons.check_circle_rounded,
            label: 'Completados',
            value: '$completedCount',
            color: const Color(0xFF22C55E),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MiniInfoCard(
            icon: Icons.wifi_tethering_rounded,
            label: 'Servicio',
            value: businessOnline ? 'Activo' : 'Pausado',
            color: businessOnline
                ? const Color(0xFF3B82F6)
                : const Color(0xFFF43F5E),
          ),
        ),
      ],
    );
  }
}

class _MiniInfoCard extends StatelessWidget {
  const _MiniInfoCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.cardColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.poppins(
              fontSize: 11,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _BusinessSettingsCard extends StatelessWidget {
  const _BusinessSettingsCard({
    required this.comercio,
    required this.isUpdatingBusinessOnline,
    required this.businessOnline,
    required this.onEditInfo,
    required this.onToggleOnline,
  });

  final ComercioModel comercio;
  final bool isUpdatingBusinessOnline;
  final bool businessOnline;
  final VoidCallback onEditInfo;
  final ValueChanged<bool> onToggleOnline;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SectionTitle(title: 'Configuración del negocio'),
            const SizedBox(height: 6),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.storefront_rounded),
              title: Text(
                comercio.nombre,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                (comercio.whatsapp ?? '').trim().isEmpty
                    ? 'Sin WhatsApp configurado'
                    : 'WhatsApp: ${comercio.whatsapp}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              trailing: TextButton.icon(
                onPressed: onEditInfo,
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('Editar'),
              ),
            ),
            const Divider(),
            SwitchListTile.adaptive(
              value: businessOnline,
              onChanged: isUpdatingBusinessOnline ? null : onToggleOnline,
              contentPadding: EdgeInsets.zero,
              title: const Text('Negocio en línea'),
              subtitle: Text(
                businessOnline
                    ? 'Aceptando pedidos de clientes.'
                    : 'Temporalmente pausado para nuevos pedidos.',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderSearchField extends StatelessWidget {
  const _OrderSearchField({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: 'Buscar por ID, correo, estado o método',
        prefixIcon: const Icon(Icons.search_rounded),
        suffixIcon: controller.text.trim().isEmpty
            ? null
            : IconButton(
                onPressed: onClear,
                icon: const Icon(Icons.close_rounded),
              ),
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({
    required this.pedido,
    required this.completed,
    required this.onTap,
  });

  final PedidoModel pedido;
  final bool completed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = completed ? const Color(0xFF16A34A) : const Color(0xFFF59E0B);
    final label = completed ? 'Completado' : 'Pendiente';

    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        onTap: onTap,
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(
            completed ? Icons.check_circle_rounded : Icons.timelapse_rounded,
            color: color,
          ),
        ),
        title: Text(
          'Pedido ${(pedido.orderId ?? pedido.id).substring(0, (pedido.orderId ?? pedido.id).length < 16 ? (pedido.orderId ?? pedido.id).length : 16)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 2),
            Text(
              pedido.clienteEmail?.trim().isNotEmpty == true
                  ? '${pedido.clienteEmail} • ${pedido.metodoPago ?? 'Método no definido'}'
                  : (pedido.createdAt?.toString() ?? 'Sin fecha disponible'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 5),
            _StatusPill(label: label, color: color),
          ],
        ),
        trailing: Text(
          pedido.total != null
              ? '\$${pedido.total!.toStringAsFixed(2)}'
              : '--',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
      ),
    );
  }
}

class _EmptyStateCard extends StatelessWidget {
  const _EmptyStateCard({
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final IconData icon;

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
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: 10),
        Text(label),
      ],
    );
  }
}
