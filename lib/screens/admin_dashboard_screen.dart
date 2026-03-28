import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';

import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/screens/category_screen.dart';
import 'package:kosmenu_app/screens/magic_onboarding_screen.dart';
import 'package:kosmenu_app/screens/qr_generator_screen.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key});

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  late Future<_DashboardData> _dashboardFuture;
  late Stream<List<PedidoModel>> _recentOrdersStream;

  @override
  void initState() {
    super.initState();
    _dashboardFuture = _fetchDashboardData();
    _recentOrdersStream = _buildRecentOrdersStream();
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
    }
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
    return Scaffold(
      appBar: AppBar(title: const Text('Centro de Control')),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFFF6B00),
        onPressed: _openMagicOnboarding,
        child: const Icon(Icons.camera_alt),
      ),
      body: FutureBuilder<_DashboardData>(
        future: _dashboardFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Error cargando dashboard: ${snapshot.error}'),
              ),
            );
          }

          final data = snapshot.data;
          if (data == null) {
            return const Center(child: Text('No se pudo cargar el dashboard'));
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                elevation: 3,
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
                          color: const Color(0xFFFF6B00),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        data.comercio.nombre,
                        style: GoogleFonts.poppins(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        '${data.categoryCount} Categorías, ${data.productCount} Productos',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFFFF6B00),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        onPressed: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) =>
                                  QrGeneratorScreen(comercio: data.comercio),
                            ),
                          );
                        },
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
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => QrGeneratorScreen(
                                      comercio: data.comercio,
                                    ),
                                  ),
                                );
                              },
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
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                    );
                  }

                  if (ordersSnapshot.hasError) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Error cargando pedidos: ${ordersSnapshot.error}',
                        ),
                      ),
                    );
                  }

                  final recentOrders =
                      ordersSnapshot.data ?? const <PedidoModel>[];

                  if (recentOrders.isEmpty) {
                    return const Card(
                      child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No hay pedidos recientes'),
                      ),
                    );
                  }

                  return Column(
                    children: recentOrders
                        .map(
                          (pedido) => Card(
                            child: ListTile(
                              title: Text(
                                'Pedido ${pedido.id.substring(0, pedido.id.length < 8 ? pedido.id.length : 8)}',
                              ),
                              subtitle: Text(
                                pedido.createdAt != null
                                    ? 'Fecha: ${pedido.createdAt}'
                                    : 'Fecha no disponible',
                              ),
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
