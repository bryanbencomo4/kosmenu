class UpsellConfigModel {
  static const String modeAuto = 'auto';
  static const String modeCustom = 'custom';
  static const String modeOff = 'off';

  final int schemaVersion;
  final String mode;
  final List<String> comboProductIds;
  final List<String> crossSellProductIds;
  final double? freeDeliveryThreshold;
  final bool showProductNudges;

  const UpsellConfigModel({
    this.schemaVersion = 1,
    this.mode = modeAuto,
    this.comboProductIds = const <String>[],
    this.crossSellProductIds = const <String>[],
    this.freeDeliveryThreshold,
    this.showProductNudges = true,
  });

  factory UpsellConfigModel.fromDynamic(dynamic raw) {
    if (raw == null) {
      return const UpsellConfigModel();
    }

    Map<String, dynamic>? map;
    if (raw is Map<String, dynamic>) {
      map = raw;
    } else if (raw is Map) {
      map = Map<String, dynamic>.from(raw);
    }

    if (map == null) {
      return const UpsellConfigModel();
    }

    final mode = _normalizeMode(map['mode']);
    final thresholdValue = map['free_delivery_threshold'];
    double? threshold;
    if (thresholdValue is num) {
      threshold = thresholdValue.toDouble();
    } else if (thresholdValue != null) {
      threshold = double.tryParse('$thresholdValue');
    }
    if (threshold != null && threshold <= 0) {
      threshold = null;
    }

    return UpsellConfigModel(
      schemaVersion: map['schema_version'] is int
          ? map['schema_version'] as int
          : int.tryParse('${map['schema_version']}') ?? 1,
      mode: mode,
      comboProductIds: _asIdList(map['combo_product_ids']),
      crossSellProductIds: _asIdList(map['cross_sell_product_ids']),
      freeDeliveryThreshold: threshold,
      showProductNudges: map['show_product_nudges'] != false,
    );
  }

  UpsellConfigModel copyWith({
    int? schemaVersion,
    String? mode,
    List<String>? comboProductIds,
    List<String>? crossSellProductIds,
    double? freeDeliveryThreshold,
    bool clearFreeDeliveryThreshold = false,
    bool? showProductNudges,
  }) {
    return UpsellConfigModel(
      schemaVersion: schemaVersion ?? this.schemaVersion,
      mode: mode ?? this.mode,
      comboProductIds: comboProductIds ?? this.comboProductIds,
      crossSellProductIds: crossSellProductIds ?? this.crossSellProductIds,
      freeDeliveryThreshold: clearFreeDeliveryThreshold
          ? null
          : (freeDeliveryThreshold ?? this.freeDeliveryThreshold),
      showProductNudges: showProductNudges ?? this.showProductNudges,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'schema_version': schemaVersion,
      'mode': mode,
      'combo_product_ids': comboProductIds,
      'cross_sell_product_ids': crossSellProductIds,
      'free_delivery_threshold': freeDeliveryThreshold,
      'show_product_nudges': showProductNudges,
    };
  }

  static String _normalizeMode(dynamic value) {
    final raw = value?.toString().trim().toLowerCase() ?? '';
    if (raw == modeCustom || raw == modeOff || raw == modeAuto) {
      return raw;
    }
    return modeAuto;
  }

  static List<String> _asIdList(dynamic value) {
    if (value is! List) return const <String>[];
    final seen = <String>{};
    final out = <String>[];
    for (final item in value) {
      final id = item?.toString().trim() ?? '';
      if (id.isEmpty || seen.contains(id)) continue;
      seen.add(id);
      out.add(id);
    }
    return out;
  }
}

class UpsellBadge {
  static const String masPedido = 'mas_pedido';
  static const String mejorValor = 'mejor_valor';
  static const String ahorra = 'ahorra';

  static const List<String> values = <String>[
    masPedido,
    mejorValor,
    ahorra,
  ];

  static String? normalize(dynamic value) {
    final raw = value?.toString().trim().toLowerCase() ?? '';
    if (raw.isEmpty) return null;
    if (values.contains(raw)) return raw;
    return null;
  }

  static String label(String? value) {
    switch (value) {
      case masPedido:
        return 'Más pedido';
      case mejorValor:
        return 'Mejor valor';
      case ahorra:
        return 'Ahorra';
      default:
        return 'Sin badge';
    }
  }
}
