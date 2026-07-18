import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';

class PublicMenuApiException implements Exception {
  const PublicMenuApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

/// Loads the public menu DTO from Next `/api/menu/[comercioId]`
/// (sanitized; does not expose owner_id or private payment fields).
class PublicMenuApiService {
  PublicMenuApiService({http.Client? client, Duration? timeout})
    : _client = client ?? http.Client(),
      _timeout = timeout ?? const Duration(seconds: 20);

  final http.Client _client;
  final Duration _timeout;

  Future<Map<String, dynamic>> fetchMenu(String comercioId) async {
    final encoded = Uri.encodeComponent(comercioId.trim());
    final uri = ElmenuxfaApiConfig.uri('/api/menu/$encoded');

    late http.Response response;
    try {
      response = await _client
          .get(uri, headers: const <String, String>{'Accept': 'application/json'})
          .timeout(_timeout);
    } on Exception {
      throw const PublicMenuApiException(
        'No se pudo cargar el menu. Revisa tu conexion.',
      );
    }

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map) {
        throw const PublicMenuApiException('Respuesta de menu invalida.');
      }
      final root = Map<String, dynamic>.from(decoded);
      final data = root['data'];
      if (data is Map) {
        return Map<String, dynamic>.from(data);
      }
      return root;
    }

    if (response.statusCode == 403) {
      throw PublicMenuApiException(
        'El menu no esta disponible en este momento.',
        statusCode: response.statusCode,
      );
    }

    if (response.statusCode == 404) {
      throw PublicMenuApiException(
        'Comercio no encontrado.',
        statusCode: response.statusCode,
      );
    }

    throw PublicMenuApiException(
      'No se pudo cargar el menu.',
      statusCode: response.statusCode,
    );
  }
}
