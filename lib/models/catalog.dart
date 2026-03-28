class CatalogModel {
  final String id;
  final String comercioId;
  final String nombre;
  final int orden;
  final bool activo;

  const CatalogModel({
    required this.id,
    required this.comercioId,
    required this.nombre,
    required this.orden,
    this.activo = true,
  });

  factory CatalogModel.fromMap(Map<String, dynamic> map) {
    final ordenValue = map['orden'];

    return CatalogModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? '',
      orden: ordenValue is int ? ordenValue : int.tryParse('$ordenValue') ?? 0,
      activo: map['activo'] is bool ? map['activo'] as bool : true,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'comercio_id': comercioId,
      'nombre': nombre,
      'orden': orden,
      'activo': activo,
    };
  }
}
