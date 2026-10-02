import 'dart:convert';
import 'dart:developer' as developer;

class PedidoModel {
  final String id;
  final String comercioId;
  final String? orderId;
  final String? nombreCliente;
  final String? clienteEmail;
  final String? clientePhone;
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
  final double? costoDelivery;
  final List<PedidoItemModel> items;
  final Map<String, dynamic> detalles;
  final bool hasParseError;
  final String? parseErrorMessage;

  /// Opaque storage ref (`storage://comprobantes/...`) or legacy URL from detalles.
  String? get comprobanteRef {
    final raw = detalles['comprobante_url']?.toString().trim() ?? '';
    return raw.isEmpty ? null : raw;
  }

  bool get hasComprobante => comprobanteRef != null;

  String? get paymentReference => _asTrimmedString(detalles['referencia_pago']);

  String? get merchantOrderNotes => _resolveOrderNotes(orderNotes);

  String? get checkoutCurrencySnapshot =>
      _asTrimmedString(detalles['moneda_checkout'])?.toUpperCase();

  double? get checkoutTotalSnapshot =>
      _toDoubleOrNull(detalles['total_moneda_checkout']);

  double? get checkoutSubtotalSnapshot =>
      _toDoubleOrNull(detalles['subtotal_moneda_checkout']);

  double? get checkoutDeliverySnapshot =>
      _toDoubleOrNull(detalles['costo_delivery_moneda_checkout']);

  double? get exchangeRateSnapshot =>
      _toDoubleOrNull(detalles['tasa_cambio_snapshot']);

  String currencyForDisplay({String? fallback}) {
    final checkout = checkoutCurrencySnapshot;
    if (checkout != null && checkoutTotalSnapshot != null) return checkout;
    final base = _asTrimmedString(detalles['moneda_base']);
    if (base != null) return base.toUpperCase();
    final shop = _asTrimmedString(fallback);
    if (shop != null) return shop.toUpperCase();
    return checkout ?? 'COP';
  }

  double totalForDisplay(String currency) {
    final checkout = checkoutCurrencySnapshot;
    final checkoutTotal = checkoutTotalSnapshot;
    if (checkout != null &&
        checkoutTotal != null &&
        currency.trim().toUpperCase() == checkout) {
      return checkoutTotal;
    }
    return total ?? 0;
  }

  double deliveryForDisplay(String currency) {
    final checkout = checkoutCurrencySnapshot;
    final checkoutDelivery = checkoutDeliverySnapshot;
    if (checkout != null &&
        checkoutDelivery != null &&
        currency.trim().toUpperCase() == checkout) {
      return checkoutDelivery;
    }
    return deliveryCost;
  }

  double subtotalForDisplay(String currency, double displayTotal) {
    final checkout = checkoutCurrencySnapshot;
    final checkoutSubtotal = checkoutSubtotalSnapshot;
    if (checkout != null &&
        checkoutSubtotal != null &&
        currency.trim().toUpperCase() == checkout) {
      return checkoutSubtotal;
    }
    final stored = _toDoubleOrNull(detalles['subtotal']);
    if (stored != null && stored > 0) return stored;
    final inferred = displayTotal - deliveryForDisplay(currency);
    return inferred > 0 ? inferred : displayTotal;
  }

  double itemTotalForDisplay(PedidoItemModel item, String currency) {
    final checkout = checkoutCurrencySnapshot;
    final base = _asTrimmedString(detalles['moneda_base'])?.toUpperCase();
    final rate = exchangeRateSnapshot;
    if (checkout != null &&
        currency.trim().toUpperCase() == checkout &&
        base != null &&
        base != checkout &&
        rate != null &&
        rate > 0) {
      return item.total * rate;
    }
    return item.total;
  }

  const PedidoModel({
    required this.id,
    required this.comercioId,
    this.orderId,
    this.nombreCliente,
    this.clienteEmail,
    this.clientePhone,
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
    this.costoDelivery,
    this.items = const <PedidoItemModel>[],
    this.detalles = const <String, dynamic>{},
    this.hasParseError = false,
    this.parseErrorMessage,
  });

