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
  Set<String> _seenOrderIds = <String>{};
  bool _didPrimeOrderAlert = false;

  bool get _hasWebUrlConfigured => AppLinks.productionUrl.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    _dashboardFuture = _fetchDashboardData();
    _recentOrdersStream = _buildRecentOrdersStream();
    _subscribeToRecentOrders();
  }

  @override
  void dispose() {
    _recentOrdersSubscription?.cancel();
    super.dispose();
  }

  Future<void> _openMagicOnboarding() async {
    final didSaveMenu = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const MagicOnboardingScreen()),
    );

    if (didSaveMenu == true && mounted) {
      setState(() {
        _dashboardFuture = _fetchDashboardData();
        _recentOrdersStream = _buildRecentOrdersStream();
      });
      _subscribeToRecentOrders();
    }
  }

  Future<void> _refreshDashboard() async {
    if (!mounted) return;
    setState(() {
      _dashboardFuture = _fetchDashboardData();
      _recentOrdersStream = _buildRecentOrdersStream();
    });
    _subscribeToRecentOrders();
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
        .limit(5)
        .map(
          (rows) => rows
              .map((row) => PedidoModel.fromMap(Map<String, dynamic>.from(row)))
              .toList(),
        );
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

    return Scaffold(
      backgroundColor: const Color(0xFF0F0D0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF17120E),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Centro de Control'),
        actions: [
          IconButton(
            onPressed: _copyPublicMenuUrl,
            icon: const Icon(Icons.copy_all_outlined),
            tooltip: 'Copiar URL pública',
          ),
          IconButton(
            onPressed: _openPublicMenu,
            icon: const Icon(Icons.open_in_browser),
            tooltip: 'Abrir menú público',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFFF6B00),
        onPressed: _openMagicOnboarding,
        child: const Icon(Icons.camera_alt),
      ),
      body: FutureBuilder<_DashboardData>(
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

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              GridView.count(
                crossAxisCount: 3,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _StatCard(
                    title: 'Productos',
                    value: '${data.productCount}',
                    icon: Icons.restaurant_menu,
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
              const SizedBox(height: 14),
              Card(
                elevation: 2,
                color: const Color(0xFF17120E),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Acciones rápidas',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFE2BF),
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 10),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _QuickPillAction(
                              icon: Icons.share_outlined,
                              label: 'Compartir Menú',
                              onTap: _sharePublicMenu,
                            ),
                            const SizedBox(width: 10),
                            _QuickPillAction(
                              icon: Icons.open_in_browser,
                              label: 'Ver Web',
                              onTap: _openPublicMenu,
                            ),
                            const SizedBox(width: 10),
                            _QuickPillAction(
                              icon: Icons.refresh,
                              label: 'Refrescar',
                              onTap: _refreshDashboard,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Card(
                elevation: 3,
                color: const Color(0xFF17120E),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Kosmenu Vendor',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFB04A),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        data.comercio.nombre,
                        style: GoogleFonts.poppins(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        '${data.categoryCount} Categorías, ${data.productCount} Productos',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(color: const Color(0xFFE6C9A8)),
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFFF6B00),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        onPressed: () => _showQRCode(context),
                        icon: const Icon(Icons.qr_code_2),
                        label: Text(
                          'Generar QR de mi Menú',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFFFC977),
                          side: const BorderSide(color: Color(0xFF7E5930)),
                        ),
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const CategoryListScreen(),
                            ),
                          );
                        },
                        icon: const Icon(Icons.inventory_2_outlined),
                        label: const Text('Administrar catálogo'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                color: const Color(0xFF17120E),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Accesos rápidos',
                        style: GoogleFonts.poppins(
                          color: const Color(0xFFFFE2BF),
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: _QuickActionTile(
                              icon: Icons.camera_alt,
                              title: 'Magic Onboarding',
                              subtitle: 'Sube foto del menú físico',
                              onTap: _openMagicOnboarding,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _QuickActionTile(
                              icon: Icons.qr_code,
                              title: 'Mi QR',
                              subtitle: 'Compártelo con clientes',
                              onTap: () => _showQRCode(context),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Pedidos Recientes',
                style: GoogleFonts.poppins(
                  color: const Color(0xFFFFE2BF),
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
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

                  final recentOrders =
                      ordersSnapshot.data ?? const <PedidoModel>[];

                  if (recentOrders.isEmpty) {
                    return const Card(
                      color: Color(0xFF17120E),
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text(
                          'No hay pedidos recientes',
                          style: TextStyle(color: Colors.white),
                        ),
                      ),
                    );
                  }

                  return Column(
                    children: recentOrders
                        .map(
                          (pedido) => Card(
                            color: const Color(0xFF17120E),
                            child: ListTile(
                              onTap: pedido.orderId != null
                                  ? () => _openOrderDetail(pedido)
                                  : null,
                              title: Text(
                                'Pedido ${(pedido.orderId ?? pedido.id).substring(0, (pedido.orderId ?? pedido.id).length < 16 ? (pedido.orderId ?? pedido.id).length : 16)}',
                                style: const TextStyle(color: Colors.white),
                              ),
                              subtitle: Text(
                                pedido.clienteEmail != null &&
                                        pedido.clienteEmail!.trim().isNotEmpty
                                    ? '${pedido.clienteEmail}\n${pedido.metodoPago ?? 'Método sin definir'}'
                                    : (pedido.createdAt != null
                                          ? 'Fecha: ${pedido.createdAt}'
                                          : 'Fecha no disponible'),
                                style: const TextStyle(color: Colors.white70),
                              ),
                              isThreeLine: pedido.clienteEmail != null &&
                                  pedido.clienteEmail!.trim().isNotEmpty,
                              trailing: Text(
                                pedido.total != null
                                    ? '\$${pedido.total!.toStringAsFixed(2)}'
                                    : pedido.estado ?? 'Pendiente',
                                style: const TextStyle(
                                  color: Color(0xFFFF6B00),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          );
        },
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

class _QuickActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _QuickActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.arrow_outward, size: 18),
            const SizedBox(height: 14),
            Icon(icon, color: const Color(0xFFFF6B00), size: 28),
            const SizedBox(height: 12),
            Text(
              title,
              style: GoogleFonts.poppins(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
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

class _QuickPillAction extends StatelessWidget {
  const _QuickPillAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF2A1C12),
        foregroundColor: const Color(0xFFFFD49A),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      ),
    );
  }
}
