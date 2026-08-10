class UpsellSettingsModel {
  final String? id;
  final String comercioId;
  final bool enabled;
  final bool showAddToCart;
  final bool showCart;
  final bool showCheckout;
  final int maxAddSuggestions;
  final int maxCartSuggestions;
  final int maxCheckoutSuggestions;
  final double? freeDeliveryThreshold;
  final List<String> freeDeliveryOrderTypes;

  const UpsellSettingsModel({
    this.id,
    required this.comercioId,
    this.enabled = true,
    this.showAddToCart = true,
    this.showCart = true,
    this.showCheckout = true,
    this.maxAddSuggestions = 2,
    this.maxCartSuggestions = 3,
    this.maxCheckoutSuggestions = 2,
    this.freeDeliveryThreshold,
    this.freeDeliveryOrderTypes = const ['delivery'],
  });

  factory UpsellSettingsModel.fromMap(Map<String, dynamic> map, {required String comercioId}) {
    final thresholdValue = map['free_delivery_threshold'];
    final orderTypesRaw = map['free_delivery_order_types'];
    return UpsellSettingsModel(
      id: map['id']?.toString(),
      comercioId: comercioId,
      enabled: map['enabled'] is bool ? map['enabled'] as bool : true,
      showAddToCart: map['show_add_to_cart'] is bool ? map['show_add_to_cart'] as bool : true,
      showCart: map['show_cart'] is bool ? map['show_cart'] as bool : true,
      showCheckout: map['show_checkout'] is bool ? map['show_checkout'] as bool : true,
      maxAddSuggestions: _asInt(map['max_add_suggestions'], 2),
      maxCartSuggestions: _asInt(map['max_cart_suggestions'], 3),
      maxCheckoutSuggestions: _asInt(map['max_checkout_suggestions'], 2),
      freeDeliveryThreshold: thresholdValue is num
          ? thresholdValue.toDouble()
          : double.tryParse('$thresholdValue'),
      freeDeliveryOrderTypes: orderTypesRaw is List
          ? orderTypesRaw.map((e) => e.toString()).toList()
          : const ['delivery'],
    );
  }

  static int _asInt(dynamic value, int fallback) {
    if (value is int) return value;
    return int.tryParse('$value') ?? fallback;
  }

  Map<String, dynamic> toMap() {
    return {
      'comercio_id': comercioId,
      'enabled': enabled,
      'show_add_to_cart': showAddToCart,
      'show_cart': showCart,
      'show_checkout': showCheckout,
      'max_add_suggestions': maxAddSuggestions,
      'max_cart_suggestions': maxCartSuggestions,
      'max_checkout_suggestions': maxCheckoutSuggestions,
      'free_delivery_threshold': freeDeliveryThreshold,
      'free_delivery_order_types': freeDeliveryOrderTypes,
    };
  }

  UpsellSettingsModel copyWith({
    bool? enabled,
    bool? showAddToCart,
    bool? showCart,
    bool? showCheckout,
    int? maxAddSuggestions,
    int? maxCartSuggestions,
    int? maxCheckoutSuggestions,
    double? freeDeliveryThreshold,
    bool clearFreeDeliveryThreshold = false,
    List<String>? freeDeliveryOrderTypes,
  }) {
    return UpsellSettingsModel(
      id: id,
      comercioId: comercioId,
      enabled: enabled ?? this.enabled,
      showAddToCart: showAddToCart ?? this.showAddToCart,
      showCart: showCart ?? this.showCart,
      showCheckout: showCheckout ?? this.showCheckout,
      maxAddSuggestions: maxAddSuggestions ?? this.maxAddSuggestions,
      maxCartSuggestions: maxCartSuggestions ?? this.maxCartSuggestions,
      maxCheckoutSuggestions: maxCheckoutSuggestions ?? this.maxCheckoutSuggestions,
      freeDeliveryThreshold: clearFreeDeliveryThreshold
          ? null
          : (freeDeliveryThreshold ?? this.freeDeliveryThreshold),
      freeDeliveryOrderTypes: freeDeliveryOrderTypes ?? this.freeDeliveryOrderTypes,
    );
  }
}
