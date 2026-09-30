class DeliveryDistanceConfig {
  final double basePrice;
  final double includedKm;
  final double extraPricePerKm;

  const DeliveryDistanceConfig({
    this.basePrice = 0,
    this.includedKm = 0,
    this.extraPricePerKm = 0,
  });

  Map<String, dynamic> toJson() => {
        'base_price': basePrice,
        'included_km': includedKm,
        'extra_price_per_km': extraPricePerKm,
      };
}

class DeliveryZone {
  final String name;
  final double minDistance;
  final double maxDistance;
  final double price;

  const DeliveryZone({
    this.name = 'Zona',
    this.minDistance = 0,
    this.maxDistance = 0,
    this.price = 0,
  });

  DeliveryZone copyWith({
    String? name,
    double? minDistance,
    double? maxDistance,
    double? price,
  }) {
    return DeliveryZone(
      name: name ?? this.name,
      minDistance: minDistance ?? this.minDistance,
      maxDistance: maxDistance ?? this.maxDistance,
      price: price ?? this.price,
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name,
        'min_distance': minDistance,
        'max_distance': maxDistance,
        'price': price,
      };
}

class DeliveryConfig {
  static const pricingFixed = 'fixed';
  static const pricingDistance = 'distance';
  static const pricingZones = 'zones';
  static const pricingFree = 'free';

  final bool enabled;
  final String pricingType;
  final double fixedPrice;
  final DeliveryDistanceConfig distance;
  final List<DeliveryZone> zones;
  final bool freeDeliveryEnabled;
  final double freeDeliveryMinimum;
  final double minOrder;
  final int preparationMinutes;
  final int deliveryMinutes;
  final String customMessage;

  const DeliveryConfig({
    this.enabled = false,
    this.pricingType = pricingFixed,
    this.fixedPrice = 0,
    this.distance = const DeliveryDistanceConfig(),
    this.zones = const [],
    this.freeDeliveryEnabled = false,
    this.freeDeliveryMinimum = 0,
    this.minOrder = 0,
    this.preparationMinutes = 20,
    this.deliveryMinutes = 30,
    this.customMessage = '',
  });

  static bool _readBool(dynamic value, bool fallback) {
    if (value is bool) return value;
    if (value == 1 || value == '1' || value == 'true') return true;
    if (value == 0 || value == '0' || value == 'false') return false;
    return fallback;
  }

  static double _readNumber(dynamic value, double fallback) {
    if (value is num) return value.toDouble();
    return double.tryParse('${value ?? ''}') ?? fallback;
  }

  static double _nonNegative(dynamic value, double fallback) {
    final n = _readNumber(value, fallback);
    return n.isNaN || n.isNegative ? 0 : n;
  }

  static Map<String, dynamic> _asMap(dynamic raw) {
    if (raw is Map) return Map<String, dynamic>.from(raw);
    return const {};
  }

  static String _pricingType(dynamic raw) {
    final value = '${raw ?? ''}'.trim().toLowerCase();
    if (value == pricingDistance ||
        value == pricingZones ||
        value == pricingFree ||
        value == pricingFixed) {
      return value;
    }
    return pricingFixed;
  }

  factory DeliveryConfig.fromConfigNegocio(dynamic raw) {
    final root = _asMap(raw);
    final nested = _asMap(root['delivery_config']).isNotEmpty
        ? _asMap(root['delivery_config'])
        : _asMap(root['delivery_tarifas']).isNotEmpty
            ? _asMap(root['delivery_tarifas'])
            : root;
    final distance = _asMap(nested['distance_config']).isNotEmpty
        ? _asMap(nested['distance_config'])
        : _asMap(nested['distance']);
    final free = _asMap(nested['free_delivery']).isNotEmpty
        ? _asMap(nested['free_delivery'])
        : _asMap(nested['freeDelivery']);
    final times = _asMap(nested['estimated_times']).isNotEmpty
        ? _asMap(nested['estimated_times'])
        : _asMap(nested['estimatedTimes']);
    final zonesRaw = nested['zones'];
    final zones = zonesRaw is List
        ? zonesRaw
            .whereType<Map>()
            .map((item) {
              final row = Map<String, dynamic>.from(item);
              return DeliveryZone(
                name: (row['name'] ?? 'Zona').toString().trim().isEmpty
                    ? 'Zona'
                    : (row['name'] ?? 'Zona').toString().trim(),
                minDistance: _nonNegative(row['min_distance'] ?? row['minDistance'], 0),
                maxDistance: _nonNegative(row['max_distance'] ?? row['maxDistance'], 0),
                price: _nonNegative(row['price'], 0),
              );
            })
            .toList()
        : const <DeliveryZone>[];

    return DeliveryConfig(
      enabled: _readBool(nested['enabled'], false),
      pricingType: _pricingType(nested['pricing_type'] ?? nested['pricingType']),
      fixedPrice: _nonNegative(nested['fixed_price'] ?? nested['fixedPrice'], 0),
      distance: DeliveryDistanceConfig(
        basePrice: _nonNegative(distance['base_price'] ?? distance['basePrice'], 0),
        includedKm: _nonNegative(distance['included_km'] ?? distance['includedKm'], 0),
        extraPricePerKm: _nonNegative(
          distance['extra_price_per_km'] ?? distance['extraPricePerKm'],
          0,
        ),
      ),
      zones: zones,
      freeDeliveryEnabled: _readBool(free['enabled'], false),
      freeDeliveryMinimum: _nonNegative(free['minimum_order'] ?? free['minimumOrder'], 0),
      minOrder: _nonNegative(nested['min_order'] ?? nested['minOrder'], 0),
      preparationMinutes: _nonNegative(
        times['preparation_minutes'] ?? times['preparationMinutes'],
        20,
      ).round(),
      deliveryMinutes: _nonNegative(
        times['delivery_minutes'] ?? times['deliveryMinutes'],
        30,
      ).round(),
      customMessage: (nested['custom_message'] ?? nested['customMessage'] ?? '')
          .toString()
          .trim(),
    );
  }

