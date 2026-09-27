import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum DeliveryInviteNotificationStatus { sent, queued, failed }

class DeliveryInviteNotificationService {
  const DeliveryInviteNotificationService._();

  static const Duration _timeout = Duration(seconds: 15);

  static Future<DeliveryInviteNotificationStatus> send({
    required String orderId,
    required String token,
    required String courierAlias,
  }) async {
    final client = Supabase.instance.client;
    var accessToken = client.auth.currentSession?.accessToken.trim() ?? '';
    if (accessToken.isEmpty || orderId.trim().isEmpty || token.trim().isEmpty) {
      return DeliveryInviteNotificationStatus.failed;
    }

    try {
      Future<http.Response> post(String bearerToken) => http
          .post(
            ElmenuxfaApiConfig.uri('/api/business/delivery-invite/notify'),
            headers: <String, String>{
              'Accept': 'application/json',
              'Authorization': 'Bearer $bearerToken',
              'Content-Type': 'application/json',
            },
            body: jsonEncode(<String, String>{
              'orderId': orderId.trim(),
              'token': token.trim(),
              'courierAlias': courierAlias.trim(),
            }),
          )
          .timeout(_timeout);

      var response = await post(accessToken);
      if (response.statusCode == 401) {
        final refreshed = await client.auth.refreshSession();
        accessToken = refreshed.session?.accessToken.trim() ?? '';
        if (accessToken.isNotEmpty) {
          response = await post(accessToken);
        }
      }

      final payload = jsonDecode(response.body);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (kDebugMode) {
          debugPrint(
            'Delivery invite queue request failed (${response.statusCode}).',
          );
        }
        return DeliveryInviteNotificationStatus.failed;
      }
      if (payload is Map && payload['delivered'] == true) {
        return DeliveryInviteNotificationStatus.sent;
      }
      if (payload is Map && payload['queued'] == true) {
        return DeliveryInviteNotificationStatus.queued;
      }
      return DeliveryInviteNotificationStatus.failed;
    } catch (error) {
      if (kDebugMode) {
        debugPrint('Delivery invite notification failed: $error');
      }
      return DeliveryInviteNotificationStatus.failed;
    }
  }
}
