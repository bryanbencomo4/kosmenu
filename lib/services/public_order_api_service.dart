import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';

/// Allowed payment-proof content types (must match Next validation).
const Set<String> kComprobanteAllowedMimeTypes = <String>{
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
};

const int kComprobanteMaxBytes = 5 * 1024 * 1024;

const Set<String> kComprobanteBlockedExtensions = <String>{
  'svg',
  'html',
  'htm',
  'xhtml',
  'js',
  'mjs',
  'xml',
};

class PublicOrderCreateRequest {
  const PublicOrderCreateRequest({
    required this.comercioId,
    required this.clientName,
    required this.clientWhatsapp,
    required this.currency,
    required this.exchangeRate,
    required this.costoDelivery,
    required this.items,
    required this.delivery,
    this.comercioNombre,
    this.paymentMethod,
    this.paymentProofUrl,
    this.orderNotes,
  });

  final String comercioId;
  final String clientName;
  final String clientWhatsapp;
  final String currency;
  final double exchangeRate;
  final double costoDelivery;
  final List<PublicOrderItemDto> items;
  final PublicOrderDeliveryDto delivery;
  final String? comercioNombre;
  final PublicOrderPaymentMethodDto? paymentMethod;
  final String? paymentProofUrl;
  final String? orderNotes;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'comercioId': comercioId,
      if (comercioNombre != null && comercioNombre!.trim().isNotEmpty)
        'comercioNombre': comercioNombre!.trim(),
      'clientName': clientName.trim(),
      'clientWhatsapp': clientWhatsapp.trim(),
      'currency': currency,
      'exchangeRate': exchangeRate,
      'costoDelivery': costoDelivery,
      'items': items.map((item) => item.toJson()).toList(),
      'delivery': delivery.toJson(),
      if (paymentMethod != null) 'paymentMethod': paymentMethod!.toJson(),
      if (paymentProofUrl != null && paymentProofUrl!.trim().isNotEmpty)
        'paymentProofUrl': paymentProofUrl!.trim(),
      if (orderNotes != null && orderNotes!.trim().isNotEmpty)
        'orderNotes': orderNotes!.trim(),
    };
  }
}

class PublicOrderItemDto {
  const PublicOrderItemDto({
    required this.productId,
    required this.nombre,
    required this.cantidad,
    required this.precio,
  });

  final String productId;
  final String nombre;
  final int cantidad;
  final double precio;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'product_id': productId,
      'nombre': nombre,
      'cantidad': cantidad,
      'precio': precio,
    };
  }
}

class PublicOrderDeliveryDto {
  const PublicOrderDeliveryDto({
    required this.mode,
    this.address,
    this.reference,
    this.instructions,
    this.lat,
    this.lng,
  });

  final String mode;
  final String? address;
  final String? reference;
  final String? instructions;
  final double? lat;
  final double? lng;

  Map<String, dynamic> toJson() {
    final isDelivery = mode == 'delivery';
    return <String, dynamic>{
      'mode': isDelivery ? 'delivery' : 'pickup',
      if (isDelivery && (address ?? '').trim().isNotEmpty)
        'address': address!.trim(),
      if (isDelivery && (reference ?? '').trim().isNotEmpty)
        'reference': reference!.trim(),
      if (isDelivery && (instructions ?? '').trim().isNotEmpty)
        'instructions': instructions!.trim(),
      if (isDelivery && lat != null && lng != null)
        'coordinates': <String, dynamic>{'lat': lat, 'lng': lng},
    };
  }
}

class PublicOrderPaymentMethodDto {
  const PublicOrderPaymentMethodDto({this.id, this.nombre, this.datos});

  final String? id;
  final String? nombre;
  final List<String>? datos;

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      if (id != null && id!.trim().isNotEmpty) 'id': id!.trim(),
      if (nombre != null && nombre!.trim().isNotEmpty) 'nombre': nombre!.trim(),
      if (datos != null && datos!.isNotEmpty) 'datos': datos,
    };
  }
}

class PublicOrderCreateResult {
  const PublicOrderCreateResult({
    required this.orderId,
    required this.trackingUrl,
    required this.estado,
    this.total,
    this.confirmationMessage,
  });

  final String orderId;
  final String trackingUrl;
  final String estado;
  final double? total;
  final String? confirmationMessage;
}

class PublicOrderApiException implements Exception {
  const PublicOrderApiException({
    required this.message,
    this.statusCode,
    this.retryable = false,
  });

  final String message;
  final int? statusCode;
  final bool retryable;

  @override
  String toString() => message;
}

class ComprobanteUploadResult {
  const ComprobanteUploadResult({required this.storageRef});

  final String storageRef;
}

