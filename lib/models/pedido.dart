class PedidoModel {
  final String id;
  final String comercioId;
  final String? orderId;
  final String? clienteEmail;
  final String? estado;
  final double? total;
  final DateTime? createdAt;
  final bool? creadoPorIa;
  final double? confianzaIa;
  final String? metodoPago;
  final List<PedidoItemModel> items;
  final Map<String, dynamic> detalles;

  const PedidoModel({
    required this.id,
    required this.comercioId,
    this.orderId,
    this.clienteEmail,
    this.estado,
    this.total,
    this.createdAt,
    this.creadoPorIa,
    this.confianzaIa,
    this.metodoPago,
    this.items = const <PedidoItemModel>[],
    this.detalles = const <String, dynamic>{},
  });

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    final totalValue = map['total'];
    final createdAtValue = map['created_at']?.toString();
    final confianzaValue = map['confianza_ia'];
    final detallesMap = _asMap(map['detalles']);
    final orderItems = _asItems(detallesMap['items']);
    final paymentMethod = _resolveMetodoPago(detallesMap['metodo_pago']);

    return PedidoModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      orderId: detallesMap['order_id']?.toString(),
      clienteEmail:
          map['cliente_email']?.toString() ??
          detallesMap['cliente_email']?.toString(),
      estado: map['estado']?.toString(),
      total: _toDouble(detallesMap['total']) > 0
          ? _toDouble(detallesMap['total'])
          : (totalValue is num
                ? totalValue.toDouble()
                : double.tryParse('${map['total']}')),
      createdAt: createdAtValue == null || createdAtValue.isEmpty
          ? null
          : DateTime.tryParse(createdAtValue),
      creadoPorIa: map['creado_por_ia'] as bool?,
      confianzaIa: confianzaValue is num
          ? confianzaValue.toDouble()
          : double.tryParse('${map['confianza_ia']}'),
      metodoPago: paymentMethod,
      items: orderItems,
      detalles: detallesMap,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'comercio_id': comercioId,
      'cliente_email': clienteEmail,
      'estado': estado,
      'total': total,
      'created_at': createdAt?.toIso8601String(),
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
      'detalles': {
        ...detalles,
        'order_id': orderId,
        'cliente_email': clienteEmail,
        'metodo_pago': metodoPago,
        'items': items.map((item) => item.toMap()).toList(),
        'total': total,
      },
    };
  }

  static Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
  }

  static List<PedidoItemModel> _asItems(dynamic value) {
    if (value is! List) return const <PedidoItemModel>[];

    return value
        .map(
          (item) => PedidoItemModel.fromMap(
            _asMap(item),
          ),
        )
        .toList();
  }

  static String? _resolveMetodoPago(dynamic value) {
    if (value == null) return null;
    if (value is String) {
      final trimmed = value.trim();
      return trimmed.isEmpty ? null : trimmed;
    }

    final map = _asMap(value);
    final candidates = <String?>[
      map['nombre']?.toString(),
      map['tipo']?.toString(),
      map['banco']?.toString(),
      map['alias']?.toString(),
    ];

    for (final candidate in candidates) {
      final trimmed = candidate?.trim() ?? '';
      if (trimmed.isNotEmpty) return trimmed;
    }

    return null;
  }

  static double _toDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0.0;
  }
}

class PedidoItemModel {
  final String nombre;
  final int cantidad;
  final double precio;

  const PedidoItemModel({
    required this.nombre,
    required this.cantidad,
    required this.precio,
  });

  double get total => cantidad * precio;

  factory PedidoItemModel.fromMap(Map<String, dynamic> map) {
    final rawCantidad = map['cantidad'];
    final rawPrecio = map['precio'];

    return PedidoItemModel(
      nombre: (map['nombre']?.toString().trim() ?? '').isEmpty
          ? 'Producto'
          : map['nombre']!.toString().trim(),
      cantidad: rawCantidad is num
          ? rawCantidad.toInt()
          : int.tryParse(rawCantidad?.toString() ?? '') ?? 1,
      precio: rawPrecio is num
          ? rawPrecio.toDouble()
          : double.tryParse(rawPrecio?.toString() ?? '') ?? 0.0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'nombre': nombre,
      'cantidad': cantidad,
      'precio': precio,
    };
  }
}
