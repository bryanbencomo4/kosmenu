class ProductModel {
  final String id;
  final String comercioId;
  final String categoriaId;
  final String nombre;
  final double precio;
  final String descripcion;
  final bool? creadoPorIa;
  final double? confianzaIa;

  const ProductModel({
    required this.id,
    required this.comercioId,
    required this.categoriaId,
    required this.nombre,
    required this.precio,
    required this.descripcion,
    this.creadoPorIa,
    this.confianzaIa,
  });

  factory ProductModel.fromMap(Map<String, dynamic> map) {
    final precioValue = map['precio'];
    final confianzaValue = map['confianza_ia'];

    return ProductModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      categoriaId: map['categoria_id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? '',
      precio: precioValue is num
          ? precioValue.toDouble()
          : double.tryParse('${map['precio']}') ?? 0,
      descripcion: map['descripcion']?.toString() ?? '',
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
      'categoria_id': categoriaId,
      'nombre': nombre,
      'precio': precio,
      'descripcion': descripcion,
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
    };
  }
}