class ComprobanteSignedUrlResult {
  const ComprobanteSignedUrlResult({
    required this.url,
    required this.expiresInSec,
  });

  final String url;
  final int expiresInSec;
}

/// Cryptographically random idempotency key (UUID v4 style). No PII / timestamp-only.
String generateCheckoutIdempotencyKey() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  String hex(int value) => value.toRadixString(16).padLeft(2, '0');
  final parts = <String>[
    bytes.sublist(0, 4).map(hex).join(),
    bytes.sublist(4, 6).map(hex).join(),
    bytes.sublist(6, 8).map(hex).join(),
    bytes.sublist(8, 10).map(hex).join(),
    bytes.sublist(10, 16).map(hex).join(),
  ];
  return parts.join('-');
}

class ComprobanteClientValidator {
  const ComprobanteClientValidator._();

  static String? validate({
    required String fileName,
    required String mimeType,
    required int sizeBytes,
  }) {
    final mime = mimeType.trim().toLowerCase();
    if (!kComprobanteAllowedMimeTypes.contains(mime)) {
      return 'Tipo de archivo no permitido. Usa JPEG, PNG, WebP o PDF.';
    }
    if (sizeBytes <= 0) {
      return 'Archivo invalido.';
    }
    if (sizeBytes > kComprobanteMaxBytes) {
      return 'El comprobante no puede superar 5 MB.';
    }
    final lowerName = fileName.trim().toLowerCase();
    final dot = lowerName.lastIndexOf('.');
    final ext = dot >= 0 ? lowerName.substring(dot + 1) : '';
    if (kComprobanteBlockedExtensions.contains(ext)) {
      return 'Extension de archivo no permitida.';
    }
    final allowedExt = <String>{'jpg', 'jpeg', 'png', 'webp', 'pdf'};
    if (ext.isNotEmpty && !allowedExt.contains(ext)) {
      return 'Extension de archivo no permitida.';
    }
    return null;
  }
}

class PublicOrderApiService {
  PublicOrderApiService({http.Client? client, Duration? timeout})
    : _client = client ?? http.Client(),
      _timeout = timeout ?? const Duration(seconds: 25);

  final http.Client _client;
  final Duration _timeout;

  Future<PublicOrderCreateResult> createOrder({
    required PublicOrderCreateRequest request,
    required String idempotencyKey,
  }) async {
    final key = idempotencyKey.trim();
    if (key.isEmpty || key.length < 8 || key.length > 128) {
      throw const PublicOrderApiException(
        message: 'Clave de idempotencia invalida.',
        statusCode: 400,
      );
    }

    final uri = ElmenuxfaApiConfig.uri('/api/orders');
    late http.Response response;
    try {
      response = await _client
          .post(
            uri,
            headers: <String, String>{
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Idempotency-Key': key,
            },
            body: jsonEncode(request.toJson()),
          )
          .timeout(_timeout);
    } on Exception {
      throw const PublicOrderApiException(
        message: 'No hay conexion. Revisa tu red e intentalo de nuevo.',
        retryable: true,
      );
    }

    return _parseCreateOrderResponse(response);
  }

  Future<ComprobanteUploadResult> uploadComprobante({
    required String comercioId,
    required String fileName,
    required String mimeType,
    required Uint8List bytes,
    void Function(double progress)? onProgress,
  }) async {
    final validationError = ComprobanteClientValidator.validate(
      fileName: fileName,
      mimeType: mimeType,
      sizeBytes: bytes.length,
    );
    if (validationError != null) {
      throw PublicOrderApiException(message: validationError, statusCode: 422);
    }

    final uri = ElmenuxfaApiConfig.uri('/api/orders/comprobantes');
    final request = http.MultipartRequest('POST', uri)
      ..fields['comercioId'] = comercioId.trim()
      ..files.add(
        http.MultipartFile.fromBytes('file', bytes, filename: fileName),
      );

    onProgress?.call(0.05);

    late http.StreamedResponse streamed;
    try {
      streamed = await _client.send(request).timeout(_timeout);
    } on Exception {
      throw const PublicOrderApiException(
        message: 'No se pudo subir el comprobante. Revisa tu conexion.',
        retryable: true,
      );
    }

    onProgress?.call(0.85);
    final response = await http.Response.fromStream(streamed).timeout(_timeout);
    onProgress?.call(1);

    if (response.statusCode == 201 || response.statusCode == 200) {
      final body = _decodeJson(response.body);
      final data = body['data'];
      final map = data is Map ? Map<String, dynamic>.from(data) : body;
      final storageRef =
          (map['storageRef'] ?? map['paymentProofUrl'] ?? '').toString().trim();
      if (storageRef.isEmpty || !storageRef.startsWith('storage://')) {
        throw const PublicOrderApiException(
          message: 'Respuesta de comprobante invalida.',
          statusCode: 500,
        );
      }
      return ComprobanteUploadResult(storageRef: storageRef);
    }

    throw PublicOrderApiException(
      message: _userMessageForUploadStatus(response.statusCode),
      statusCode: response.statusCode,
      retryable: response.statusCode == 429 || response.statusCode >= 500,
    );
  }

