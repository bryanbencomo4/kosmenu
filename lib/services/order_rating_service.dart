import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class OrderRatingService {
  const OrderRatingService._();

  static Future<int> rateCustomer({
    required String orderId,
    required int rating,
  }) async {
    final session = Supabase.instance.client.auth.currentSession;
    final accessToken = session?.accessToken.trim() ?? '';
    final safeOrderId = orderId.trim();
    if (accessToken.isEmpty || safeOrderId.isEmpty) {
      throw const FormatException('Inicia sesión para calificar este pedido.');
    }
    if (rating < 1 || rating > 5) {
      throw const FormatException('Selecciona de 1 a 5 estrellas.');
    }

    final uri = ElmenuxfaApiConfig.uri(
      '/api/business/orders/${Uri.encodeComponent(safeOrderId)}/rating',
    );
    final response = await http
        .post(
          uri,
          headers: <String, String>{
            'Accept': 'application/json',
            'Authorization': 'Bearer $accessToken',
            'Content-Type': 'application/json',
          },
          body: jsonEncode(<String, int>{'rating': rating}),
        )
        .timeout(const Duration(seconds: 12));

    final payload = jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = payload is Map
          ? (payload['error']?.toString().trim() ?? '')
          : '';
      throw FormatException(
        message.isEmpty ? 'No se pudo guardar la calificación.' : message,
      );
    }

    return rating;
  }
}
