class UpsellRuleTarget {
  final String? id;
  final String targetType; // product | category
  final String? productId;
  final String? categoryId;
  final int position;
  final bool enabled;

  const UpsellRuleTarget({
    this.id,
    required this.targetType,
    this.productId,
    this.categoryId,
    this.position = 0,
    this.enabled = true,
  });

  factory UpsellRuleTarget.fromMap(Map<String, dynamic> map) {
    return UpsellRuleTarget(
      id: map['id']?.toString(),
      targetType: map['target_type']?.toString() ?? 'product',
      productId: map['product_id']?.toString(),
      categoryId: map['category_id']?.toString(),
      position: map['position'] is int ? map['position'] as int : int.tryParse('${map['position']}') ?? 0,
      enabled: map['enabled'] is bool ? map['enabled'] as bool : true,
    );
  }

  Map<String, dynamic> toMap(String ruleId) {
    return {
      'rule_id': ruleId,
      'target_type': targetType,
      'product_id': targetType == 'product' ? productId : null,
      'category_id': targetType == 'category' ? categoryId : null,
      'position': position,
      'enabled': enabled,
    };
  }
}

class UpsellRuleModel {
  static const surfaceAddToCart = 'add_to_cart';
  static const surfaceCart = 'cart';
  static const surfaceCheckout = 'checkout';

  final String? id;
  final String comercioId;
  final String name;
  final bool enabled;
  final String triggerType; // product | category | cart
  final String? triggerProductId;
  final String? triggerCategoryId;
  final int triggerMinQty;
  final String surface;
  final String priority; // low | normal | high
  final double? minCartAmount;
  final double? maxCartAmount;
  final String? orderType; // null = both
  final int maxSuggestions;
  final List<UpsellRuleTarget> targets;

  const UpsellRuleModel({
    this.id,
    required this.comercioId,
    required this.name,
    this.enabled = true,
    required this.triggerType,
    this.triggerProductId,
    this.triggerCategoryId,
    this.triggerMinQty = 1,
    this.surface = surfaceAddToCart,
    this.priority = 'normal',
    this.minCartAmount,
    this.maxCartAmount,
    this.orderType,
    this.maxSuggestions = 2,
    this.targets = const [],
  });

  factory UpsellRuleModel.fromMap(
    Map<String, dynamic> map, {
    List<UpsellRuleTarget> targets = const [],
  }) {
    final minCart = map['min_cart_amount'];
    final maxCart = map['max_cart_amount'];
    return UpsellRuleModel(
      id: map['id']?.toString(),
      comercioId: map['comercio_id']?.toString() ?? '',
      name: map['name']?.toString() ?? '',
      enabled: map['enabled'] is bool ? map['enabled'] as bool : true,
      triggerType: map['trigger_type']?.toString() ?? 'product',
      triggerProductId: map['trigger_product_id']?.toString(),
      triggerCategoryId: map['trigger_category_id']?.toString(),
      triggerMinQty: map['trigger_min_qty'] is int
          ? map['trigger_min_qty'] as int
          : int.tryParse('${map['trigger_min_qty']}') ?? 1,
      surface: map['surface']?.toString() ?? surfaceAddToCart,
      priority: map['priority']?.toString() ?? 'normal',
      minCartAmount: minCart is num ? minCart.toDouble() : double.tryParse('$minCart'),
      maxCartAmount: maxCart is num ? maxCart.toDouble() : double.tryParse('$maxCart'),
      orderType: map['order_type']?.toString(),
      maxSuggestions: map['max_suggestions'] is int
          ? map['max_suggestions'] as int
          : int.tryParse('${map['max_suggestions']}') ?? 2,
      targets: targets,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'comercio_id': comercioId,
      'name': name,
      'enabled': enabled,
      'trigger_type': triggerType,
      'trigger_product_id': triggerType == 'product' ? triggerProductId : null,
      'trigger_category_id': triggerType == 'category' ? triggerCategoryId : null,
      'trigger_min_qty': triggerMinQty,
      'surface': surface,
      'priority': priority,
      'min_cart_amount': minCartAmount,
      'max_cart_amount': maxCartAmount,
      'order_type': orderType,
      'max_suggestions': maxSuggestions,
    };
  }

  static String surfaceLabel(String surface) {
    switch (surface) {
      case surfaceCart:
        return 'En el carrito';
      case surfaceCheckout:
        return 'Antes de pagar';
      default:
        return 'Al agregar al carrito';
    }
  }

  static String priorityLabel(String priority) {
    switch (priority) {
      case 'low':
        return 'Baja';
      case 'high':
        return 'Alta';
      default:
        return 'Normal';
    }
  }
}
