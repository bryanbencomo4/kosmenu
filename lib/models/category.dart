class CategoryModel {
  final String id;
  final String comercioId;
  final String? catalogoId;
  final String nombre;
  final int orden;
  final bool activo;
  final String? icono;
  final bool? creadoPorIa;
  final double? confianzaIa;
  final String? rol;

  const CategoryModel({
    required this.id,
    required this.comercioId,
    this.catalogoId,
    required this.nombre,
    required this.orden,
    this.activo = true,
    this.icono,
    this.creadoPorIa,
    this.confianzaIa,
    this.rol,
  });

  /// Roles used for cold-start cross-sell templates.
  static const List<String> roles = [
    'main',
    'drink',
    'side',
    'dessert',
    'extra',
    'combo',
    'other',
  ];

  static String roleLabel(String? role) {
    switch (role) {
      case 'main':
        return 'Plato principal';
      case 'drink':
        return 'Bebida';
      case 'side':
        return 'Acompañante';
      case 'dessert':
        return 'Postre';
      case 'extra':
        return 'Extra';
      case 'combo':
        return 'Combo';
      case 'other':
        return 'Otro';
      default:
        return 'Sin definir';
    }
  }

  factory CategoryModel.fromMap(Map<String, dynamic> map) {
    final ordenValue = map['orden'];
    final confianzaValue = map['confianza_ia'];

    return CategoryModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      catalogoId: map['catalogo_id']?.toString(),
      nombre: map['nombre']?.toString() ?? '',
      orden: ordenValue is int ? ordenValue : int.tryParse('$ordenValue') ?? 0,
      activo: map['activo'] is bool ? map['activo'] as bool : true,
      icono: map['icono']?.toString(),
      creadoPorIa: map['creado_por_ia'] as bool?,
      confianzaIa: confianzaValue is num
          ? confianzaValue.toDouble()
          : double.tryParse('${map['confianza_ia']}'),
      rol: map['rol']?.toString(),
    );
  }

  factory CategoryModel.fromJson(Map<String, dynamic> json) {
    return CategoryModel.fromMap(json);
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'comercio_id': comercioId,
      'catalogo_id': catalogoId,
      'nombre': nombre,
      'orden': orden,
      'activo': activo,
      'icono': icono,
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
      'rol': rol,
    };
  }

  CategoryModel copyWith({String? rol, bool clearRol = false}) {
    return CategoryModel(
      id: id,
      comercioId: comercioId,
      catalogoId: catalogoId,
      nombre: nombre,
      orden: orden,
      activo: activo,
      icono: icono,
      creadoPorIa: creadoPorIa,
      confianzaIa: confianzaIa,
      rol: clearRol ? null : (rol ?? this.rol),
    );
  }

  Map<String, dynamic> toJson() {
    return toMap();
  }
}

typedef Category = CategoryModel;
