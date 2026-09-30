import 'dart:math';

/// Option groups live in `productos.opciones_menu.grupos` (jsonb). The public
/// menu (`site/app/_lib/menu-product-options.ts`) applies the same
/// normalization, so keep both parsers in sync.
enum ProductOptionGroupType { unica, multiple }

final RegExp _optionIdPattern = RegExp(r'^[A-Za-z0-9_-]{1,64}$');
final Random _random = Random();

String generateProductOptionId(String prefix) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  final suffix = List.generate(
    8,
    (_) => alphabet[_random.nextInt(alphabet.length)],
  ).join();
  return '${prefix}_$suffix';
}

double _toPrice(dynamic value) {
  final parsed = value is num ? value.toDouble() : double.tryParse('$value');
  if (parsed == null || !parsed.isFinite || parsed < 0) return 0;
  return (parsed * 100).roundToDouble() / 100;
}

int? _toInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('$value');
}

class ProductOptionPriceRule {
  final String grupo;
  final String opcion;
  final double precio;

  const ProductOptionPriceRule({
    required this.grupo,
    required this.opcion,
    required this.precio,
  });

  static ProductOptionPriceRule? fromMap(dynamic raw, {String? ownerOptionId}) {
    if (raw is! Map) return null;
    final cuando = raw['cuando'] is Map ? raw['cuando'] as Map : raw;
    final grupo = cuando['grupo']?.toString().trim() ?? '';
    final opcion = cuando['opcion']?.toString().trim() ?? '';
    if (!_optionIdPattern.hasMatch(grupo) || !_optionIdPattern.hasMatch(opcion)) {
      return null;
    }
    if (ownerOptionId != null && opcion == ownerOptionId) return null;
    return ProductOptionPriceRule(
      grupo: grupo,
      opcion: opcion,
      precio: _toPrice(raw['precio']),
    );
  }

  Map<String, dynamic> toMap() => {
    'cuando': {'grupo': grupo, 'opcion': opcion},
    'precio': precio,
  };
}

class ProductOptionChoice {
  final String id;
  final String nombre;
  final double precio;
  final bool activo;
  final bool predeterminada;
  final bool textoLibre;
  final List<ProductOptionPriceRule> reglasPrecio;

  const ProductOptionChoice({
    required this.id,
    required this.nombre,
    this.precio = 0,
    this.activo = true,
    this.predeterminada = false,
    this.textoLibre = false,
    this.reglasPrecio = const [],
  });

  static ProductOptionChoice? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final id = raw['id']?.toString().trim() ?? '';
    final nombre = raw['nombre']?.toString().trim() ?? '';
    if (!_optionIdPattern.hasMatch(id) || nombre.isEmpty) return null;
    final rawRules = raw['reglas_precio'];
    return ProductOptionChoice(
      id: id,
      nombre: nombre,
      precio: _toPrice(raw['precio'] ?? raw['precio_base']),
      activo: raw['activo'] is bool ? raw['activo'] as bool : true,
      predeterminada: raw['predeterminada'] == true,
      textoLibre: raw['texto_libre'] == true,
      reglasPrecio: [
        if (rawRules is List)
          for (final entry in rawRules)
            ?ProductOptionPriceRule.fromMap(entry, ownerOptionId: id),
      ],
    );
  }

  Map<String, dynamic> toMap() => {
    'id': id,
    'nombre': nombre,
    'precio': precio,
    if (reglasPrecio.isNotEmpty) 'precio_base': precio,
    'activo': activo,
    if (predeterminada) 'predeterminada': true,
    if (textoLibre) 'texto_libre': true,
    if (reglasPrecio.isNotEmpty)
      'reglas_precio': reglasPrecio.map((rule) => rule.toMap()).toList(),
  };

  ProductOptionChoice copyWith({
    String? nombre,
    double? precio,
    bool? activo,
    bool? predeterminada,
    bool? textoLibre,
    List<ProductOptionPriceRule>? reglasPrecio,
  }) {
    return ProductOptionChoice(
      id: id,
      nombre: nombre ?? this.nombre,
      precio: precio ?? this.precio,
      activo: activo ?? this.activo,
      predeterminada: predeterminada ?? this.predeterminada,
      textoLibre: textoLibre ?? this.textoLibre,
      reglasPrecio: reglasPrecio ?? this.reglasPrecio,
    );
  }
}

class ProductOptionGroup {
  final String id;
  final String nombre;
  final ProductOptionGroupType tipo;
  final bool obligatorio;
  final int min;
  final int max;
  final List<ProductOptionChoice> opciones;

