import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/core/search_text.dart';
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
import 'package:kosmenu_app/utils/merchant_business_day.dart';
import 'package:kosmenu_app/widgets/merchant_dashboard_home.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum _OrdersDatePreset { all, today, yesterday, last7, thisMonth, custom }

enum _OrdersFulfillmentFilter { all, delivery, pickup }

/// Optional seed filters when opening Pedidos from the sales chart.
class MerchantOrdersSeedFilter {
  const MerchantOrdersSeedFilter({
    this.dateRange,
    this.currency,
    this.revision = 0,
  });

  /// Inclusive calendar range (end day included).
  final DateTimeRange? dateRange;
  final String? currency;

  /// Bump so the same range re-applies when tapping the chart again.
  final int revision;
}

class MerchantOrdersWorkspace extends StatefulWidget {
  const MerchantOrdersWorkspace({
    super.key,
    required this.orders,
    required this.itemBuilder,
    this.purgedOrderIds = const <String>{},
    this.errorSubtitle,
    this.onRetry,
    this.seedFilter,
  });

  final List<PedidoModel> orders;

  /// Hard-deleted ids that must leave paginated caches immediately.
  final Set<String> purgedOrderIds;
  final Widget Function(PedidoModel pedido) itemBuilder;
  final String? errorSubtitle;
  final VoidCallback? onRetry;
  final MerchantOrdersSeedFilter? seedFilter;

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
      if (createdAt != null &&
          (cursor == null || createdAt.isBefore(cursor!))) {
        cursor = createdAt;
      }
    }
  }

  void upsert(PedidoModel pedido) {
    final index = rows.indexWhere((row) => row.id == pedido.id);
    if (index >= 0) {
      rows[index] = pedido;
      return;
    }
    if (ids.add(pedido.id)) rows.insert(0, pedido);
  }

  void removeIds(Set<String> remove) {
    if (remove.isEmpty) return;
    rows.removeWhere((row) => remove.contains(row.id));
    ids.removeAll(remove);
  }

  void retainWhere(bool Function(PedidoModel pedido) test) {
    rows.removeWhere((row) {
      final keep = test(row);
      if (!keep) ids.remove(row.id);
      return !keep;
    });
  }
}

class _MerchantOrdersWorkspaceState extends State<MerchantOrdersWorkspace> {
  static const int _pageSize = 25;
  static const int _minVisibleWhenFiltered = 12;

  OrderStatusBucket? _filter;
  _OrdersFulfillmentFilter _fulfillment = _OrdersFulfillmentFilter.all;
  String? _currency;
  _OrdersDatePreset _datePreset = _OrdersDatePreset.all;
  DateTimeRange? _customRange;
  bool _showArchived = false;
  String _query = '';
  String _activeSearch = '';
  Timer? _searchDebounce;
  final ScrollController _scrollController = ScrollController();
  final _OrdersPageWindow _browse = _OrdersPageWindow();
  final _OrdersPageWindow _search = _OrdersPageWindow();