  PedidoModel copyWithItems(List<PedidoItemModel> nextItems) {
    return PedidoModel(
      id: id,
      comercioId: comercioId,
      orderId: orderId,
      nombreCliente: nombreCliente,
      clienteEmail: clienteEmail,
      clientePhone: clientePhone,
      estado: estado,
      total: total,
      createdAt: createdAt,
      creadoPorIa: creadoPorIa,
      confianzaIa: confianzaIa,
      metodoPago: metodoPago,
      deliveryMode: deliveryMode,
      deliveryAddress: deliveryAddress,
      deliveryReference: deliveryReference,
      deliveryInstructions: deliveryInstructions,
      deliveryLatitude: deliveryLatitude,
      deliveryLongitude: deliveryLongitude,
      orderNotes: orderNotes,
      costoDelivery: costoDelivery,
      items: nextItems,
      detalles: detalles,
      hasParseError: hasParseError,
      parseErrorMessage: parseErrorMessage,
    );
  }

  factory PedidoModel.fromMap(Map<String, dynamic> map) {
    try {
      return PedidoModel._fromMapUnsafe(map);
    } catch (error, stackTrace) {
      developer.log(
        'Error parseando pedido ${map['id'] ?? '(sin id)'}: $error',
        name: 'PedidoModel',
        stackTrace: stackTrace,
      );
      developer.log('DEBUG: JSON Crudo de Supabase: $map', name: 'PedidoModel');

      return PedidoModel._malformed(raw: map, errorMessage: error.toString());
    }
  }