  const ProductOptionGroup({
    required this.id,
    required this.nombre,
    this.tipo = ProductOptionGroupType.unica,
    this.obligatorio = false,
    this.min = 0,
    this.max = 1,
    this.opciones = const [],
  });

  bool get isSingle => tipo == ProductOptionGroupType.unica;

  /// Keeps inactive options so the admin can re-enable them later; the public
  /// menu hides them.
  static ProductOptionGroup? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final id = raw['id']?.toString().trim() ?? '';
    final nombre = raw['nombre']?.toString().trim() ?? '';
    if (!_optionIdPattern.hasMatch(id) || nombre.isEmpty) return null;
    final rawOptions = raw['opciones'];
    final seen = <String>{};
    final opciones = <ProductOptionChoice>[
      if (rawOptions is List)
        for (final entry in rawOptions)
          if (ProductOptionChoice.fromMap(entry) case final option?)
            if (seen.add(option.id)) option,
    ];
    return ProductOptionGroup(
      id: id,
      nombre: nombre,
      tipo: raw['tipo']?.toString() == 'multiple'
          ? ProductOptionGroupType.multiple
          : ProductOptionGroupType.unica,
      obligatorio: raw['obligatorio'] == true,
      min: _toInt(raw['min']) ?? 0,
      max: _toInt(raw['max']) ?? 1,
      opciones: opciones,
    ).normalized();
  }

  /// Same rules as the public menu: single choice means max 1, max is clamped
  /// to the number of options, required means min >= 1 and min <= max.
  ProductOptionGroup normalized() {
    final optionCount = opciones.length;
    final upper = optionCount < 1 ? 1 : optionCount;
    var nextMax = isSingle ? 1 : max.clamp(1, upper);
    var nextMin = obligatorio ? (min < 1 ? 1 : min) : 0;
    if (nextMin > nextMax) nextMin = nextMax;
    return ProductOptionGroup(
      id: id,
      nombre: nombre,
      tipo: tipo,
      obligatorio: nextMin > 0,
      min: nextMin,
      max: nextMax,
      opciones: opciones,
    );
  }

  Map<String, dynamic> toMap() {
    final value = normalized();
    return {
      'id': value.id,
      'nombre': value.nombre,
      'tipo': value.isSingle ? 'unica' : 'multiple',
      'obligatorio': value.obligatorio,
      'min': value.min,
      'max': value.max,
      'opciones': value.opciones.map((option) => option.toMap()).toList(),
    };
  }

  ProductOptionGroup copyWith({
    String? nombre,
    ProductOptionGroupType? tipo,
    bool? obligatorio,
    int? min,
    int? max,
    List<ProductOptionChoice>? opciones,
  }) {
    return ProductOptionGroup(
      id: id,
      nombre: nombre ?? this.nombre,
      tipo: tipo ?? this.tipo,
      obligatorio: obligatorio ?? this.obligatorio,
      min: min ?? this.min,
      max: max ?? this.max,
      opciones: opciones ?? this.opciones,
    );
  }

  static List<ProductOptionGroup> listFromMenuOptions(
    Map<String, dynamic>? opcionesMenu,
  ) {
    final raw = opcionesMenu?['grupos'];
    if (raw is! List) return const [];
    final seen = <String>{};
    return [
      for (final entry in raw)
        if (fromMap(entry) case final group?)
          if (seen.add(group.id)) group,
    ];
  }

  /// Groups only apply when the merchant switched them on for this product;
  /// the public menu and the order API check the same flag.
  static bool isEnabled(Map<String, dynamic>? opcionesMenu) =>
      opcionesMenu?['activadas'] == true;

  /// Replaces only `activadas`/`grupos`, keeping legacy keys (`tamanos`,
  /// `ajustes`, ...). Switching off keeps the groups so they can be re-enabled.
  /// Returns null when nothing is left so the column goes back to NULL.
  static Map<String, dynamic>? mergeIntoMenuOptions(
    Map<String, dynamic>? current,
    List<ProductOptionGroup> groups, {
    required bool enabled,
  }) {
    final next = <String, dynamic>{...?current}
      ..remove('grupos')
      ..remove('activadas');
    final serialized = groups
        .where((group) => group.opciones.isNotEmpty)
        .map((group) => group.toMap())
        .toList();
    if (serialized.isNotEmpty) {
      next['activadas'] = enabled;
      next['grupos'] = serialized;
    }
    return next.isEmpty ? null : next;
  }
}
