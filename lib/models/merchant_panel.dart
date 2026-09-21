import 'package:kosmenu_app/models/pedido.dart';

class MerchantClient {
  const MerchantClient({
    required this.key,
    required this.name,
    required this.phone,
    required this.orders,
  });

  final String key;
  final String name;
  final String phone;
  final List<PedidoModel> orders;

  int get orderCount => orders.length;

  double get totalSpent => orders.fold<double>(
        0,
        (sum, pedido) => sum + (pedido.total ?? 0),
      );

  List<PedidoModel> get recentOrders {
    final copy = [...orders]
      ..sort((a, b) {
        final aDate = a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        final bDate = b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);
        return bDate.compareTo(aDate);
      });
    return copy;
  }

  static List<MerchantClient> fromOrders(Iterable<PedidoModel> orders) {
    final unique = <String, List<PedidoModel>>{};
    final names = <String, String>{};
    final phones = <String, String>{};

    for (final pedido in orders) {
      if (pedido.hasParseError) continue;
      final phone = (pedido.clientePhone ?? '').trim();
      final name = (pedido.nombreCliente ?? '').trim();
      final key = phone.isNotEmpty
          ? 'p:$phone'
          : (name.isNotEmpty ? 'n:${name.toLowerCase()}' : '');
      if (key.isEmpty) continue;
      unique.putIfAbsent(key, () => <PedidoModel>[]).add(pedido);
      if (name.isNotEmpty) names[key] = name;
      if (phone.isNotEmpty) phones[key] = phone;
    }

    final clients = unique.entries
        .map(
          (entry) => MerchantClient(
            key: entry.key,
            name: (names[entry.key] ?? '').trim().isEmpty
                ? 'Cliente'
                : names[entry.key]!.trim(),
            phone: phones[entry.key] ?? '',
            orders: entry.value,
          ),
        )
        .toList(growable: false)
      ..sort((a, b) => b.orderCount.compareTo(a.orderCount));
    return clients;
  }
}

class MenuAnalyticsTopViewed {
  const MenuAnalyticsTopViewed({
    required this.productId,
    required this.name,
    required this.views,
  });

  final String productId;
  final String name;
  final int views;
}

class MenuAnalyticsSummary {
  const MenuAnalyticsSummary({
    this.visits = 0,
    this.scans = 0,
    this.productViews = 0,
    this.addToCart = 0,
    this.checkouts = 0,
    this.orders = 0,
    this.conversion = 0,
    this.avgTicket = 0,
    this.repeatCustomers = 0,
    this.visitsByDay = const <int>[],
    this.ordersByDay = const <int>[],
    this.topViewed = const <MenuAnalyticsTopViewed>[],
  });

  final int visits;
  final int scans;
  final int productViews;
  final int addToCart;
  final int checkouts;
  final int orders;
  final double conversion;
  final double avgTicket;
  final int repeatCustomers;
  final List<int> visitsByDay;
  final List<int> ordersByDay;
  final List<MenuAnalyticsTopViewed> topViewed;

  bool get hasTraffic =>
      visits > 0 || scans > 0 || productViews > 0 || addToCart > 0;

  factory MenuAnalyticsSummary.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const MenuAnalyticsSummary();
    return MenuAnalyticsSummary(
      visits: _asInt(map['visits']),
      scans: _asInt(map['scans']),
      productViews: _asInt(map['product_views']),
      addToCart: _asInt(map['add_to_cart']),
      checkouts: _asInt(map['checkouts']),
      orders: _asInt(map['orders']),
      conversion: _asDouble(map['conversion']),
      avgTicket: _asDouble(map['avg_ticket']),
      repeatCustomers: _asInt(map['repeat_customers']),
      visitsByDay: _asDayCounts(map['visits_by_day']),
      ordersByDay: _asDayCounts(map['orders_by_day']),
      topViewed: _asTopViewed(map['top_viewed']),
    );
  }

  static int _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('$value') ?? 0;
  }

  static double _asDouble(dynamic value) {
    if (value is double) return value;
    if (value is num) return value.toDouble();
    return double.tryParse('$value') ?? 0;
  }

  static List<int> _asDayCounts(dynamic value) {
    if (value is! List) return const <int>[];
    return value.map((row) {
      if (row is Map) {
        return _asInt(row['count']);
      }
      return _asInt(row);
    }).toList(growable: false);
  }

  static List<MenuAnalyticsTopViewed> _asTopViewed(dynamic value) {
    if (value is! List) return const <MenuAnalyticsTopViewed>[];
    return value
        .whereType<Map>()
        .map((row) {
          final id = '${row['product_id'] ?? ''}';
          final name = '${row['name'] ?? ''}'.trim();
          return MenuAnalyticsTopViewed(
            productId: id,
            name: name.isEmpty ? 'Producto' : name,
            views: _asInt(row['views']),
          );
        })
        .where((row) => row.productId.isNotEmpty)
        .toList(growable: false);
  }
}

