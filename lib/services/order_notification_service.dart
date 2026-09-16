import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Dispatches WhatsApp + push notifications through the Next.js API after the
/// merchant updates an order status in Supabase.
class OrderNotificationService {
  const OrderNotificationService._();

  static const Duration _timeout = Duration(seconds: 12);

  static Future<void> dispatchStatusChange({
    required String orderId,
    required String previousStatus,
  }) async {
    final trimmedOrderId = orderId.trim();
    final trimmedPrevious = previousStatus.trim();
    if (trimmedOrderId.isEmpty) {
      return;
    }

    final session = Supabase.instance.client.auth.currentSession;
    final accessToken = session?.accessToken.trim() ?? '';
    if (accessToken.isEmpty) {
      return;
    }

    final encoded = Uri.encodeComponent(trimmedOrderId);
    final uri = ElmenuxfaApiConfig.uri('/api/business/orders/$encoded/notify');

    try {
      final response = await http
          .post(
            uri,
            headers: <String, String>{
              'Accept': 'application/json',
              'Authorization': 'Bearer $accessToken',
              'Content-Type': 'application/json',
            },
            body: jsonEncode(<String, String>{
              'previousStatus': trimmedPrevious,
            }),
          )
          .timeout(_timeout);

      if (response.statusCode >= 400 && kDebugMode) {
        debugPrint(
          'OrderNotificationService dispatch failed '
          '(${response.statusCode}): ${response.body}',
        );
      }
    } catch (error, stackTrace) {
      if (kDebugMode) {
        debugPrint('OrderNotificationService dispatch error: $error');
        debugPrint('$stackTrace');
      }
    }
  }
}
