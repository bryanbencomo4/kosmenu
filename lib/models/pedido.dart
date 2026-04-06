import 'dart:convert';
import 'dart:developer' as developer;

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
  final String? deliveryMode;
  final String? deliveryAddress;
  final String? deliveryReference;
  final String? deliveryInstructions;
  final double? deliveryLatitude;
  final double? deliveryLongitude;
  final String? orderNotes;
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
    this.deliveryMode,
    this.deliveryAddress,
    this.deliveryReference,
    this.deliveryInstructions,
    this.deliveryLatitude,
    this.deliveryLongitude,
    this.orderNotes,
    this.items = const <PedidoItemModel>[],
    this.detalles = const <String, dynamic>{},
  });

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    developer.log(
      'DEBUG: Llaves encontradas en el mapa: ${map.keys.toList()}',
      name: 'PedidoModel',
    );
    final totalValue = map['total'];
    final createdAtValue = map['created_at']?.toString();
    final confianzaValue = map['confianza_ia'];
    final detallesMap = _asMap(map['detalles']);
    final deliveryMap = _asMap(detallesMap['delivery']);
    final orderItems = _asItems(detallesMap['items']);
    final paymentMethod = _resolveMetodoPago(detallesMap['metodo_pago']);
    double? deliveryLatitude;
    double? deliveryLongitude;
    try {
      deliveryLatitude = _resolveDeliveryLatitude(
        map: map,
        detallesMap: detallesMap,
        deliveryMap: deliveryMap,
      );
      deliveryLongitude = _resolveDeliveryLongitude(
        map: map,
        detallesMap: detallesMap,
        deliveryMap: deliveryMap,
      );
    } catch (error) {
      developer.log(
        'DEBUG: Error parseando coordenadas de pedido: $error',
        name: 'PedidoModel',
      );
      developer.log('DEBUG: JSON Crudo de Supabase: $map', name: 'PedidoModel');
    }

    return PedidoModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      orderId: _resolveOrderId(detallesMap),
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
      deliveryMode: _asTrimmedString(deliveryMap['mode']),
      deliveryAddress: _asTrimmedString(deliveryMap['address']),
      deliveryReference: _asTrimmedString(deliveryMap['reference']),
      deliveryInstructions: _asTrimmedString(deliveryMap['instructions']),
      deliveryLatitude: deliveryLatitude,
      deliveryLongitude: deliveryLongitude,
      orderNotes: _asTrimmedString(detallesMap['order_notes']),
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
      'delivery_latitude': deliveryLatitude,
      'delivery_longitude': deliveryLongitude,
      'detalles': {
        ...detalles,
        'order_id': orderId,
        'cliente_email': clienteEmail,
        'metodo_pago': metodoPago,
        'order_notes': orderNotes,
        'delivery_latitude': deliveryLatitude,
        'delivery_longitude': deliveryLongitude,
        'delivery': {
          'mode': deliveryMode,
          'address': deliveryAddress,
          'reference': deliveryReference,
          'instructions': deliveryInstructions,
          'lat': deliveryLatitude,
          'lng': deliveryLongitude,
          'latitude': deliveryLatitude,
          'longitude': deliveryLongitude,
          'coordinates': {'lat': deliveryLatitude, 'lng': deliveryLongitude},
        },
        'items': items.map((item) => item.toMap()).toList(),
        'total': total,
      },
    };
  }

  static String? _resolveOrderId(Map<String, dynamic> detallesMap) {
    final candidates = <dynamic>[
      detallesMap['order_id'],
      detallesMap['codigo_orden'],
      detallesMap['orderId'],
      detallesMap['codigoOrden'],
    ];

    for (final candidate in candidates) {
      final resolved = _asTrimmedString(candidate);
      if (resolved != null) return resolved;
    }

    return null;
  }

  static String? _asTrimmedString(dynamic value) {
    if (value == null) return null;
    final trimmed = value.toString().trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static double? _toDoubleOrNull(dynamic value) {
    if (value is num) return value.toDouble();
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return null;
    return double.tryParse(raw.replaceAll(',', '.'));
  }

  static Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    if (value is String) {
      final trimmed = value.trim();
      if (trimmed.isEmpty) return <String, dynamic>{};
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map<String, dynamic>) return decoded;
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {
        return <String, dynamic>{};
      }
    }
    return <String, dynamic>{};
  }

  static List<PedidoItemModel> _asItems(dynamic value) {
    if (value is! List) return const <PedidoItemModel>[];

    return value.map((item) => PedidoItemModel.fromMap(_asMap(item))).toList();
  }

  static double? _resolveDeliveryLatitude({
    required Map<String, dynamic> map,
    required Map<String, dynamic> detallesMap,
    required Map<String, dynamic> deliveryMap,
  }) {
    final coordinatesMap = _asMap(deliveryMap['coordinates']);
    final candidates = <dynamic>[
      map['delivery_latitude'],
      map['delivery_lat'],
      map['latitud_delivery'],
      map['delivery_latitud'],
      map['latitude'],
      map['latitud'],
      detallesMap['delivery_latitude'],
      detallesMap['delivery_lat'],
      detallesMap['latitud_delivery'],
      detallesMap['delivery_latitud'],
      deliveryMap['lat'],
      deliveryMap['latitude'],
      deliveryMap['latitud'],
      coordinatesMap['lat'],
      coordinatesMap['latitude'],
      coordinatesMap['latitud'],
    ];

    for (final candidate in candidates) {
      final parsed = _toDoubleOrNull(candidate);
      if (parsed != null) return parsed;
    }

    return null;
  }

  static double? _resolveDeliveryLongitude({
    required Map<String, dynamic> map,
    required Map<String, dynamic> detallesMap,
    required Map<String, dynamic> deliveryMap,
  }) {
    final coordinatesMap = _asMap(deliveryMap['coordinates']);
    final candidates = <dynamic>[
      map['delivery_longitude'],
      map['delivery_lng'],
      map['longitud_delivery'],
      map['delivery_longitud'],
      map['longitude'],
      map['longitud'],
      detallesMap['delivery_longitude'],
      detallesMap['delivery_lng'],
      detallesMap['longitud_delivery'],
      detallesMap['delivery_longitud'],
      deliveryMap['lng'],
      deliveryMap['longitude'],
      deliveryMap['longitud'],
      coordinatesMap['lng'],
      coordinatesMap['longitude'],
      coordinatesMap['longitud'],
    ];

    for (final candidate in candidates) {
      final parsed = _toDoubleOrNull(candidate);
      if (parsed != null) return parsed;
    }

    return null;
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
  final String? imageUrl;

  const PedidoItemModel({
    required this.nombre,
    required this.cantidad,
    required this.precio,
    this.imageUrl,
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
      imageUrl: _resolveImageUrl(map),
    );
  }

  static String? _resolveImageUrl(Map<String, dynamic> map) {
    const keys = <String>[
      'imagen_url',
      'image_url',
      'foto_url',
      'imagen',
      'foto',
    ];

    for (final key in keys) {
      final value = map[key]?.toString().trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }

    return null;
  }

  Map<String, dynamic> toMap() {
    return {
      'nombre': nombre,
      'cantidad': cantidad,
      'precio': precio,
      'imagen_url': imageUrl,
    };
  }
}