class AiCreditTransaction {
  const AiCreditTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.createdAt,
    this.reason,
    this.metadata = const <String, dynamic>{},
  });

  final String id;
  final String type;
  final double amount;
  final DateTime createdAt;
  final String? reason;
  final Map<String, dynamic> metadata;

  bool get isCredit => type == 'credit';

  String get title {
    final product = metadata['product_name']?.toString().trim() ?? '';
    switch (reason) {
      case 'ai_image_generation_queue':
      case 'ai_image_generation':
        return product.isEmpty ? 'Generación de foto' : 'Generación foto $product';
      case 'menu_generation':
        return 'Generación de menú con IA';
      case 'branding_generation':
        return 'Branding con IA';
      case 'category_emoji_suggestion':
        return 'Icono de categoría';
      case 'product_description':
      case 'generate_product_description':
        return product.isEmpty
            ? 'Descripción de producto'
            : 'Descripción $product';
      case 'initial_signup_credits':
        return 'Créditos de bienvenida';
      case 'ai_credit_topup':
        return 'Recarga';
      default:
        if ((reason ?? '').contains('refund')) return 'Reembolso';
        return isCredit ? 'Recarga' : 'Uso de créditos IA';
    }
  }

  factory AiCreditTransaction.fromMap(Map<String, dynamic> map) {
    final created = DateTime.tryParse('${map['created_at'] ?? ''}') ??
        DateTime.fromMillisecondsSinceEpoch(0);
    return AiCreditTransaction(
      id: '${map['id'] ?? ''}',
      type: '${map['type'] ?? 'debit'}',
      amount: map['amount'] is num
          ? (map['amount'] as num).toDouble()
          : double.tryParse('${map['amount'] ?? 0}') ?? 0,
      reason: map['reason']?.toString(),
      metadata: map['metadata'] is Map
          ? Map<String, dynamic>.from(map['metadata'] as Map)
          : const <String, dynamic>{},
      createdAt: created,
    );
  }
}

enum MerchantStaffRole { administrador, caja, cocina, marketing }

extension MerchantStaffRoleUi on MerchantStaffRole {
  String get label {
    switch (this) {
      case MerchantStaffRole.administrador:
        return 'Administrador';
      case MerchantStaffRole.caja:
        return 'Caja';
      case MerchantStaffRole.cocina:
        return 'Cocina';
      case MerchantStaffRole.marketing:
        return 'Marketing';
    }
  }

  String get hint {
    switch (this) {
      case MerchantStaffRole.administrador:
        return 'Puede gestionar todo el negocio';
      case MerchantStaffRole.caja:
        return 'Pedidos y clientes';
      case MerchantStaffRole.cocina:
        return 'Pedidos';
      case MerchantStaffRole.marketing:
        return 'Herramientas de venta y estadísticas';
    }
  }

  static MerchantStaffRole fromRaw(String? value) {
    switch ((value ?? '').trim().toLowerCase()) {
      case 'caja':
        return MerchantStaffRole.caja;
      case 'cocina':
        return MerchantStaffRole.cocina;
      case 'marketing':
        return MerchantStaffRole.marketing;
      default:
        return MerchantStaffRole.administrador;
    }
  }
}

class ComercioTeamMember {
  const ComercioTeamMember({
    required this.kind,
    required this.email,
    required this.role,
    required this.status,
    this.id,
    this.userId,
  });

  final String kind;
  final String? id;
  final String? userId;
  final String email;
  final MerchantStaffRole role;
  final String status;

  bool get isOwner => kind == 'owner';
  bool get isInvite => kind == 'invite';

  factory ComercioTeamMember.fromMap(Map<String, dynamic> map) {
    return ComercioTeamMember(
      kind: '${map['kind'] ?? 'member'}',
      id: map['id']?.toString(),
      userId: map['user_id']?.toString(),
      email: '${map['email'] ?? ''}',
      role: MerchantStaffRoleUi.fromRaw(map['role']?.toString()),
      status: '${map['status'] ?? 'active'}',
    );
  }
}
