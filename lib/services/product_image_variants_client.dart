import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:kosmenu_app/services/elmenuxfa_api_config.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Asks the Next API to generate cold WebP/AVIF variants after an upload.
/// Failures are ignored — the public menu keeps hot-transform fallback.
class ProductImageVariantsClient {
  const ProductImageVariantsClient();

  Future<void> ensure(String publicImageUrl) async {
    final url = publicImageUrl.trim();
    if (url.isEmpty) return;
    if (!url.contains('/storage/v1/object/public/')) return;

    try {
      final token = Supabase.instance.client.auth.currentSession?.accessToken;
      final headers = <String, String>{
        'content-type': 'application/json',
        if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
      };
      await http
          .post(
            ElmenuxfaApiConfig.uri('/api/images/variants'),
            headers: headers,
            body: jsonEncode(<String, dynamic>{'imageUrl': url}),
          )
          .timeout(const Duration(seconds: 45));
    } catch (_) {
      // Non-blocking: menu still serves hot transforms until backfill.
    }
  }

  void ensureInBackground(String publicImageUrl) {
    unawaited(ensure(publicImageUrl));
  }
}
