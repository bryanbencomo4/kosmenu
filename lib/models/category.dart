class CategoryModel {
  final String id;
  final String comercioId;
  final String nombre;
  final int orden;
  final String? icono;
  final bool? creadoPorIa;
  final double? confianzaIa;

  const CategoryModel({
    required this.id,
    required this.comercioId,
    required this.nombre,
    required this.orden,
    this.icono,
    this.creadoPorIa,
    this.confianzaIa,
  });

  factory CategoryModel.fromMap(Map<String, dynamic> map) {
    final ordenValue = map['orden'];
    final confianzaValue = map['confianza_ia'];

    return CategoryModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? '',
      orden: ordenValue is int ? ordenValue : int.tryParse('$ordenValue') ?? 0,
      icono: map['icono']?.toString(),
      creadoPorIa: map['creado_por_ia'] as bool?,
      confianzaIa: confianzaValue is num
          ? confianzaValue.toDouble()
          : double.tryParse('${map['confianza_ia']}'),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'comercio_id': comercioId,
      'nombre': nombre,
      'orden': orden,
      'icono': icono,
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
    };
  }
}

typedef Category = CategoryModel;
