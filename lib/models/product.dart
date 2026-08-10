class ProductModel {
  final String id;
  final String comercioId;
  final String categoriaId;
  final String nombre;
  final double precio;
  final String descripcion;
  final int orden;
  final bool disponible;
  final String? imagenUrl;
  final bool? creadoPorIa;
  final double? confianzaIa;
  final String imagenSourceType;
  final String aiImageStatus;
  final String? aiImageErrorMessage;
  final String? upsellBadge;
  final double? precioComparacion;
  final bool upsellEnabled;

  const ProductModel({
    required this.id,
    required this.comercioId,
    required this.categoriaId,
    required this.nombre,
    required this.precio,
    required this.descripcion,
    this.orden = 0,
    this.disponible = true,
    this.imagenUrl,
    this.creadoPorIa,
    this.confianzaIa,
    this.imagenSourceType = 'manual',
    this.aiImageStatus = 'none',
    this.aiImageErrorMessage,
    this.upsellBadge,
    this.precioComparacion,
    this.upsellEnabled = true,
  });

  factory ProductModel.fromMap(Map<String, dynamic> map) {
    final precioValue = map['precio'];
    final ordenValue = map['orden'];
    final confianzaValue = map['confianza_ia'];
    final compareValue = map['precio_comparacion'];

    return ProductModel(
      id: map['id']?.toString() ?? '',
      comercioId: map['comercio_id']?.toString() ?? '',
      categoriaId: map['categoria_id']?.toString() ?? '',
      nombre: map['nombre']?.toString() ?? '',
      precio: precioValue is num
          ? precioValue.toDouble()
          : double.tryParse('${map['precio']}') ?? 0,
      descripcion: map['descripcion']?.toString() ?? '',
      orden: ordenValue is int ? ordenValue : int.tryParse('$ordenValue') ?? 0,
      disponible: map['disponible'] is bool ? map['disponible'] as bool : true,
      imagenUrl: _normalizeImageUrl(map['imagen_url']),
      creadoPorIa: map['creado_por_ia'] as bool?,
      confianzaIa: confianzaValue is num
          ? confianzaValue.toDouble()
          : double.tryParse('${map['confianza_ia']}'),
      imagenSourceType: map['imagen_source_type']?.toString() ?? 'manual',
      aiImageStatus: map['ai_image_status']?.toString() ?? 'none',
      aiImageErrorMessage: map['ai_image_error_message']?.toString(),
      upsellBadge: _normalizeUpsellBadge(map['upsell_badge']),
      precioComparacion: compareValue is num
          ? compareValue.toDouble()
          : double.tryParse('${map['precio_comparacion']}'),
      upsellEnabled: map['upsell_enabled'] is bool
          ? map['upsell_enabled'] as bool
          : true,
    );
  }

  ProductModel copyWith({
    String? id,
    String? comercioId,
    String? categoriaId,
    String? nombre,
    double? precio,
    String? descripcion,
    int? orden,
    bool? disponible,
    String? imagenUrl,
    bool clearImagenUrl = false,
    bool? creadoPorIa,
    double? confianzaIa,
    String? imagenSourceType,
    String? aiImageStatus,
    String? aiImageErrorMessage,
    bool clearAiImageErrorMessage = false,
    String? upsellBadge,
    bool clearUpsellBadge = false,
    double? precioComparacion,
    bool clearPrecioComparacion = false,
    bool? upsellEnabled,
  }) {
    return ProductModel(
      id: id ?? this.id,
      comercioId: comercioId ?? this.comercioId,
      categoriaId: categoriaId ?? this.categoriaId,
      nombre: nombre ?? this.nombre,
      precio: precio ?? this.precio,
      descripcion: descripcion ?? this.descripcion,
      orden: orden ?? this.orden,
      disponible: disponible ?? this.disponible,
      imagenUrl: clearImagenUrl ? null : (imagenUrl ?? this.imagenUrl),
      creadoPorIa: creadoPorIa ?? this.creadoPorIa,
      confianzaIa: confianzaIa ?? this.confianzaIa,
      imagenSourceType: imagenSourceType ?? this.imagenSourceType,
      aiImageStatus: aiImageStatus ?? this.aiImageStatus,
      aiImageErrorMessage: clearAiImageErrorMessage
          ? null
          : (aiImageErrorMessage ?? this.aiImageErrorMessage),
      upsellBadge: clearUpsellBadge ? null : (upsellBadge ?? this.upsellBadge),
      precioComparacion: clearPrecioComparacion
          ? null
          : (precioComparacion ?? this.precioComparacion),
      upsellEnabled: upsellEnabled ?? this.upsellEnabled,
    );
  }

  bool get hasAiImageInProgress =>
      aiImageStatus == 'pending' || aiImageStatus == 'processing';

  bool get hasAiImageFailure => aiImageStatus == 'failed';

  bool get isAiGeneratedImage => imagenSourceType == 'ai_generated';

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'comercio_id': comercioId,
      'categoria_id': categoriaId,
      'nombre': nombre,
      'precio': precio,
      'descripcion': descripcion,
      'orden': orden,
      'disponible': disponible,
      'imagen_url': imagenUrl,
      'creado_por_ia': creadoPorIa,
      'confianza_ia': confianzaIa,
      'imagen_source_type': imagenSourceType,
      'ai_image_status': aiImageStatus,
      'ai_image_error_message': aiImageErrorMessage,
      'upsell_badge': upsellBadge,
      'precio_comparacion': precioComparacion,
      'upsell_enabled': upsellEnabled,
    };
  }

  static String? _normalizeImageUrl(dynamic value) {
    if (value == null) {
      return null;
    }

    if (value is Map) {
      final nested = value['data'];
      if (nested is Map && nested['publicUrl'] != null) {
        final url = nested['publicUrl'].toString().trim();
        return url.isEmpty ? null : url;
      }
      final direct = value['publicUrl']?.toString().trim() ?? '';
      return direct.isEmpty ? null : direct;
    }

    final raw = value.toString().trim();
    if (raw.isEmpty) {
      return null;
    }

    final publicUrlMatch = RegExp(
      r'"publicUrl"\s*:\s*"([^"]+)"',
    ).firstMatch(raw);
    if (publicUrlMatch != null) {
      final url = publicUrlMatch.group(1)?.trim() ?? '';
      return url.isEmpty ? null : url;
    }

    return raw;
  }

  static String? _normalizeUpsellBadge(dynamic value) {
    final raw = value?.toString().trim().toLowerCase() ?? '';
    if (raw.isEmpty) return null;
    const allowed = <String>{'mas_pedido', 'mejor_valor', 'ahorra'};
    return allowed.contains(raw) ? raw : null;
  }
}
