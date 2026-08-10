class BundleItemModel {
  final String? id;
  final String productId;
  final int quantity;
  final bool required;

  const BundleItemModel({
    this.id,
    required this.productId,
    this.quantity = 1,
    this.required = true,
  });

  factory BundleItemModel.fromMap(Map<String, dynamic> map) {
    return BundleItemModel(
      id: map['id']?.toString(),
      productId: map['product_id']?.toString() ?? '',
      quantity: map['quantity'] is int ? map['quantity'] as int : int.tryParse('${map['quantity']}') ?? 1,
      required: map['required'] is bool ? map['required'] as bool : true,
    );
  }

  Map<String, dynamic> toMap(String bundleId) {
    return {
      'bundle_id': bundleId,
      'product_id': productId,
      'quantity': quantity,
      'required': required,
    };
  }
}

class BundleModel {
  final String? id;
  final String comercioId;
  final String name;
  final String? description;
  final double bundlePrice;
  final bool enabled;
  final List<BundleItemModel> items;

  const BundleModel({
    this.id,
    required this.comercioId,
    required this.name,
    this.description,
    required this.bundlePrice,
    this.enabled = true,
    this.items = const [],
  });

  factory BundleModel.fromMap(
    Map<String, dynamic> map, {
    List<BundleItemModel> items = const [],
  }) {
    final priceValue = map['bundle_price'];
    return BundleModel(
      id: map['id']?.toString(),
      comercioId: map['comercio_id']?.toString() ?? '',
      name: map['name']?.toString() ?? '',
      description: map['description']?.toString(),
      bundlePrice: priceValue is num ? priceValue.toDouble() : double.tryParse('$priceValue') ?? 0,
      enabled: map['enabled'] is bool ? map['enabled'] as bool : true,
      items: items,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'comercio_id': comercioId,
      'name': name,
      'description': description,
      'pricing_type': 'fixed',
      'bundle_price': bundlePrice,
      'enabled': enabled,
    };
  }

  double normalPrice(Map<String, double> priceByProductId) {
    return items.fold<double>(0, (sum, item) {
      final price = priceByProductId[item.productId] ?? 0;
      return sum + price * item.quantity;
    });
  }
}
