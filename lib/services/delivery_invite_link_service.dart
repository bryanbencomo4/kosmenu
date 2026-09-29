import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class DeliveryInviteLinkService {
  const DeliveryInviteLinkService._();

  static Future<String?> createDirectWhatsappUrl({
    required String orderId,
    required String token,
    required String courierAlias,
  }) async {
    final accessToken = Supabase.instance.client.auth.currentSession?.accessToken.trim() ?? '';
    if (accessToken.isEmpty) return null;

    final response = await http.post(
      ElmenuxfaApiConfig.uri('/api/business/delivery-invite/notify'),
      headers: <String, String>{
        'Accept': 'application/json',
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode(<String, String>{
        'orderId': orderId.trim(),
        'token': token.trim(),
        'courierAlias': courierAlias.trim(),
      }),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) return null;

    final payload = jsonDecode(response.body);
    if (payload is! Map) return null;
    final url = (payload['directWhatsappUrl'] ?? '').toString().trim();
    return url.isEmpty ? null : url;
  }
}
