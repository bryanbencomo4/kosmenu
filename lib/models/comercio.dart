class ComercioModel {
  final String id;
  final String nombre;
  final String? whatsapp;
  final bool? creadoPorIa;
  final double? confianzaIa;

  const ComercioModel({
    required this.id,
    required this.nombre,
    this.whatsapp,
    this.creadoPorIa,
    this.confianzaIa,
  });

  factory ComercioModel.fromMap(Map<String, dynamic> map) {
    final confianzaValue = map['confianza_ia'];

    return ComercioModel(
      id: map['id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? 'Comercio',
      whatsapp: map['whatsapp']?.toString(),
      creadoPorIa: map['creado_por_ia'] as bool?,
      confianzaIa: confianzaValue is num
          ? confianzaValue.toDouble()
          : double.tryParse('${map['confianza_ia']}'),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'nombre': nombre,
      'whatsapp': whatsapp,
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
    };
  }
}
