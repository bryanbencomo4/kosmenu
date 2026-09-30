import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/models/category.dart';
import 'package:kosmenu_app/models/comercio.dart';
import 'package:kosmenu_app/models/merchant_panel.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/models/product.dart';
import 'package:kosmenu_app/screens/billing_plan_screen.dart';
import 'package:kosmenu_app/screens/boost_sales_screen.dart';
import 'package:kosmenu_app/screens/category_screen.dart';
import 'package:kosmenu_app/screens/profile_screen.dart';
import 'package:kosmenu_app/services/merchant_session.dart';
import 'package:kosmenu_app/services/order_manager_service.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';
import 'package:kosmenu_app/widgets/next_menu_preview_frame.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MerchantOrdersWorkspace extends StatefulWidget {
  const MerchantOrdersWorkspace({
    super.key,
    required this.orders,
    required this.itemBuilder,
    this.errorSubtitle,
    this.onRetry,
  });

  final List<PedidoModel> orders;
  final Widget Function(PedidoModel pedido) itemBuilder;
  final String? errorSubtitle;
  final VoidCallback? onRetry;

  @override
  State<MerchantOrdersWorkspace> createState() =>
      _MerchantOrdersWorkspaceState();
}

/// One paginated window of orders, loaded newest-first with a created_at
/// cursor. Live rows from the realtime stream are layered on top by id.
class _OrdersPageWindow {
  final List<PedidoModel> rows = <PedidoModel>[];
  final Set<String> ids = <String>{};
  DateTime? cursor;
  bool hasMore = true;
  bool isLoading = false;
  Object? error;
  int generation = 0;

  void reset() {
    rows.clear();
    ids.clear();
    cursor = null;
    hasMore = true;
    isLoading = false;
    error = null;
    generation++;
  }

  void addAll(Iterable<PedidoModel> page) {
    for (final pedido in page) {
      if (ids.add(pedido.id)) rows.add(pedido);
      final createdAt = pedido.createdAt;
      if (createdAt != null && (cursor == null || createdAt.isBefore(cursor!))) {
        cursor = createdAt;
      }
    }
  }
}

class _MerchantOrdersWorkspaceState extends State<MerchantOrdersWorkspace> {
  static const int _pageSize = 25;
  static const int _minVisibleWhenFiltered = 12;

  OrderStatusBucket? _filter;
  String _query = '';
  String _activeSearch = '';
  Timer? _searchDebounce;
  final ScrollController _scrollController = ScrollController();
  final _OrdersPageWindow _browse = _OrdersPageWindow();
  final _OrdersPageWindow _search = _OrdersPageWindow();

