import 'package:kosmenu_app/models/pedido.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Server-side order reads for dashboard sections that need more history
/// than the realtime window (sales ranges, clients, totals).
class MerchantOrdersRepository {
  const MerchantOrdersRepository._();

  /// PostgREST caps responses at 1000 rows by default.
  static const int _pageSize = 1000;
  static const int _maxPages = 50;

  /// Only the fields the clients list/profile read, projected out of
  /// `detalles` so the full JSON payload is not downloaded.
  static const String _clientSummaryColumns =
      'id,comercio_id,estado,total,created_at,nombre_cliente,'
      'telefono_cliente,cliente_email,'
      'd_order_id:detalles->>order_id,'
      'd_codigo_orden:detalles->>codigo_orden,'
      'd_nombre_cliente:detalles->>nombre_cliente,'
      'd_telefono_cliente:detalles->>telefono_cliente,'
      'd_total:detalles->>total,'
      'd_delegate_status:detalles->delivery_delegate->>status,'
      'd_management_mode:detalles->>management_mode';

  static const String _metricsSummaryColumns =
      '$_clientSummaryColumns,costo_delivery,'
      'd_items:detalles->items,'
      'd_base_currency:detalles->>moneda_base,'
      'd_checkout_currency:detalles->>moneda_checkout,'
      'd_exchange_rate:detalles->>tasa_cambio_snapshot,'
      'd_checkout_total:detalles->>total_moneda_checkout,'
      'd_checkout_subtotal:detalles->>subtotal_moneda_checkout,'
      'd_checkout_delivery:detalles->>costo_delivery_moneda_checkout';

  static SupabaseClient get _client => Supabase.instance.client;

  static List<PedidoModel> mergeMetricsOrders({
    required Iterable<PedidoModel> fetched,
    required Iterable<PedidoModel> live,
    required DateTime startInclusive,
    required DateTime endExclusive,
    required DateTime todayStart,
    required DateTime tomorrow,
  }) {
    final byId = <String, PedidoModel>{};
    for (final pedido in fetched.followedBy(live)) {
      final createdAt = pedido.createdAt;
      if (pedido.hasParseError || createdAt == null) continue;
      final inRange =
          !createdAt.isBefore(startInclusive) &&
          createdAt.isBefore(endExclusive);
      final inToday =
          !createdAt.isBefore(todayStart) && createdAt.isBefore(tomorrow);
      if (inRange || inToday) byId[pedido.id] = pedido;
    }
    return byId.values.toList(growable: false);
  }

  static Future<List<PedidoModel>> fetchBetween({
    required String comercioId,
    required DateTime startInclusive,
    required DateTime endExclusive,
  }) async {
    final rows = await _fetchAllPages(
      (from, to) => _client
          .from('pedidos')
          .select(_metricsSummaryColumns)
          .eq('comercio_id', comercioId)
          .gte('created_at', startInclusive.toUtc().toIso8601String())
          .lt('created_at', endExclusive.toUtc().toIso8601String())
          .order('created_at', ascending: false)
          .order('id', ascending: false)
          .range(from, to),
    );
    return _parse(rows.map(_expandMetricsSummary));
  }

  static Future<List<PedidoModel>> fetchClientSummaries({
    required String comercioId,
  }) async {
    final rows = await _fetchAllPages(
      (from, to) => _client
          .from('pedidos')
          .select(_clientSummaryColumns)
          .eq('comercio_id', comercioId)
          .order('created_at', ascending: false)
          .order('id', ascending: false)
          .range(from, to),
    );
    return _parse(rows.map(_expandClientSummary));
  }

  static Future<DateTime?> fetchEarliestCreatedAt({
    required String comercioId,
  }) async {
    final row = await _client
        .from('pedidos')
        .select('created_at')
        .eq('comercio_id', comercioId)
        .order('created_at', ascending: true)
        .limit(1)
        .maybeSingle();
    final raw = row?['created_at']?.toString();
    if (raw == null || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }

  static Future<int> countOrders({required String comercioId}) async {
    final response = await _client
        .from('pedidos')
        .select('id')
        .eq('comercio_id', comercioId)
        .limit(1)
        .count(CountOption.exact);
    return response.count;
  }

  static Future<List<Map<String, dynamic>>> _fetchAllPages(
    PostgrestTransformBuilder<List<Map<String, dynamic>>> Function(
      int from,
      int to,
    )
    buildPage,
  ) async {
    final rows = <Map<String, dynamic>>[];
    for (var page = 0; page < _maxPages; page++) {
      final from = page * _pageSize;
      final batch = await buildPage(from, from + _pageSize - 1);
      rows.addAll(batch);
      if (batch.length < _pageSize) break;
    }
    return rows;
  }

  static Map<String, dynamic> _expandClientSummary(Map<String, dynamic> row) {
    final delegateStatus = row['d_delegate_status'];
    return <String, dynamic>{
      'id': row['id'],
      'comercio_id': row['comercio_id'],
      'estado': row['estado'],
      'total': row['total'],
      'created_at': row['created_at'],
      'nombre_cliente': row['nombre_cliente'],
      'telefono_cliente': row['telefono_cliente'],
      'cliente_email': row['cliente_email'],
      'detalles': <String, dynamic>{
        'management_mode': row['d_management_mode'],
        'order_id': ?row['d_order_id'],
        'codigo_orden': ?row['d_codigo_orden'],
        'nombre_cliente': ?row['d_nombre_cliente'],
        'telefono_cliente': ?row['d_telefono_cliente'],
        'total': ?row['d_total'],
        if (delegateStatus != null)
          'delivery_delegate': <String, dynamic>{'status': delegateStatus},
      },
    };
  }

  static Map<String, dynamic> _expandMetricsSummary(Map<String, dynamic> row) {
    final summary = _expandClientSummary(row);
    return <String, dynamic>{
      ...summary,
      'costo_delivery': row['costo_delivery'],
      'detalles': <String, dynamic>{
        ...Map<String, dynamic>.from(summary['detalles'] as Map),
        'items': row['d_items'],
        'moneda_base': row['d_base_currency'],
        'moneda_checkout': row['d_checkout_currency'],
        'tasa_cambio_snapshot': row['d_exchange_rate'],
        'total_moneda_checkout': row['d_checkout_total'],
        'subtotal_moneda_checkout': row['d_checkout_subtotal'],
        'costo_delivery_moneda_checkout': row['d_checkout_delivery'],
      },
    };
  }

  static List<PedidoModel> _parse(Iterable<Map<String, dynamic>> rows) {
    return rows
        .map(PedidoModel.fromMap)
        .where((pedido) => !pedido.hasParseError)
        .toList(growable: false);
  }
}