  _OrdersPageWindow get _window => _activeSearch.isEmpty ? _browse : _search;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _applySeedFilter(widget.seedFilter, reload: false);
    _seedBrowseFromLive();
    if (_browse.rows.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _browse.rows.isEmpty) unawaited(_loadMore());
      });
    } else if (widget.seedFilter?.dateRange != null ||
        (widget.seedFilter?.currency ?? '').isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _resetWindowsAndReload(seedLive: true);
      });
    }
  }

  @override
  void didUpdateWidget(covariant MerchantOrdersWorkspace oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldSeed = oldWidget.seedFilter;
    final nextSeed = widget.seedFilter;
    final seedChanged = oldSeed?.revision != nextSeed?.revision ||
        oldSeed?.currency != nextSeed?.currency ||
        oldSeed?.dateRange?.start != nextSeed?.dateRange?.start ||
        oldSeed?.dateRange?.end != nextSeed?.dateRange?.end;
    if (seedChanged && nextSeed != null) {
      _applySeedFilter(nextSeed, reload: true);
    }
    _syncWindowsWithLive();
    if (_browse.rows.isEmpty && !_browse.isLoading) {
      _seedBrowseFromLive();
    }
  }

  void _applySeedFilter(MerchantOrdersSeedFilter? seed, {required bool reload}) {
    if (seed == null) return;
    final range = seed.dateRange;
    if (range != null) {
      _datePreset = _OrdersDatePreset.custom;
      _customRange = DateTimeRange(
        start: DateTime(range.start.year, range.start.month, range.start.day),
        end: DateTime(range.end.year, range.end.month, range.end.day),
      );
    }
    final currency = (seed.currency ?? '').trim().toUpperCase();
    if (currency.isNotEmpty &&
        currency != 'ALL' &&
        currency != 'USD_ESTIMATE') {
      _currency = currency;
    }
    if (reload) {
      _resetWindowsAndReload(seedLive: true);
    }
  }

  /// Keep paginated caches aligned with optimistic/live updates so archive,
  /// restore, and delete show up without a manual reload.
  void _syncWindowsWithLive() {
    final liveById = <String, PedidoModel>{
      for (final pedido in widget.orders) pedido.id: pedido,
    };
    final purged = widget.purgedOrderIds;

    void sync(_OrdersPageWindow window) {
      if (purged.isNotEmpty) window.removeIds(purged);
      for (var i = 0; i < window.rows.length; i++) {
        final live = liveById[window.rows[i].id];
        if (live != null) window.rows[i] = live;
      }
      window.retainWhere((pedido) {
        final live = liveById[pedido.id];
        final effective = live ?? pedido;
        if (purged.contains(effective.id)) return false;
        return effective.isArchived == _showArchived;
      });
    }

    sync(_browse);
    sync(_search);

    // Restored/archived orders that belong in the current inbox should appear
    // at the top even if they were never in this paginated window.
    if (_activeSearch.isEmpty) {
      for (final pedido in widget.orders) {
        if (purged.contains(pedido.id)) continue;
        if (pedido.isArchived != _showArchived) continue;
        if (_browse.ids.contains(pedido.id)) continue;
        final createdAt = pedido.createdAt;
        final cursor = _browse.cursor;
        final insideWindow =
            cursor == null ||
            (createdAt != null && !createdAt.isBefore(cursor));
        if (insideWindow || !_browse.hasMore) {
          _browse.upsert(pedido);
        }
      }
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
    final seeded = widget.orders
        .where((pedido) => pedido.isArchived == _showArchived)
        .take(_pageSize);
    _browse.addAll(seeded);
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
    return value
        .trim()
        .replaceAll(
          RegExp(
            r'[,()*%\\"'
            "'"
            r':]',
          ),
          ' ',
        )
        .trim();
  }

  ({DateTime? start, DateTime? end}) _dateBounds() {
    final now = DateTime.now();
    final today = merchantTodayBusinessWindow(now);
    switch (_datePreset) {
      case _OrdersDatePreset.all:
        return (start: null, end: null);
      case _OrdersDatePreset.today:
        return (start: today.startInclusive, end: today.endExclusive);
      case _OrdersDatePreset.yesterday:
        return (
          start: today.startInclusive.subtract(const Duration(days: 1)),
          end: today.startInclusive,
        );
      case _OrdersDatePreset.last7:
        return (
          start: today.startInclusive.subtract(const Duration(days: 6)),
          end: today.endExclusive,
        );
      case _OrdersDatePreset.thisMonth:
        final label = merchantBusinessDayLabelDate(now);
        return (
          start: merchantBusinessDayStartForLabel(
            DateTime(label.year, label.month, 1),
          ),
          end: today.endExclusive,
        );
      case _OrdersDatePreset.custom:
        final range = _customRange;
        if (range == null) return (start: null, end: null);
        final startLabel = DateTime(
          range.start.year,
          range.start.month,
          range.start.day,
        );
        final endLabel = DateTime(
          range.end.year,
          range.end.month,
          range.end.day,
        );
        return (
          start: merchantBusinessDayStartForLabel(startLabel),
          end: merchantBusinessDayEndForLabel(endLabel),
        );
    }
  }

  void _resetWindowsAndReload({bool seedLive = false}) {
    setState(() {
      _browse.reset();
      _search.reset();
      if (seedLive && _activeSearch.isEmpty) _seedBrowseFromLive();
    });
    unawaited(_loadMore());
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
    final bounds = _dateBounds();
    setState(() {
      window.isLoading = true;
      window.error = null;
    });

    try {
      dynamic query = Supabase.instance.client
          .from('pedidos')
          .select('*')
          .eq('comercio_id', comercioId);
      if (_showArchived) {
        query = query.not('archived_at', 'is', null);
      } else {
        query = query.filter('archived_at', 'is', null);
      }
      if (search.isNotEmpty) {
        final pattern = '*$search*';
        query = query.or(
          'nombre_cliente.ilike.$pattern,'
          'telefono_cliente.ilike.$pattern,'
          'detalles->>order_id.ilike.$pattern,'
          'detalles->>codigo_orden.ilike.$pattern',
        );
      }
      final currency = _currency;
      if (currency != null && currency.isNotEmpty) {
        query = query.filter('detalles->>moneda_checkout', 'eq', currency);
      }
      if (_fulfillment == _OrdersFulfillmentFilter.delivery) {
        query = query.filter('detalles->delivery->>mode', 'eq', 'delivery');
      }
      final start = bounds.start;
      final end = bounds.end;
      if (start != null) {
        query = query.gte('created_at', start.toUtc().toIso8601String());
      }
      if (end != null) {
        query = query.lt('created_at', end.toUtc().toIso8601String());
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

      final purged = widget.purgedOrderIds;
      final page = rows
          .map(
            (row) => PedidoModel.fromMap(Map<String, dynamic>.from(row as Map)),
          )
          .where(
            (pedido) =>
                !pedido.hasParseError &&
                !purged.contains(pedido.id) &&
                pedido.isArchived == _showArchived,
          )
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
    final name = foldSearchText(pedido.nombreCliente);
    final phone = (pedido.clientePhone ?? '').toLowerCase();
    final id = (pedido.orderId ?? pedido.id).toLowerCase();
    return name.contains(q) || phone.contains(q) || id.contains(q);
  }

  bool _matchesClientFilters(PedidoModel pedido) {
    if (pedido.isArchived != _showArchived) return false;
    if (_filter != null && pedido.statusBucket != _filter) return false;
    if (_fulfillment == _OrdersFulfillmentFilter.delivery &&
        !pedido.isDeliveryOrder) {
      return false;
    }
    if (_fulfillment == _OrdersFulfillmentFilter.pickup &&
        pedido.isDeliveryOrder) {
      return false;
    }
    final currency = _currency;
    if (currency != null && currency.isNotEmpty) {
      final orderCurrency = pedido.currencyForDisplay();
      if (orderCurrency != currency) return false;
    }
    final bounds = _dateBounds();
    final createdAt = pedido.createdAt;
    if (createdAt != null) {
      final start = bounds.start;
      final end = bounds.end;
      if (start != null && createdAt.isBefore(start)) return false;
      if (end != null && !createdAt.isBefore(end)) return false;
    }
    return true;
  }

  /// Loaded pages, with live rows replacing stale copies and new live orders
  /// (newer than the loaded window's cursor) added on top.
  List<PedidoModel> _visibleOrders() {
    final window = _window;
    final purged = widget.purgedOrderIds;
    final liveById = <String, PedidoModel>{
      for (final pedido in widget.orders)
        if (!purged.contains(pedido.id)) pedido.id: pedido,
    };
    final cursor = window.cursor;
    final q = foldSearchText(_query);
    final merged = <String, PedidoModel>{};

    for (final pedido in window.rows) {
      if (purged.contains(pedido.id)) continue;
      merged[pedido.id] = liveById[pedido.id] ?? pedido;
    }
    for (final pedido in widget.orders) {
      if (purged.contains(pedido.id)) continue;
      if (merged.containsKey(pedido.id)) continue;
      final createdAt = pedido.createdAt;
      final insideWindow =
          cursor == null || (createdAt != null && !createdAt.isBefore(cursor));
      if (!insideWindow && window.hasMore) continue;
      if (_activeSearch.isNotEmpty && !_matchesQuery(pedido, q)) continue;
      merged[pedido.id] = pedido;
    }

    final result = merged.values.where((pedido) {
      if (purged.contains(pedido.id)) return false;
      if (!_matchesClientFilters(pedido)) return false;
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

  Set<String> _availableCurrencies() {
    final out = <String>{};
    for (final pedido in widget.orders.followedBy(_window.rows)) {
      final currency = pedido.checkoutCurrencySnapshot;
      if (currency != null && currency.isNotEmpty) out.add(currency);
    }
    return out;
  }

  void _ensureEnoughRows(int visibleCount) {
    final window = _window;
    if (window.isLoading || !window.hasMore || window.error != null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final underfilled =
          (_filter != null ||
              _fulfillment != _OrdersFulfillmentFilter.all ||
              _currency != null) &&
          visibleCount < _minVisibleWhenFiltered;
      final cannotScroll =
          !_scrollController.hasClients ||
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

  int get _advancedFilterCount {
    var count = 0;
    if (_filter != null) count += 1;
    if (_fulfillment != _OrdersFulfillmentFilter.all) count += 1;
    if (_currency != null) count += 1;
    if (_datePreset != _OrdersDatePreset.all) count += 1;
    return count;
  }

  bool get _hasActiveFilters =>
      _activeSearch.isNotEmpty || _advancedFilterCount > 0 || _showArchived;

  String get _datePresetLabel {
    switch (_datePreset) {
      case _OrdersDatePreset.all:
        return 'Cualquier fecha';
      case _OrdersDatePreset.today:
        return 'Hoy';
      case _OrdersDatePreset.yesterday:
        return 'Ayer';
      case _OrdersDatePreset.last7:
        return 'Últimos 7 días';
      case _OrdersDatePreset.thisMonth:
        return 'Este mes';
      case _OrdersDatePreset.custom:
        if (_customRange == null) return 'Rango';
        final start = _customRange!.start;
        final end = _customRange!.end;
        if (start.year == end.year &&
            start.month == end.month &&
            start.day == end.day) {
          return '${start.day}/${start.month}/${start.year}';
        }
        return '${start.day}/${start.month}'
            '–${end.day}/${end.month}';
    }
  }

  Future<void> _openFiltersSheet() async {
    final currencies = _availableCurrencies().toList()..sort();
    var draftStatus = _filter;
    var draftFulfillment = _fulfillment;
    var draftCurrency = _currency;
    var draftDate = _datePreset;
    var draftRange = _customRange;

    final applied = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            Widget sectionTitle(String text) => Padding(
              padding: const EdgeInsets.only(bottom: 8, top: 4),
              child: Text(
                text,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: const Color(0xFF6B7280),
                  letterSpacing: 0.2,
                ),
              ),
            );

            Widget choice({
              required String label,
              required bool selected,
              required VoidCallback onTap,
            }) {
              return Padding(
                padding: const EdgeInsets.only(right: 8, bottom: 8),
                child: ChoiceChip(
                  label: Text(label),
                  selected: selected,
                  onSelected: (_) => onTap(),
                  selectedColor: const Color(0xFF111827),
                  backgroundColor: const Color(0xFFF3F4F6),
                  side: BorderSide.none,
                  labelStyle: GoogleFonts.poppins(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : const Color(0xFF374151),
                  ),
                ),
              );
            }

            return SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  20,
                  12,
                  20,
                  16 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: const Color(0xFFE5E7EB),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Filtros',
                            style: GoogleFonts.poppins(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: const Color(0xFF111827),
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: () {
                            setSheetState(() {
                              draftStatus = null;
                              draftFulfillment = _OrdersFulfillmentFilter.all;
                              draftCurrency = null;
                              draftDate = _OrdersDatePreset.all;
                              draftRange = null;
                            });
                          },
                          child: const Text('Limpiar'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Flexible(
                      child: SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            sectionTitle('Estado'),
                            Wrap(
                              children: [
                                choice(
                                  label: 'Todos',
                                  selected: draftStatus == null,
                                  onTap: () =>
                                      setSheetState(() => draftStatus = null),
                                ),
                                choice(
                                  label: 'Nuevo',
                                  selected:
                                      draftStatus == OrderStatusBucket.pending,
                                  onTap: () => setSheetState(
                                    () => draftStatus = OrderStatusBucket.pending,
                                  ),
                                ),
                                choice(
                                  label: 'En preparación',
                                  selected: draftStatus ==
                                      OrderStatusBucket.inProgress,
                                  onTap: () => setSheetState(
                                    () => draftStatus =
                                        OrderStatusBucket.inProgress,
                                  ),
                                ),
                                choice(
                                  label: 'Entregado',
                                  selected: draftStatus ==
                                      OrderStatusBucket.completed,
                                  onTap: () => setSheetState(
                                    () => draftStatus =
                                        OrderStatusBucket.completed,
                                  ),
                                ),
                                choice(
                                  label: 'Cancelado',
                                  selected:
                                      draftStatus == OrderStatusBucket.canceled,
                                  onTap: () => setSheetState(
                                    () =>
                                        draftStatus = OrderStatusBucket.canceled,
                                  ),
                                ),
                                if (widget.orders.any(
                                  (pedido) => pedido.isWhatsappManual,
                                ))
                                  choice(
                                    label: 'WhatsApp',
                                    selected: draftStatus ==
                                        OrderStatusBucket.whatsappManual,
                                    onTap: () => setSheetState(
                                      () => draftStatus =
                                          OrderStatusBucket.whatsappManual,
                                    ),
                                  ),
                              ],
                            ),
                            sectionTitle('Tipo'),
                            Wrap(
                              children: [
                                choice(
                                  label: 'Todos',
                                  selected: draftFulfillment ==
                                      _OrdersFulfillmentFilter.all,
                                  onTap: () => setSheetState(
                                    () => draftFulfillment =
                                        _OrdersFulfillmentFilter.all,
                                  ),
                                ),
                                choice(
                                  label: 'Delivery',
                                  selected: draftFulfillment ==
                                      _OrdersFulfillmentFilter.delivery,
                                  onTap: () => setSheetState(
                                    () => draftFulfillment =
                                        _OrdersFulfillmentFilter.delivery,
                                  ),
                                ),
                                choice(
                                  label: 'Recoger',
                                  selected: draftFulfillment ==
                                      _OrdersFulfillmentFilter.pickup,
                                  onTap: () => setSheetState(
                                    () => draftFulfillment =
                                        _OrdersFulfillmentFilter.pickup,
                                  ),
                                ),
                              ],
                            ),
                            if (currencies.isNotEmpty) ...[
                              sectionTitle('Moneda'),
                              Wrap(
                                children: [
                                  choice(
                                    label: 'Todas',
                                    selected: draftCurrency == null,
                                    onTap: () => setSheetState(
                                      () => draftCurrency = null,
                                    ),
                                  ),
                                  for (final currency in currencies)
                                    choice(
                                      label: currency,
                                      selected: draftCurrency == currency,
                                      onTap: () => setSheetState(
                                        () => draftCurrency = currency,
                                      ),
                                    ),
                                ],
                              ),
                            ],
                            sectionTitle('Fecha'),
                            Wrap(
                              children: [
                                choice(
                                  label: 'Cualquiera',
                                  selected:
                                      draftDate == _OrdersDatePreset.all,
                                  onTap: () => setSheetState(() {
                                    draftDate = _OrdersDatePreset.all;
                                    draftRange = null;
                                  }),
                                ),
                                choice(
                                  label: 'Hoy',
                                  selected:
                                      draftDate == _OrdersDatePreset.today,
                                  onTap: () => setSheetState(
                                    () => draftDate = _OrdersDatePreset.today,
                                  ),
                                ),
                                choice(
                                  label: 'Ayer',
                                  selected: draftDate ==
                                      _OrdersDatePreset.yesterday,
                                  onTap: () => setSheetState(
                                    () =>
                                        draftDate = _OrdersDatePreset.yesterday,
                                  ),
                                ),
                                choice(
                                  label: '7 días',
                                  selected:
                                      draftDate == _OrdersDatePreset.last7,
                                  onTap: () => setSheetState(
                                    () => draftDate = _OrdersDatePreset.last7,
                                  ),
                                ),
                                choice(
                                  label: 'Este mes',
                                  selected: draftDate ==
                                      _OrdersDatePreset.thisMonth,
                                  onTap: () => setSheetState(
                                    () =>
                                        draftDate = _OrdersDatePreset.thisMonth,
                                  ),
                                ),
                                choice(
                                  label: draftDate ==
                                              _OrdersDatePreset.custom &&
                                          draftRange != null
                                      ? '${draftRange!.start.day}/${draftRange!.start.month}–${draftRange!.end.day}/${draftRange!.end.month}'
                                      : 'Elegir rango',
                                  selected: draftDate ==
                                      _OrdersDatePreset.custom,
                                  onTap: () async {
                                    final now = DateTime.now();
                                    final picked = await showDateRangePicker(
                                      context: context,
                                      firstDate: DateTime(now.year - 3),
                                      lastDate: DateTime(
                                        now.year,
                                        now.month,
                                        now.day,
                                      ),
                                      initialDateRange:
                                          draftRange ??
                                          DateTimeRange(
                                            start: now.subtract(
                                              const Duration(days: 7),
                                            ),
                                            end: now,
                                          ),
                                      helpText: 'Rango de fechas',
                                      cancelText: 'Cancelar',
                                      confirmText: 'Aplicar',
                                    );
                                    if (picked == null) return;
                                    setSheetState(() {
                                      draftDate = _OrdersDatePreset.custom;
                                      draftRange = picked;
                                    });
                                  },
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF111827),
                        minimumSize: const Size.fromHeight(48),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () => Navigator.of(sheetContext).pop(true),
                      child: const Text('Aplicar filtros'),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (applied != true || !mounted) return;
    setState(() {
      _filter = draftStatus;
      _fulfillment = draftFulfillment;
      _currency = draftCurrency;
      _datePreset = draftDate;
      _customRange = draftRange;
    });
    _resetWindowsAndReload();
  }

  @override
  Widget build(BuildContext context) {
    final window = _window;
    final filtered = _visibleOrders();
    _ensureEnoughRows(filtered.length);
    final isInitialLoading = filtered.isEmpty && window.isLoading;
    final filterCount = _advancedFilterCount;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            onChanged: _onQueryChanged,
            decoration: InputDecoration(
              hintText: 'Buscar Nº de orden, cliente o teléfono',
              prefixIcon: const Icon(Icons.search_rounded),
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
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
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 42,
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: _InboxSegment(
                          label: 'Activos',
                          selected: !_showArchived,
                          onTap: () {
                            if (!_showArchived) return;
                            setState(() => _showArchived = false);
                            _resetWindowsAndReload(seedLive: true);
                          },
                        ),
                      ),
                      Expanded(
                        child: _InboxSegment(
                          label: 'Archivados',
                          selected: _showArchived,
                          onTap: () {
                            if (_showArchived) return;
                            setState(() => _showArchived = true);
                            _resetWindowsAndReload(seedLive: true);
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Material(
                color: filterCount > 0
                    ? const Color(0xFF111827)
                    : Colors.white,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => unawaited(_openFiltersSheet()),
                  child: Container(
                    height: 42,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: filterCount > 0
                            ? const Color(0xFF111827)
                            : const Color(0xFFE5E7EB),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.tune_rounded,
                          size: 18,
                          color: filterCount > 0
                              ? Colors.white
                              : const Color(0xFF374151),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          filterCount > 0 ? 'Filtros ($filterCount)' : 'Filtros',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: filterCount > 0
                                ? Colors.white
                                : const Color(0xFF374151),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (filterCount > 0) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (_filter != null)
                  _ActiveFilterPill(
                    label: _filter!.label,
                    onClear: () {
                      setState(() => _filter = null);
                      _resetWindowsAndReload();
                    },
                  ),
                if (_fulfillment != _OrdersFulfillmentFilter.all)
                  _ActiveFilterPill(
                    label: _fulfillment == _OrdersFulfillmentFilter.delivery
                        ? 'Delivery'
                        : 'Recoger',
                    onClear: () {
                      setState(
                        () => _fulfillment = _OrdersFulfillmentFilter.all,
                      );
                      _resetWindowsAndReload();
                    },
                  ),
                if (_currency != null)
                  _ActiveFilterPill(
                    label: _currency!,
                    onClear: () {
                      setState(() => _currency = null);
                      _resetWindowsAndReload();
                    },
                  ),
                if (_datePreset != _OrdersDatePreset.all)
                  _ActiveFilterPill(
                    label: _datePresetLabel,
                    onClear: () {
                      setState(() {
                        _datePreset = _OrdersDatePreset.all;
                        _customRange = null;
                      });
                      _resetWindowsAndReload();
                    },
                  ),
              ],
            ),
          ],
          if (_showArchived) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Text(
                'Pedidos archivados: no cuentan en finanzas. Puedes recuperarlos o eliminarlos por completo.',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  height: 1.35,
                  color: const Color(0xFF64748B),
                ),
              ),
            ),
          ],
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
                    title: _showArchived
                        ? 'Sin archivados'
                        : _hasActiveFilters
                        ? 'Sin resultados'
                        : 'Sin pedidos',
                    subtitle: _showArchived
                        ? 'Aquí aparecerán los pedidos que archives.'
                        : _hasActiveFilters
                        ? 'Prueba limpiar los filtros o cambiar la búsqueda.'
                        : 'Cuando entren pedidos aparecerán aquí con su estado.',
                    icon: _showArchived
                        ? Icons.inventory_2_outlined
                        : Icons.receipt_long_outlined,
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

class _InboxSegment extends StatelessWidget {
  const _InboxSegment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Colors.white : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Center(
          child: Text(
            label,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: selected
                  ? const Color(0xFF111827)
                  : const Color(0xFF6B7280),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActiveFilterPill extends StatelessWidget {
  const _ActiveFilterPill({required this.label, required this.onClear});

  final String label;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(left: 10, right: 4, top: 4, bottom: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFF3F4F6),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: GoogleFonts.poppins(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: const Color(0xFF374151),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 28, height: 28),
            onPressed: onClear,
            icon: const Icon(Icons.close_rounded, size: 16),
          ),
        ],
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
                    child: Icon(
                      Icons.person_outline_rounded,
                      color: Color(0xFF6D28D9),
                    ),
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
    required this.menuOrders,
    required this.visits,
    required this.scans,
    required this.onCopy,
    required this.onDownloadQr,
    required this.onOpenUrl,
  });

  final String publicUrl;
  final String displayUrl;
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

  static const Color _ink = Color(0xFF111827);
  static const Color _muted = Color(0xFF6B7280);
  static const Color _bar = Color(0xFFC4B5FD);
  static const Color _barPeak = Color(0xFF4C1D95);
  static const Color _visitBar = Color(0xFFA5B4FC);
  static const Color _orderBar = Color(0xFF4338CA);

  @override
  Widget build(BuildContext context) {
    final peakHour = hourCounts.isEmpty
        ? 0
        : hourCounts.indexOf(hourCounts.reduce((a, b) => a >= b ? a : b));
    final maxCount = hourCounts.isEmpty
        ? 0
        : hourCounts.reduce((a, b) => a > b ? a : b);
    final totalHourOrders = hourCounts.fold<int>(0, (sum, n) => sum + n);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        salesCard,
        const SizedBox(height: 16),
        _visitsCard(analytics),
        const SizedBox(height: 16),
        _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Horas con más pedidos',
                style: GoogleFonts.poppins(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: _ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                maxCount == 0
                    ? 'Cuando haya pedidos en el rango elegido verás aquí las horas pico.'
                    : 'Pico a las ${peakHour.toString().padLeft(2, '0')}:00 · $totalHourOrders pedido${totalHourOrders == 1 ? '' : 's'} en el rango.',
                style: GoogleFonts.poppins(fontSize: 12.5, color: _muted),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 120,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    for (var hour = 0; hour < 24; hour++)
                      Expanded(
                        child: Tooltip(
                          message: maxCount == 0
                              ? '${hour.toString().padLeft(2, '0')}:00'
                              : '${hour.toString().padLeft(2, '0')}:00 · ${hourCounts[hour]}',
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 1),
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 220),
                                curve: Curves.easeOutCubic,
                                width: double.infinity,
                                height: maxCount == 0
                                    ? 6
                                    : (hourCounts[hour] == 0
                                          ? 6
                                          : 18 +
                                                (86 *
                                                    (hourCounts[hour] /
                                                        maxCount))),
                                decoration: BoxDecoration(
                                  color: maxCount == 0
                                      ? const Color(0xFFE5E7EB)
                                      : hour == peakHour
                                      ? _barPeak
                                      : hourCounts[hour] == 0
                                      ? const Color(0xFFEEF2FF)
                                      : _bar,
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  for (final label in const ['00', '06', '12', '18', '23'])
                    Text(
                      label,
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF9CA3AF),
                      ),
                    ),
                ],
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

  Widget _card({required Widget child}) {
    return Container(
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
      child: child,
    );
  }

  Widget _visitsCard(MenuAnalyticsSummary analytics) {
    final visitsSeries = analytics.visitsByDay;
    final ordersSeries = analytics.ordersByDay;
    final seriesMax = <int>[
      ...visitsSeries,
      ...ordersSeries,
      0,
    ].reduce((a, b) => a > b ? a : b);

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Visitas del menú',
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: _ink,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            analytics.hasTraffic
                ? 'Últimos 30 días en el menú público.'
                : 'Aún no hay tráfico registrado. Comparte el menú o el QR para empezar.',
            style: GoogleFonts.poppins(fontSize: 12.5, color: _muted),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _statTile(
                  value: _formatCount(analytics.visits),
                  label: 'Visitas',
                ),
              ),
              Expanded(
                child: _statTile(
                  value: _formatCount(analytics.scans),
                  label: 'Escaneos QR',
                ),
              ),
              Expanded(
                child: _statTile(
                  value: _formatCount(analytics.addToCart),
                  label: 'Al carrito',
                ),
              ),
              Expanded(
                child: _statTile(
                  value: analytics.visits <= 0
                      ? '—'
                      : '${analytics.conversion.toStringAsFixed(analytics.conversion % 1 == 0 ? 0 : 1)}%',
                  label: 'Conversión',
                ),
              ),
            ],
          ),
          if (analytics.hasTraffic) ...[
            const SizedBox(height: 14),
            _funnelRow('Productos vistos', analytics.productViews),
            _funnelRow('Checkout iniciado', analytics.checkouts),
            _funnelRow('Pedidos', analytics.orders),
            if (visitsSeries.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                'Visitas y pedidos · 7 días',
                style: GoogleFonts.poppins(fontSize: 12, color: _muted),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 84,
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
                                height: seriesMax == 0
                                    ? 6
                                    : 8 +
                                          (48 *
                                              (visitsSeries[i] / seriesMax)),
                                decoration: BoxDecoration(
                                  color: _visitBar,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                              const SizedBox(height: 3),
                              Container(
                                height: seriesMax == 0 ||
                                        i >= ordersSeries.length
                                    ? 4
                                    : 4 +
                                          (22 *
                                              (ordersSeries[i] / seriesMax)),
                                decoration: BoxDecoration(
                                  color: _orderBar,
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
                'Claro: visitas · Oscuro: pedidos',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  color: const Color(0xFF9CA3AF),
                ),
              ),
            ],
            if (analytics.topViewed.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text(
                'Productos más vistos',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                  color: _ink,
                ),
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
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
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
        ],
      ),
    );
  }

  String _formatCount(int value) => value <= 0 ? '0' : '$value';

  Widget _statTile({required String value, required String label}) {
    return Column(
      children: [
        Text(
          value,
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: _ink,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          textAlign: TextAlign.center,
          style: GoogleFonts.poppins(fontSize: 10.5, color: _muted, height: 1.2),
        ),
      ],
    );
  }

  Widget _funnelRow(String label, int value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            value == 0 ? '—' : '$value',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    );
  }
}

class MerchantSettingsHub extends StatelessWidget {
  const MerchantSettingsHub({
    super.key,
    required this.comercio,
    required this.planName,
    required this.hoursSubtitle,
    required this.accountEmail,
    required this.onOpenBusiness,
    required this.onOpenAppearance,
    required this.onOpenPayments,
    required this.onOpenOperations,
    required this.onOpenHours,
    required this.onOpenPlan,
    required this.onOpenUsers,
    required this.onOpenAccount,
    required this.onOpenKioskHome,
    required this.onOpenDelivery,
  });

  final ComercioModel comercio;
  final String planName;
  final String hoursSubtitle;
  final String accountEmail;
  final VoidCallback onOpenBusiness;
  final VoidCallback onOpenAppearance;
  final VoidCallback onOpenPayments;
  final VoidCallback onOpenOperations;
  final VoidCallback onOpenHours;
  final VoidCallback onOpenPlan;
  final VoidCallback onOpenUsers;
  final VoidCallback onOpenAccount;
  final VoidCallback onOpenKioskHome;
  final VoidCallback onOpenDelivery;

  @override
  Widget build(BuildContext context) {
    final cards =
        <({IconData icon, String title, String subtitle, VoidCallback onTap})>[
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
            icon: Icons.delivery_dining_outlined,
            title: 'Delivery',
            subtitle: 'Tarifas, zonas y delivery gratis',
            onTap: onOpenDelivery,
          ),
          (
            icon: Icons.payments_outlined,
            title: 'Cobros y tasa',
            subtitle: 'Monedas, tasa de cambio y métodos de pago',
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
            subtitle: 'Invita caja, cocina, marketing o mesero',
            onTap: onOpenUsers,
          ),
          (
            icon: Icons.manage_accounts_outlined,
            title: 'Cuenta',
            subtitle: accountEmail.trim().isEmpty ? '—' : accountEmail.trim(),
            onTap: onOpenAccount,
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
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: Color(0xFF9CA3AF),
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

class MerchantMarketingWorkspace extends StatefulWidget {
  const MerchantMarketingWorkspace({super.key});

  @override
  State<MerchantMarketingWorkspace> createState() =>
      _MerchantMarketingWorkspaceState();
}

class _MerchantMarketingWorkspaceState
    extends State<MerchantMarketingWorkspace> {
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
        client
            .from('comercios')
            .select('moneda')
            .eq('id', comercioId)
            .maybeSingle(),
      ]);
      if (!mounted) return;
      setState(() {
        _categories = (results[0] as List<dynamic>)
            .map(
              (row) =>
                  CategoryModel.fromMap(Map<String, dynamic>.from(row as Map)),
            )
            .toList(growable: false);
        _products = (results[1] as List<dynamic>)
            .map(
              (row) =>
                  ProductModel.fromMap(Map<String, dynamic>.from(row as Map)),
            )
            .toList(growable: false);
        final currency =
            (results[2] as Map?)?['moneda']?.toString().trim() ?? 'USD';
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