  _OrdersPageWindow get _window =>
      _activeSearch.isEmpty ? _browse : _search;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _seedBrowseFromLive();
    if (_browse.rows.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _browse.rows.isEmpty) unawaited(_loadMore());
      });
    }
  }

  @override
  void didUpdateWidget(covariant MerchantOrdersWorkspace oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_browse.rows.isEmpty && !_browse.isLoading) {
      _seedBrowseFromLive();
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  /// The first page comes from rows the dashboard already has in memory, so
  /// the list paints without waiting on the network.
  void _seedBrowseFromLive() {
    if (widget.orders.isEmpty) return;
    _browse.addAll(widget.orders.take(_pageSize));
    _browse.hasMore = true;
  }

  void _onScroll() {
    final position = _scrollController.position;
    if (position.extentAfter < 600) unawaited(_loadMore());
  }

  void _onQueryChanged(String value) {
    setState(() => _query = value);
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      final next = _sanitizeSearch(value);
      if (next == _activeSearch) return;
      setState(() {
        _activeSearch = next.length >= 2 ? next : '';
        _search.reset();
      });
      if (_activeSearch.isNotEmpty) unawaited(_loadMore());
    });
  }

  String _sanitizeSearch(String value) {
    // PostgREST `or` filter syntax reserves these characters.
    return value.trim().replaceAll(RegExp(r'[,()*%\\"' "'" r':]'), ' ').trim();
  }

  Future<void> _refresh() async {
    setState(() {
      _browse.reset();
      _search.reset();
      _seedBrowseFromLive();
    });
    await _loadMore();
  }

  Future<void> _loadMore() async {
    final window = _window;
    if (window.isLoading || !window.hasMore) return;
    final comercioId = SupabaseConfig.currentComercioId.trim();
    if (comercioId.isEmpty) {
      setState(() => window.hasMore = false);
      return;
    }

    final generation = window.generation;
    final search = _activeSearch;
    setState(() {
      window.isLoading = true;
      window.error = null;
    });

    try {
      dynamic query = Supabase.instance.client
          .from('pedidos')
          .select('*')
          .eq('comercio_id', comercioId);
      if (search.isNotEmpty) {
        final pattern = '*$search*';
        query = query.or(
          'nombre_cliente.ilike.$pattern,'
          'telefono_cliente.ilike.$pattern,'
          'detalles->>order_id.ilike.$pattern,'
          'detalles->>codigo_orden.ilike.$pattern',
        );
      }
      final cursor = window.cursor;
      if (cursor != null) {
        // Web DateTimes are millisecond precision while created_at has
        // microseconds: include the cursor's millisecond and dedupe by id.
        final upperBound = cursor.toUtc().add(const Duration(milliseconds: 1));
        query = query.lt('created_at', upperBound.toIso8601String());
      }
      final rows =
          await query.order('created_at', ascending: false).limit(_pageSize)
              as List<dynamic>;
      if (!mounted || generation != window.generation) return;

      final page = rows
          .map((row) => PedidoModel.fromMap(Map<String, dynamic>.from(row as Map)))
          .where((pedido) => !pedido.hasParseError)
          .toList(growable: false);
      setState(() {
        window.addAll(page);
        window.hasMore = rows.length == _pageSize;
        window.isLoading = false;
      });
    } catch (error) {
      if (!mounted || generation != window.generation) return;
      setState(() {
        window.isLoading = false;
        window.error = error;
      });
    }
  }

  bool _matchesQuery(PedidoModel pedido, String q) {
    if (q.isEmpty) return true;
    final name = (pedido.nombreCliente ?? '').toLowerCase();
    final phone = (pedido.clientePhone ?? '').toLowerCase();
    final id = (pedido.orderId ?? pedido.id).toLowerCase();
    return name.contains(q) || phone.contains(q) || id.contains(q);
  }

  /// Loaded pages, with live rows replacing stale copies and new live orders
  /// (newer than the loaded window's cursor) added on top.
  List<PedidoModel> _visibleOrders() {
    final window = _window;
    final liveById = <String, PedidoModel>{
      for (final pedido in widget.orders) pedido.id: pedido,
    };
    final cursor = window.cursor;
    final q = _query.trim().toLowerCase();
    final merged = <String, PedidoModel>{};

    for (final pedido in window.rows) {
      merged[pedido.id] = liveById[pedido.id] ?? pedido;
    }
    for (final pedido in widget.orders) {
      if (merged.containsKey(pedido.id)) continue;
      final createdAt = pedido.createdAt;
      final insideWindow =
          cursor == null ||
          (createdAt != null && !createdAt.isBefore(cursor));
      if (!insideWindow && window.hasMore) continue;
      if (_activeSearch.isNotEmpty && !_matchesQuery(pedido, q)) continue;
      merged[pedido.id] = pedido;
    }

    final result = merged.values.where((pedido) {
      if (_filter != null && pedido.statusBucket != _filter) return false;
      // Server search also matches codigo_orden, which isn't on the model.
      return _activeSearch.isNotEmpty || _matchesQuery(pedido, q);
    }).toList();
    result.sort((a, b) {
      final aTime = a.createdAt;
      final bTime = b.createdAt;
      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime.compareTo(aTime);
    });
    return result;
  }

  void _ensureEnoughRows(int visibleCount) {
    final window = _window;
    if (window.isLoading || !window.hasMore || window.error != null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final underfilled = _filter != null && visibleCount < _minVisibleWhenFiltered;
      final cannotScroll = !_scrollController.hasClients ||
          _scrollController.position.maxScrollExtent <= 0;
      if (underfilled || cannotScroll) unawaited(_loadMore());
    });
  }

  Widget _buildFooter(_OrdersPageWindow window) {
    if (window.isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 18),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.4),
          ),
        ),
      );
    }
    if (window.error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: TextButton.icon(
            onPressed: _loadMore,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('No se pudieron cargar más pedidos. Reintentar'),
          ),
        ),
      );
    }
    if (!window.hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Center(
          child: Text(
            'No hay más pedidos',
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: const Color(0xFF9CA3AF),
            ),
          ),
        ),
      );
    }
    return const SizedBox(height: 18);
  }

  @override
  Widget build(BuildContext context) {
    final window = _window;
    final filtered = _visibleOrders();
    _ensureEnoughRows(filtered.length);
    final isInitialLoading = filtered.isEmpty && window.isLoading;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            onChanged: _onQueryChanged,
            decoration: InputDecoration(
              hintText: 'Buscar por cliente, teléfono o ID',
              prefixIcon: const Icon(Icons.search_rounded),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: 'Todos',
                  selected: _filter == null,
                  onTap: () => setState(() => _filter = null),
                ),
                _FilterChip(
                  label: 'Nuevo',
                  selected: _filter == OrderStatusBucket.pending,
                  onTap: () => setState(() => _filter = OrderStatusBucket.pending),
                ),
                _FilterChip(
                  label: 'En preparación',
                  selected: _filter == OrderStatusBucket.inProgress,
                  onTap: () =>
                      setState(() => _filter = OrderStatusBucket.inProgress),
                ),
                _FilterChip(
                  label: 'Entregado',
                  selected: _filter == OrderStatusBucket.completed,
                  onTap: () =>
                      setState(() => _filter = OrderStatusBucket.completed),
                ),
                _FilterChip(
                  label: 'Cancelado',
                  selected: _filter == OrderStatusBucket.canceled,
                  onTap: () =>
                      setState(() => _filter = OrderStatusBucket.canceled),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: widget.errorSubtitle != null
                ? MerchantEmptyPanel(
                    title: 'No se pudieron cargar los pedidos',
                    subtitle: widget.errorSubtitle!,
                    icon: Icons.error_outline_rounded,
                    actionLabel: 'Reintentar',
                    onAction: widget.onRetry,
                  )
                : isInitialLoading
                    ? const Center(child: CircularProgressIndicator())
                    : filtered.isEmpty && !window.hasMore
                    ? MerchantEmptyPanel(
                        title: _activeSearch.isNotEmpty || _filter != null
                            ? 'Sin resultados'
                            : 'Sin pedidos',
                        subtitle: _activeSearch.isNotEmpty || _filter != null
                            ? 'No hay pedidos que coincidan con este filtro.'
                            : 'Cuando entren pedidos aparecerán aquí con su estado.',
                        icon: Icons.receipt_long_outlined,
                      )
                    : RefreshIndicator(
                        onRefresh: _refresh,
                        child: ListView.separated(
                          controller: _scrollController,
                          physics: const AlwaysScrollableScrollPhysics(),
                          itemCount: filtered.length + 1,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            if (index == filtered.length) {
                              return _buildFooter(window);
                            }
                            return widget.itemBuilder(filtered[index]);
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: const Color(0xFF6D28D9),
        labelStyle: GoogleFonts.poppins(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: selected ? Colors.white : const Color(0xFF374151),
        ),
      ),
    );
  }
}

