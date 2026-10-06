class PreCheckoutUpsellRule {
  const PreCheckoutUpsellRule({
    this.categoriaId,
    this.categoriaOrigen,
    this.sugerirTipos = const [],
  });

  final String? categoriaId;
  final String? categoriaOrigen;
  final List<String> sugerirTipos;

  factory PreCheckoutUpsellRule.fromMap(Map<String, dynamic> map) {
    final rawTipos = map['sugerir_tipos'] ?? map['sugerir'] ?? map['tipos'];
    return PreCheckoutUpsellRule(
      categoriaId: map['categoria_id']?.toString(),
      categoriaOrigen: map['categoria_origen']?.toString(),
      sugerirTipos: rawTipos is List
          ? rawTipos.map((item) => item.toString()).where(PreCheckoutUpsellConfig.isKind).toList()
          : const [],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (categoriaId != null && categoriaId!.trim().isNotEmpty) 'categoria_id': categoriaId,
      if (categoriaOrigen != null && categoriaOrigen!.trim().isNotEmpty)
        'categoria_origen': categoriaOrigen,
      'sugerir_tipos': sugerirTipos,
    };
  }
}

class PreCheckoutListedCategory {
  const PreCheckoutListedCategory({required this.id, required this.tipo});

  final String id;
  final String tipo;

  Map<String, dynamic> toMap() => {'id': id, 'tipo': tipo};
}

class PreCheckoutUpsellConfig {
  const PreCheckoutUpsellConfig({
    this.activo = false,
    this.tipos = defaultTipos,
    this.maxProductos = 4,
    this.reglas = const [],
    this.categorias = const [],
  });

  static const defaultTipos = ['bebida', 'postre', 'acompanamiento'];
  static const kinds = ['bebida', 'postre', 'acompanamiento', 'otro'];

  final bool activo;
  final List<String> tipos;
  final int maxProductos;
  final List<PreCheckoutUpsellRule> reglas;
  final List<PreCheckoutListedCategory> categorias;

  static bool isKind(String value) => kinds.contains(value);

  static String kindLabel(String kind) {
    switch (kind) {
      case 'bebida':
        return 'Bebidas';
      case 'postre':
        return 'Postres';
      case 'acompanamiento':
        return 'Complementos';
      case 'otro':
        return 'Otro';
      default:
        return 'Normal';
    }
  }

  /// Maps categorias.rol <-> tipo_upselling without using display names.
  static String? rolFromKind(String? kind) {
    switch (kind) {
      case 'bebida':
        return 'drink';
      case 'postre':
        return 'dessert';
      case 'acompanamiento':
        return 'side';
      case 'otro':
        return 'other';
      default:
        return null;
    }
  }

  static String? kindFromRol(String? rol) {
    switch (rol) {
      case 'drink':
      case 'bebida':
        return 'bebida';
      case 'dessert':
      case 'postre':
        return 'postre';
      case 'side':
      case 'acompanamiento':
        return 'acompanamiento';
      case 'other':
      case 'otro':
        return 'otro';
      default:
        return null;
    }
  }

  factory PreCheckoutUpsellConfig.fromUpsellConfig(dynamic raw) {
    if (raw is! Map) return const PreCheckoutUpsellConfig();
    final root = Map<String, dynamic>.from(raw);
    if (root['upselling'] == false && root['pre_checkout'] == null) {
      return const PreCheckoutUpsellConfig();
    }
    final nested = root['pre_checkout'] is Map
        ? Map<String, dynamic>.from(root['pre_checkout'] as Map)
        : root['upselling'] is Map
        ? Map<String, dynamic>.from(root['upselling'] as Map)
        : root['activo'] != null || root['tipos'] != null
        ? root
        : null;
    if (nested == null) return const PreCheckoutUpsellConfig();
    final rawTipos = nested['tipos'];
    final tipos = rawTipos is List
        ? rawTipos.map((item) => item.toString()).where(isKind).toList()
        : defaultTipos;
    final rawMax = nested['max_productos'] ?? nested['maxProductos'] ?? nested['max'];
    final max = rawMax is num ? rawMax.toInt() : int.tryParse('$rawMax') ?? 4;
    final rawReglas = nested['reglas'] ?? nested['rules'];
    final rawCategorias = nested['categorias'];
    return PreCheckoutUpsellConfig(
      activo: nested['activo'] == true || nested['enabled'] == true,
      tipos: tipos.isEmpty ? defaultTipos : tipos,
      maxProductos: max.clamp(1, 48),
      reglas: rawReglas is List
          ? rawReglas
                .whereType<Map>()
                .map((item) => PreCheckoutUpsellRule.fromMap(Map<String, dynamic>.from(item)))
                .where((rule) => rule.sugerirTipos.isNotEmpty)
                .toList()
          : const [],
      categorias: rawCategorias is List
          ? rawCategorias
                .whereType<Map>()
                .map((item) {
                  final row = Map<String, dynamic>.from(item);
                  final id = (row['id'] ?? row['categoria_id'])?.toString() ?? '';
                  final tipo = kindFromRol(row['tipo']?.toString() ?? row['rol']?.toString()) ??
                      (isKind('${row['tipo']}') ? row['tipo'].toString() : null);
                  return id.isEmpty || tipo == null
                      ? null
                      : PreCheckoutListedCategory(id: id, tipo: tipo);
                })
                .whereType<PreCheckoutListedCategory>()
                .toList()
          : const [],
    );
  }

  Map<String, dynamic> toPreCheckoutMap() {
    return {
      'activo': activo,
      'tipos': tipos,
      'max_productos': maxProductos,
      'reglas': reglas.map((rule) => rule.toMap()).toList(),
      'categorias': categorias.map((item) => item.toMap()).toList(),
    };
  }

  Map<String, dynamic> mergeIntoUpsellConfig(Map<String, dynamic>? existing) {
    final next = Map<String, dynamic>.from(existing ?? const {});
    next['pre_checkout'] = toPreCheckoutMap();
    next['upselling'] = activo;
    return next;
  }

  PreCheckoutUpsellConfig copyWith({
    bool? activo,
    List<String>? tipos,
    int? maxProductos,
    List<PreCheckoutUpsellRule>? reglas,
    List<PreCheckoutListedCategory>? categorias,
  }) {
    return PreCheckoutUpsellConfig(
      activo: activo ?? this.activo,
      tipos: tipos ?? this.tipos,
      maxProductos: maxProductos ?? this.maxProductos,
      reglas: reglas ?? this.reglas,
      categorias: categorias ?? this.categorias,
    );
  }
}