  Future<ComprobanteSignedUrlResult> fetchComprobanteSignedUrl({
    required String orderId,
    required String accessToken,
  }) async {
    final token = accessToken.trim();
    if (token.isEmpty) {
      throw const PublicOrderApiException(
        message: 'Sesion expirada. Vuelve a iniciar sesion.',
        statusCode: 401,
      );
    }

    final encoded = Uri.encodeComponent(orderId.trim());
    final uri = ElmenuxfaApiConfig.uri(
      '/api/business/orders/$encoded/comprobante',
    );

    late http.Response response;
    try {
      response = await _client
          .get(
            uri,
            headers: <String, String>{
              'Accept': 'application/json',
              'Authorization': 'Bearer $token',
            },
          )
          .timeout(_timeout);
    } on Exception {
      throw const PublicOrderApiException(
        message: 'No se pudo obtener el comprobante.',
        retryable: true,
      );
    }

    if (response.statusCode == 200) {
      final body = _decodeJson(response.body);
      final data = body['data'];
      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      final url = (map['url'] ?? '').toString().trim();
      final expires = map['expiresInSec'];
      final expiresInSec = expires is num
          ? expires.toInt()
          : int.tryParse('$expires') ?? 300;
      if (url.isEmpty) {
        throw const PublicOrderApiException(
          message: 'Comprobante no disponible.',
          statusCode: 404,
        );
      }
      return ComprobanteSignedUrlResult(url: url, expiresInSec: expiresInSec);
    }

    if (response.statusCode == 401) {
      throw const PublicOrderApiException(
        message: 'Sesion expirada. Vuelve a iniciar sesion.',
        statusCode: 401,
      );
    }

    // 403/404 intentionally generic — do not reveal foreign order existence.
    throw PublicOrderApiException(
      message: 'Comprobante no disponible.',
      statusCode: response.statusCode,
      retryable: response.statusCode == 429 || response.statusCode >= 500,
    );
  }

  PublicOrderCreateResult _parseCreateOrderResponse(http.Response response) {
    final status = response.statusCode;
    if (status == 201 || status == 200) {
      final body = _decodeJson(response.body);
      final data = body['data'];
      final map = data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
      final orderId = (map['orderId'] ?? '').toString().trim();
      final trackingUrl = (map['trackingUrl'] ?? '').toString().trim();
      final estado = (map['estado'] ?? 'pendiente').toString().trim();
      if (orderId.isEmpty || trackingUrl.isEmpty) {
        throw const PublicOrderApiException(
          message: 'Respuesta de pedido incompleta.',
          statusCode: 500,
        );
      }
      final totalRaw = map['total'];
      final total = totalRaw is num
          ? totalRaw.toDouble()
          : double.tryParse('$totalRaw');
      return PublicOrderCreateResult(
        orderId: orderId,
        trackingUrl: trackingUrl,
        estado: estado.isEmpty ? 'pendiente' : estado,
        total: total,
        confirmationMessage: 'Pedido confirmado',
      );
    }

    throw PublicOrderApiException(
      message: _userMessageForOrderStatus(status),
      statusCode: status,
      retryable: status == 429 || status >= 500,
    );
  }

  Map<String, dynamic> _decodeJson(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
    } catch (_) {
      // Ignore parse errors — callers use status-based messages.
    }
    return <String, dynamic>{};
  }

  String _userMessageForOrderStatus(int status) {
    switch (status) {
      case 400:
      case 422:
        return 'Revisa los datos del pedido e intentalo de nuevo.';
      case 409:
        return 'Este pedido ya fue procesado. Revisa tu historial o tracking.';
      case 429:
        return 'Demasiados intentos. Espera un momento e intentalo de nuevo.';
      case 500:
      case 503:
        return 'No pudimos registrar el pedido. Intentalo de nuevo.';
      default:
        return 'No pudimos registrar el pedido. Intentalo de nuevo.';
    }
  }

  String _userMessageForUploadStatus(int status) {
    switch (status) {
      case 413:
        return 'El comprobante es demasiado grande (max. 5 MB).';
      case 415:
      case 422:
        return 'Tipo de archivo no permitido.';
      case 429:
        return 'Demasiados intentos de carga. Espera un momento.';
      case 500:
      case 503:
        return 'No se pudo subir el comprobante. Intentalo de nuevo.';
      default:
        return 'No se pudo subir el comprobante.';
    }
  }
}