class MerchantClientsWorkspace extends StatelessWidget {
  const MerchantClientsWorkspace({
    super.key,
    required this.orders,
    required this.onOpenClient,
  });

  final List<PedidoModel> orders;
  final ValueChanged<MerchantClient> onOpenClient;

  @override
  Widget build(BuildContext context) {
    final clients = MerchantClient.fromOrders(orders);

    if (clients.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: MerchantEmptyPanel(
          title: 'Aún no hay clientes',
          subtitle:
              'Los clientes aparecerán aquí con su contacto e historial cuando recibas pedidos.',
          icon: Icons.groups_outlined,
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      itemCount: clients.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final client = clients[index];
        return Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: () => onOpenClient(client),
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: Color(0xFFF3E8FF),
                    child: Icon(Icons.person_outline_rounded, color: Color(0xFF6D28D9)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          client.name,
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          client.phone.isEmpty ? 'Sin teléfono' : client.phone,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B6F92),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '${client.orderCount} pedido${client.orderCount == 1 ? '' : 's'}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF6D28D9),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class MerchantDigitalMenuWorkspace extends StatelessWidget {
  const MerchantDigitalMenuWorkspace({
    super.key,
    required this.publicUrl,
    required this.displayUrl,
    required this.previewUrl,
    required this.menuOrders,
    required this.visits,
    required this.scans,
    required this.onCopy,
    required this.onDownloadQr,
    required this.onOpenUrl,
  });

  final String publicUrl;
  final String displayUrl;
  final Uri previewUrl;
  final int menuOrders;
  final int visits;
  final int scans;
  final VoidCallback onCopy;
  final VoidCallback onDownloadQr;
  final VoidCallback onOpenUrl;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        MerchantSmartMenuCard(
          publicUrl: publicUrl,
          displayUrl: displayUrl,
          visits: visits,
          scans: scans,
          menuOrders: menuOrders,
          onCopy: onCopy,
          onDownloadQr: onDownloadQr,
          onOpenUrl: onOpenUrl,
        ),
        const SizedBox(height: 16),
        Text(
          'Vista previa del menú',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 16),
        ),
        const SizedBox(height: 4),
        Text(
          'Es el menú público real, embebido aquí.',
          style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B6F92)),
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Container(
            height: 560,
            color: const Color(0xFF0F172A),
            child: NextMenuPreviewFrame(previewUrl: previewUrl),
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: onOpenUrl,
              icon: const Icon(Icons.open_in_new_rounded),
              label: const Text('Abrir menú'),
            ),
            OutlinedButton.icon(
              onPressed: onCopy,
              icon: const Icon(Icons.link_rounded),
              label: const Text('Copiar enlace'),
            ),
            OutlinedButton.icon(
              onPressed: onDownloadQr,
              icon: const Icon(Icons.qr_code_2_rounded),
              label: const Text('Descargar QR'),
            ),
          ],
        ),
      ],
    );
  }
}