  Map<String, dynamic> mergeIntoConfigNegocio(Map<String, dynamic> existing) {
    final next = Map<String, dynamic>.from(existing);
    next['delivery_config'] = toJson();
    next.remove('delivery_tarifas');
    return next;
  }

  List<String> validate() {
    final errors = <String>[];
    if (fixedPrice < 0 || distance.basePrice < 0 || distance.extraPricePerKm < 0) {
      errors.add('Los precios no pueden ser negativos.');
    }
    if (pricingType == pricingZones) {
      if (zones.isEmpty) {
        errors.add('Agrega al menos una zona con precio.');
      }
      for (var i = 0; i < zones.length; i++) {
        final zone = zones[i];
        if (zone.maxDistance <= zone.minDistance) {
          errors.add('La zona ${i + 1} tiene un rango inválido.');
        }
        if (zone.price < 0) {
          errors.add('La zona ${i + 1} no puede tener precio negativo.');
        }
      }
    }
    if (freeDeliveryEnabled && freeDeliveryMinimum <= 0) {
      errors.add('Indica el monto mínimo para delivery gratis.');
    }
    return errors;
  }

  String get pricingLabel {
    switch (pricingType) {
      case pricingDistance:
        return 'Por distancia';
      case pricingZones:
        return 'Por zonas';
      case pricingFree:
        return 'Gratis';
      default:
        return 'Precio fijo';
    }
  }

  String summary() {
    if (!enabled) return 'Delivery inactivo. El checkout no cambia.';
    final parts = <String>['Delivery activo', 'Método: $pricingLabel'];
    if (pricingType == pricingFixed) {
      parts.add('Precio: $fixedPrice');
    } else if (pricingType == pricingDistance) {
      parts.add('Base: ${distance.basePrice}');
      parts.add('Incluye: ${distance.includedKm} km');
      parts.add('Extra: ${distance.extraPricePerKm}/km');
    } else if (pricingType == pricingZones) {
      parts.add('${zones.length} zona${zones.length == 1 ? '' : 's'}');
    }
    if (freeDeliveryEnabled) {
      parts.add('Gratis desde $freeDeliveryMinimum');
    }
    return parts.join('\n');
  }

  DeliveryConfig copyWith({
    bool? enabled,
    String? pricingType,
    double? fixedPrice,
    DeliveryDistanceConfig? distance,
    List<DeliveryZone>? zones,
    bool? freeDeliveryEnabled,
    double? freeDeliveryMinimum,
    double? minOrder,
    int? preparationMinutes,
    int? deliveryMinutes,
    String? customMessage,
  }) {
    return DeliveryConfig(
      enabled: enabled ?? this.enabled,
      pricingType: pricingType ?? this.pricingType,
      fixedPrice: fixedPrice ?? this.fixedPrice,
      distance: distance ?? this.distance,
      zones: zones ?? this.zones,
      freeDeliveryEnabled: freeDeliveryEnabled ?? this.freeDeliveryEnabled,
      freeDeliveryMinimum: freeDeliveryMinimum ?? this.freeDeliveryMinimum,
      minOrder: minOrder ?? this.minOrder,
      preparationMinutes: preparationMinutes ?? this.preparationMinutes,
      deliveryMinutes: deliveryMinutes ?? this.deliveryMinutes,
      customMessage: customMessage ?? this.customMessage,
    );
  }

  Map<String, dynamic> toJson() => {
        'enabled': enabled,
        'pricing_type': pricingType,
        'fixed_price': fixedPrice,
        'distance_config': distance.toJson(),
        'zones': zones.map((zone) => zone.toJson()).toList(),
        'free_delivery': {
          'enabled': freeDeliveryEnabled,
          'minimum_order': freeDeliveryMinimum,
        },
        'min_order': minOrder,
        'estimated_times': {
          'preparation_minutes': preparationMinutes,
          'delivery_minutes': deliveryMinutes,
        },
        'custom_message': customMessage,
        'version': 1,
      };
}
