import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum OrderGateTarget { app, publicApp, deniedApp, web }

class OrderGateDecision {
  const OrderGateDecision({
    required this.target,
    required this.orderId,
    required this.fallbackUri,
    required this.reason,
    this.comercioId,
  });

  final OrderGateTarget target;
  final String orderId;
  final Uri fallbackUri;
  final String reason;
  final String? comercioId;
}

class OrderGateHandler {
  const OrderGateHandler();

  static const Duration _lookupTimeout = Duration(seconds: 5);

  static String? extractOrderId(Uri uri) {
    final segments = uri.pathSegments.where((segment) => segment.isNotEmpty).toList();
    final host = uri.host.trim().toLowerCase();
    final scheme = uri.scheme.trim().toLowerCase();

    if (scheme == 'kosmenu' && (host == 'order' || host == 'orders') && segments.isNotEmpty) {
      return Uri.decodeComponent(segments.first).trim();
    }

    if (segments.length >= 2 && (segments.first == 'orders' || segments.first == 'order')) {
      return Uri.decodeComponent(segments[1]).trim();
    }

    if (segments.length >= 4 &&
        segments.first == 'v' &&
        (segments[2] == 'orders' || segments[2] == 'order')) {
      return Uri.decodeComponent(segments[3]).trim();
    }

    return null;
  }

  Future<OrderGateDecision> resolve(String orderId) async {
    final normalizedOrderId = orderId.trim();
    final fallbackUri = Uri.parse(
      AppLinks.orderDetailsById(normalizedOrderId, forceWebView: true),
    );

    if (normalizedOrderId.isEmpty) {
      return _fallbackToWeb(
        orderId: normalizedOrderId,
        fallbackUri: fallbackUri,
        reason: 'missing-order-id',
      );
    }

    final client = Supabase.instance.client;
    final currentUser = client.auth.currentUser;

    if (currentUser == null) {
      return OrderGateDecision(
        target: OrderGateTarget.publicApp,
        orderId: normalizedOrderId,
        fallbackUri: fallbackUri,
        reason: 'no-session',
      );
    }

    try {
      final pedidoComercioId = await _loadPedidoComercioId(client, normalizedOrderId)
          .timeout(_lookupTimeout);
      if (pedidoComercioId.isEmpty) {
        return _fallbackToWeb(
          orderId: normalizedOrderId,
          fallbackUri: fallbackUri,
          reason: 'pedido-not-found',
        );
      }

      if (pedidoComercioId == currentUser.id ||
          pedidoComercioId == SupabaseConfig.currentComercioId) {
        SupabaseConfig.setCurrentComercioId(pedidoComercioId);
        return OrderGateDecision(
          target: OrderGateTarget.app,
          orderId: normalizedOrderId,
          fallbackUri: fallbackUri,
          reason: 'direct-match',
          comercioId: pedidoComercioId,
        );
      }

      final ownerId = await _loadComercioOwnerId(client, pedidoComercioId)
          .timeout(_lookupTimeout);
      if (ownerId == currentUser.id) {
        SupabaseConfig.setCurrentComercioId(pedidoComercioId);
        return OrderGateDecision(
          target: OrderGateTarget.app,
          orderId: normalizedOrderId,
          fallbackUri: fallbackUri,
          reason: 'owner-match',
          comercioId: pedidoComercioId,
        );
      }

      return OrderGateDecision(
        target: OrderGateTarget.deniedApp,
        orderId: normalizedOrderId,
        fallbackUri: fallbackUri,
        reason: 'wrong-account',
        comercioId: pedidoComercioId,
      );
    } catch (_) {
      return _fallbackToWeb(
        orderId: normalizedOrderId,
        fallbackUri: fallbackUri,
        reason: 'lookup-timeout-or-error',
      );
    }
  }

  OrderGateDecision _fallbackToWeb({
    required String orderId,
    required Uri fallbackUri,
    required String reason,
    String? comercioId,
  }) {
    return OrderGateDecision(
      target: OrderGateTarget.web,
      orderId: orderId,
      fallbackUri: fallbackUri,
      reason: reason,
      comercioId: comercioId,
    );
  }

  Future<String> _loadPedidoComercioId(SupabaseClient client, String orderId) async {
    final derivedComercioId = _extractComercioId(orderId);
    dynamic query = client.from('pedidos').select('comercio_id, detalles, created_at');

    if (derivedComercioId != null && derivedComercioId.isNotEmpty) {
      query = query.eq('comercio_id', derivedComercioId);
    }

    final rows = await query.order('created_at', ascending: false).limit(50);

    for (final row in rows as List<dynamic>) {
      final map = _asMap(row);
      final detalles = _asMap(map['detalles']);
      final nestedOrderId = detalles['order_id']?.toString().trim() ?? '';

      if (nestedOrderId == orderId) {
        return map['comercio_id']?.toString().trim() ?? '';
      }
    }

    return '';
  }

  Future<String> _loadComercioOwnerId(SupabaseClient client, String comercioId) async {
    final row = await client
        .from('comercios')
        .select('owner_id')
        .eq('id', comercioId)
        .limit(1)
        .maybeSingle();

    final map = _asMap(row);
    return map['owner_id']?.toString().trim() ?? '';
  }

  String? _extractComercioId(String orderId) {
    final match = RegExp(r'^(.*)-(\d{10,})$').firstMatch(orderId);
    return match?.group(1)?.trim();
  }

  Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return <String, dynamic>{};
  }
}