class MerchantStatsWorkspace extends StatelessWidget {
  const MerchantStatsWorkspace({
    super.key,
    required this.salesCard,
    required this.topProducts,
    required this.hourCounts,
    required this.analytics,
    required this.onSeeProducts,
    required this.onAddProduct,
  });

  final Widget salesCard;
  final List<MerchantTopProduct> topProducts;
  final List<int> hourCounts;
  final MenuAnalyticsSummary analytics;
  final VoidCallback onSeeProducts;
  final VoidCallback onAddProduct;

  @override
  Widget build(BuildContext context) {
    final peakHour = hourCounts.isEmpty
        ? 0
        : hourCounts.indexOf(hourCounts.reduce((a, b) => a >= b ? a : b));
    final maxCount = hourCounts.isEmpty
        ? 0
        : hourCounts.reduce((a, b) => a > b ? a : b);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        salesCard,
        const SizedBox(height: 16),
        _conversionCard(analytics),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
            boxShadow: const [
              BoxShadow(
                color: Color(0x100F172A),
                blurRadius: 12,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Horas con más pedidos',
                style: GoogleFonts.poppins(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                maxCount == 0
                    ? 'Todavía no hay suficiente volumen para ver picos.'
                    : 'El mayor movimiento está cerca de las ${peakHour.toString().padLeft(2, '0')}:00.',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: const Color(0xFF6B6F92),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 88,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (var hour = 0; hour < 24; hour++)
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 1),
                          child: Container(
                            height: maxCount == 0
                                ? 8
                                : 12 + (76 * (hourCounts[hour] / maxCount)),
                            decoration: BoxDecoration(
                              color: hour == peakHour && maxCount > 0
                                  ? const Color(0xFF6D28D9)
                                  : const Color(0xFFEDE9FE),
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        MerchantTopProductsCard(
          products: topProducts,
          onSeeAll: onSeeProducts,
          onAddProduct: onAddProduct,
        ),
      ],
    );
  }

  Widget _conversionCard(MenuAnalyticsSummary analytics) {
    if (!analytics.hasTraffic) {
      return const MerchantEmptyPanel(
        title: 'Sin datos de conversión todavía',
        subtitle:
            'Cuando el menú público reciba visitas podrás ver visitas, pedidos y conversión reales.',
        icon: Icons.insights_outlined,
      );
    }
    final visitsSeries = analytics.visitsByDay;
    final ordersSeries = analytics.ordersByDay;
    final maxVisit = visitsSeries.isEmpty
        ? 0
        : visitsSeries.reduce((a, b) => a > b ? a : b);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Conversión del menú',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 12),
          _funnelRow('Visitas menú', analytics.visits),
          _funnelRow('Productos vistos', analytics.productViews),
          _funnelRow('Agregaron carrito', analytics.addToCart),
          _funnelRow('Pedidos', analytics.orders),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _stat(
                  '${analytics.conversion.toStringAsFixed(analytics.conversion % 1 == 0 ? 0 : 1)}%',
                  'Conversión',
                ),
              ),
              Expanded(
                child: _stat(
                  analytics.avgTicket <= 0
                      ? '—'
                      : '\$${analytics.avgTicket.toStringAsFixed(2)}',
                  'Ticket promedio',
                ),
              ),
              Expanded(
                child: _stat(
                  analytics.repeatCustomers == 0
                      ? '—'
                      : '${analytics.repeatCustomers}',
                  'Clientes recurrentes',
                ),
              ),
            ],
          ),
          if (visitsSeries.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              'Visitas y pedidos (7 días)',
              style: GoogleFonts.poppins(fontSize: 12, color: const Color(0xFF6B6F92)),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 72,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (var i = 0; i < visitsSeries.length; i++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            Container(
                              height: maxVisit == 0
                                  ? 8
                                  : 10 + (46 * (visitsSeries[i] / maxVisit)),
                              decoration: BoxDecoration(
                                color: const Color(0xFFDDD6FE),
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                            const SizedBox(height: 3),
                            Container(
                              height: maxVisit == 0 || i >= ordersSeries.length
                                  ? 4
                                  : 4 + (18 * (ordersSeries[i] / maxVisit)),
                              decoration: BoxDecoration(
                                color: const Color(0xFF6D28D9),
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Barras claras: visitas. Barras moradas: pedidos.',
              style: GoogleFonts.poppins(fontSize: 11, color: const Color(0xFF9CA3AF)),
            ),
          ],
          if (analytics.topViewed.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'Productos más vistos',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 14),
            ),
            const SizedBox(height: 8),
            for (final item in analytics.topViewed.take(5))
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(
                      '${item.views}',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _funnelRow(String label, int value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(label, style: GoogleFonts.poppins(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          Text(
            value == 0 ? '—' : '$value',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }

  Widget _stat(String value, String label) {
    return Column(
      children: [
        Text(value, style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 18)),
        Text(label, style: GoogleFonts.poppins(fontSize: 11, color: const Color(0xFF6B6F92))),
      ],
    );
  }
}

class MerchantSettingsHub extends StatelessWidget {
  const MerchantSettingsHub({
    super.key,
    required this.comercio,
    required this.planName,
    required this.hoursSubtitle,
    required this.onOpenBusiness,
    required this.onOpenAppearance,
    required this.onOpenPayments,
    required this.onOpenOperations,
    required this.onOpenHours,
    required this.onOpenPlan,
    required this.onOpenUsers,
    required this.onOpenKioskHome,
  });

  final ComercioModel comercio;
  final String planName;
  final String hoursSubtitle;
  final VoidCallback onOpenBusiness;
  final VoidCallback onOpenAppearance;
  final VoidCallback onOpenPayments;
  final VoidCallback onOpenOperations;
  final VoidCallback onOpenHours;
  final VoidCallback onOpenPlan;
  final VoidCallback onOpenUsers;
  final VoidCallback onOpenKioskHome;

  @override
  Widget build(BuildContext context) {
    final cards = <({
      IconData icon,
      String title,
      String subtitle,
      VoidCallback onTap,
    })>[
      (
        icon: Icons.storefront_outlined,
        title: 'Información del negocio',
        subtitle: comercio.nombre,
        onTap: onOpenBusiness,
      ),
      (
        icon: Icons.schedule_rounded,
        title: 'Horarios',
        subtitle: hoursSubtitle,
        onTap: onOpenHours,
      ),
      (
        icon: Icons.palette_outlined,
        title: 'Logo y apariencia',
        subtitle: 'Colores, tipografía y diseño del menú',
        onTap: onOpenAppearance,
      ),
      (
        icon: Icons.home_outlined,
        title: 'Pantalla de inicio',
        subtitle: 'Menú, comer aquí, para llevar, delivery y calificación',
        onTap: onOpenKioskHome,
      ),
      (
        icon: Icons.payments_outlined,
        title: 'Cobros y tasa',
        subtitle: 'Monedas y métodos de pago',
        onTap: onOpenPayments,
      ),
      (
        icon: Icons.tune_rounded,
        title: 'Operación y WhatsApp',
        subtitle: (comercio.whatsapp ?? '').trim().isEmpty
            ? 'Dirección, entrega y contacto'
            : comercio.whatsapp!.trim(),
        onTap: onOpenOperations,
      ),
      (
        icon: Icons.group_outlined,
        title: 'Usuarios',
        subtitle: 'Invita caja, cocina o marketing',
        onTap: onOpenUsers,
      ),
      (
        icon: Icons.workspace_premium_outlined,
        title: 'Plan actual',
        subtitle: planName,
        onTap: onOpenPlan,
      ),
    ];

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      itemCount: cards.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final card = cards[index];
        return Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            onTap: card.onTap,
            borderRadius: BorderRadius.circular(18),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: const Color(0xFFF3E8FF),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(card.icon, color: const Color(0xFF6D28D9)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          card.title,
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          card.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: const Color(0xFF6B6F92),
                          ),
                        ),
                      ],
                    ),
                  ),
                          const Icon(Icons.chevron_right_rounded, color: Color(0xFF9CA3AF)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class MerchantMarketingWorkspace extends StatefulWidget {
  const MerchantMarketingWorkspace({super.key});

  @override
  State<MerchantMarketingWorkspace> createState() =>
      _MerchantMarketingWorkspaceState();
}

class _MerchantMarketingWorkspaceState extends State<MerchantMarketingWorkspace> {
  bool _loading = true;
  String? _error;
  List<CategoryModel> _categories = const [];
  List<ProductModel> _products = const [];
  String _currency = 'USD';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final client = Supabase.instance.client;
      final comercioId = SupabaseConfig.currentComercioId;
      final results = await Future.wait<dynamic>([
        client.from('categorias').select().eq('comercio_id', comercioId),
        client.from('productos').select().eq('comercio_id', comercioId),
        client.from('comercios').select('moneda').eq('id', comercioId).maybeSingle(),
      ]);
      if (!mounted) return;
      setState(() {
        _categories = (results[0] as List<dynamic>)
            .map((row) => CategoryModel.fromMap(Map<String, dynamic>.from(row as Map)))
            .toList(growable: false);
        _products = (results[1] as List<dynamic>)
            .map((row) => ProductModel.fromMap(Map<String, dynamic>.from(row as Map)))
            .toList(growable: false);
        final currency = (results[2] as Map?)?['moneda']?.toString().trim() ?? 'USD';
        _currency = currency.isEmpty ? 'USD' : currency;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return MerchantEmptyPanel(
        title: 'No se pudieron abrir las herramientas de venta',
        subtitle: _error!,
        icon: Icons.campaign_outlined,
        actionLabel: 'Reintentar',
        onAction: _load,
      );
    }
    return BoostSalesScreen(
      categories: _categories,
      products: _products,
      currencyCode: _currency,
    );
  }
}

class MerchantEmbeddedProducts extends StatelessWidget {
  const MerchantEmbeddedProducts({super.key});

  @override
  Widget build(BuildContext context) {
    return const CategoryListScreen();
  }
}

class MerchantEmbeddedBilling extends StatelessWidget {
  const MerchantEmbeddedBilling({super.key});

  @override
  Widget build(BuildContext context) {
    if (!MerchantSession.canManageBilling) {
      return MerchantEmptyPanel(
        title: 'Facturación restringida',
        subtitle: MerchantSession.deniedMessage(
          'cambiar el plan ni la facturación',
        ),
        icon: Icons.lock_outline,
      );
    }
    return const BillingPlanScreen(embedded: true);
  }
}

class MerchantEmbeddedProfile extends StatelessWidget {
  const MerchantEmbeddedProfile({super.key});

  @override
  Widget build(BuildContext context) {
    return const ProfileScreen();
  }
}