  factory PedidoModel._fromMapUnsafe(Map<String, dynamic> map) {
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
      nombreCliente:
          map['nombre_cliente']?.toString() ??
          detallesMap['nombre_cliente']?.toString(),
      clienteEmail:
          map['cliente_email']?.toString() ??
          detallesMap['cliente_email']?.toString(),
      clientePhone:
          map['telefono_cliente']?.toString() ??
          detallesMap['telefono_cliente']?.toString(),
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
      deliveryAddress: _firstNonEmpty([
        deliveryMap['address'],
        deliveryMap['delivery_address'],
        detallesMap['delivery_address'],
        detallesMap['direccion_delivery'],
        detallesMap['direccion_entrega'],
        map['delivery_address'],
      ]),
      deliveryReference: _firstNonEmpty([
        deliveryMap['reference'],
        deliveryMap['ref'],
        deliveryMap['delivery_reference'],
        deliveryMap['reference_note'],
        detallesMap['delivery_reference'],
        detallesMap['delivery_reference_note'],
        detallesMap['referencia_delivery'],
        detallesMap['referencia_entrega'],
        map['delivery_reference'],
      ]),
      deliveryInstructions: _firstNonEmpty([
        deliveryMap['instructions'],
        deliveryMap['instruction'],
        deliveryMap['delivery_instructions'],
        deliveryMap['notes'],
        deliveryMap['note'],
        detallesMap['delivery_instructions'],
        detallesMap['delivery_notes'],
        detallesMap['indicaciones_delivery'],
        detallesMap['instrucciones_entrega'],
        map['delivery_instructions'],
      ]),
      deliveryLatitude: deliveryLatitude,
      deliveryLongitude: deliveryLongitude,
      orderNotes: _asTrimmedString(detallesMap['order_notes']),
      costoDelivery: _resolveCostoDelivery(map, detallesMap),
      items: orderItems,
      detalles: detallesMap,
    );
  }

  factory PedidoModel._malformed({
    required Map<String, dynamic> raw,
    required String errorMessage,
  }) {
    final detallesMap = _asMap(raw['detalles']);
    final fallbackId = (raw['id']?.toString().trim() ?? '').isEmpty
        ? 'pedido-malformado'
        : raw['id'].toString().trim();

    return PedidoModel(
      id: fallbackId,
      comercioId: raw['comercio_id']?.toString() ?? '',
      orderId: _resolveOrderId(detallesMap),
      nombreCliente:
          raw['nombre_cliente']?.toString() ??
          detallesMap['nombre_cliente']?.toString(),
      clienteEmail:
          raw['cliente_email']?.toString() ??
          detallesMap['cliente_email']?.toString(),
      clientePhone:
          raw['telefono_cliente']?.toString() ??
          detallesMap['telefono_cliente']?.toString(),
      estado: 'error_parseo',
      total:
          _toDoubleOrNull(raw['total']) ??
          _toDoubleOrNull(detallesMap['total']),
      createdAt: _tryParseDate(raw['created_at']),
      metodoPago: _resolveMetodoPago(detallesMap['metodo_pago']),
      detalles: detallesMap,
      hasParseError: true,
      parseErrorMessage: errorMessage,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'comercio_id': comercioId,
      'nombre_cliente': nombreCliente,
      'cliente_email': clienteEmail,
      'telefono_cliente': clientePhone,
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
        'nombre_cliente': nombreCliente,
        'cliente_email': clienteEmail,
        'telefono_cliente': clientePhone,
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

  static double? _resolveCostoDelivery(
    Map<String, dynamic> map,
    Map<String, dynamic> detallesMap,
  ) {
    return _toDoubleOrNull(map['costo_delivery']) ??
        _toDoubleOrNull(map['costo_envio']) ??
        _toDoubleOrNull(detallesMap['costo_delivery']) ??
        _toDoubleOrNull(detallesMap['delivery_fee']) ??
        _toDoubleOrNull(detallesMap['costo_envio']);
  }

  double get deliveryCost => costoDelivery ?? 0;

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

  static String? _firstNonEmpty(Iterable<dynamic> values) {
    for (final value in values) {
      final trimmed = _asTrimmedString(value);
      if (trimmed != null) return trimmed;
    }
    return null;
  }

  static String? _resolveOrderNotes(dynamic value) {
    var notes = _asTrimmedString(value);
    if (notes == null) return null;
    const fulfillmentPrefix =
        r'^Tipo:\s*(?:Comer aqui|Para llevar|Delivery)(?:\.\s*|$)';
    notes = notes
        .replaceFirst(RegExp(fulfillmentPrefix, caseSensitive: false), '')
        .trim();
    if (notes.isEmpty) return null;
    if (const <String>{
      'delivery',
      'pickup',
      'retiro',
      'comer aqui',
      'para llevar',
    }.contains(notes.toLowerCase())) {
      return null;
    }
    return notes;
  }

  static double? _toDoubleOrNull(dynamic value) {
    if (value is num) return value.toDouble();
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return null;
    return double.tryParse(raw.replaceAll(',', '.'));
  }

  static DateTime? _tryParseDate(dynamic value) {
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return null;
    return DateTime.tryParse(raw);
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

/// One option chosen for an order line, frozen when the order was created
/// (`detalles.items[].selecciones`).
class PedidoItemModifier {
  final String grupo;
  final String nombre;
  final double precio;

  const PedidoItemModifier({
    required this.grupo,
    required this.nombre,
    this.precio = 0,
  });

  static PedidoItemModifier? fromMap(dynamic raw) {
    if (raw is! Map) return null;
    final nombre =
        raw['opcion']?.toString().trim() ??
        raw['nombre']?.toString().trim() ??
        '';
    if (nombre.isEmpty) return null;
    final rawPrecio = raw['precio'];
    return PedidoItemModifier(
      grupo: raw['grupo']?.toString().trim() ?? '',
      nombre: nombre,
      precio: rawPrecio is num
          ? rawPrecio.toDouble()
          : double.tryParse('$rawPrecio') ?? 0,
    );
  }

  Map<String, dynamic> toMap() => {
    'grupo': grupo,
    'opcion': nombre,
    'precio': precio,
  };
}

/// Modifiers of one group, in the order the customer saw them.
class PedidoItemModifierGroup {
  final String grupo;
  final List<PedidoItemModifier> opciones;

  const PedidoItemModifierGroup({required this.grupo, required this.opciones});

  /// "Tamaño: Grande" for a single pick, "Extras: ✓ Tocineta ✓ Extra queso"
  /// for several.
  String get label {
    final names = opciones.length == 1
        ? opciones.first.nombre
        : opciones.map((option) => '✓ ${option.nombre}').join(' ');
    return grupo.isEmpty ? names : '$grupo: $names';
  }
}

class PedidoItemModel {
  final String? productId;
  final String nombre;
  final int cantidad;
  final double precio;
  final String? imageUrl;
  final String? categoryName;
  final bool hasImageSnapshot;
  final bool hasCategorySnapshot;
  final String? producto;
  final double? precioBase;
  final List<PedidoItemModifier> opciones;

  const PedidoItemModel({
    required this.nombre,
    required this.cantidad,
    required this.precio,
    this.productId,
    this.imageUrl,
    this.categoryName,
    this.hasImageSnapshot = false,
    this.hasCategorySnapshot = false,
    this.producto,
    this.precioBase,
    this.opciones = const [],
  });

  double get total => cantidad * precio;

  PedidoItemModel withCatalogFallback({
    String? imageUrl,
    String? categoryName,
  }) {
    return PedidoItemModel(
      productId: productId,
      nombre: nombre,
      cantidad: cantidad,
      precio: precio,
      imageUrl: hasImageSnapshot ? this.imageUrl : (imageUrl ?? this.imageUrl),
      categoryName: hasCategorySnapshot
          ? this.categoryName
          : (categoryName ?? this.categoryName),
      hasImageSnapshot: hasImageSnapshot,
      hasCategorySnapshot: hasCategorySnapshot,
      producto: producto,
      precioBase: precioBase,
      opciones: opciones,
    );
  }

  bool get hasModifiers => opciones.isNotEmpty;

  /// Base product name when the line has modifiers (they are listed apart);
  /// otherwise the stored label, exactly as before.
  String get displayName {
    final base = producto?.trim() ?? '';
    return hasModifiers && base.isNotEmpty ? base : nombre;
  }

  List<PedidoItemModifierGroup> get modifierGroups {
    final byGroup = <String, List<PedidoItemModifier>>{};
    for (final option in opciones) {
      byGroup.putIfAbsent(option.grupo, () => []).add(option);
    }
    return [
      for (final entry in byGroup.entries)
        PedidoItemModifierGroup(grupo: entry.key, opciones: entry.value),
    ];
  }

  factory PedidoItemModel.fromMap(Map<String, dynamic> map) {
    final rawCantidad = map['cantidad'];
    final rawPrecio = map['precio'];
    // Older orders may hold the raw selection object under `opciones`; the
    // frozen snapshot list lives in `selecciones`.
    final rawOpciones = map['selecciones'];
    final rawBase = map['precio_base'];
    final producto = map['producto']?.toString().trim();
    final rawCategory = map.containsKey('categoria_nombre')
        ? map['categoria_nombre']
        : map['category_name'];
    final categoryName = PedidoModel._asTrimmedString(rawCategory);

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
      productId: PedidoModel._asTrimmedString(
        map['product_id'] ?? map['productId'],
      ),
      imageUrl: _resolveImageUrl(map),
      categoryName: categoryName,
      hasImageSnapshot: const <String>[
        'imagen_url',
        'image_url',
        'foto_url',
        'imagen',
        'foto',
      ].any(map.containsKey),
      hasCategorySnapshot:
          map.containsKey('categoria_nombre') ||
          map.containsKey('category_name'),
      producto: producto == null || producto.isEmpty ? null : producto,
      precioBase: rawBase is num
          ? rawBase.toDouble()
          : double.tryParse(rawBase?.toString() ?? ''),
      opciones: rawOpciones is List
          ? [
              for (final entry in rawOpciones)
                ?PedidoItemModifier.fromMap(entry),
            ]
          : const [],
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
      if (productId != null) 'product_id': productId,
      'nombre': nombre,
      'cantidad': cantidad,
      'precio': precio,
      if (hasImageSnapshot) 'imagen_url': imageUrl,
      if (hasCategorySnapshot) 'categoria_nombre': categoryName,
      'producto': ?producto,
      'precio_base': ?precioBase,
      if (opciones.isNotEmpty)
        'selecciones': opciones.map((option) => option.toMap()).toList(),
    };
  }
}
