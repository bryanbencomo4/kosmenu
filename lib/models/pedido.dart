class PedidoModel {
  final String id;
  final String comercioId;
  final String? estado;
  final double? total;
  final DateTime? createdAt;
  final bool? creadoPorIa;
  final double? confianzaIa;

  const PedidoModel({
    required this.id,
    required this.comercioId,
    this.estado,
    this.total,
    this.createdAt,
    this.creadoPorIa,
    this.confianzaIa,
  });

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    final totalValue = map['total'];
    final createdAtValue = map['created_at']?.toString();
    final confianzaValue = map['confianza_ia'];

    return PedidoModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      estado: map['estado']?.toString(),
      total: totalValue is num
          ? totalValue.toDouble()
          : double.tryParse('${map['total']}'),
      createdAt: createdAtValue == null || createdAtValue.isEmpty
          ? null
          : DateTime.tryParse(createdAtValue),
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
      'estado': estado,
      'total': total,
      'created_at': createdAt?.toIso8601String(),
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
    };
  }
}
