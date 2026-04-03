import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class BrandingAiService {
  const BrandingAiService();

  Future<Map<String, dynamic>> generateBranding({
    required String comercioId,
    required String promptUsuario,
    String? imageUrl,
  }) async {
    final supabase = Supabase.instance.client;
    final functionHeaders = {
      'Authorization': 'Bearer ${SupabaseConfig.anonKey}',
      'apikey': SupabaseConfig.anonKey,
      'x-comercio-id': comercioId,
    };

    final response = await supabase.functions.invoke(
      'generate-branding-gemini',
      body: {
        'comercio_id': comercioId,
        'prompt_usuario': promptUsuario,
        if ((imageUrl ?? '').trim().isNotEmpty) 'image_url': imageUrl!.trim(),
      },
      headers: functionHeaders,
    );

    final data = _responseMap(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw StateError(
        'Error en generate-branding-gemini (status ${response.status}): '
        '${data['error'] ?? 'sin detalle'}.',
      );
    }

    return data;
  }

  Future<Map<String, dynamic>> suggestExchangeRate({
    required String targetCurrency,
    required String promptUsuario,
  }) async {
    final supabase = Supabase.instance.client;
    final functionHeaders = {
      'Authorization': 'Bearer ${SupabaseConfig.anonKey}',
      'apikey': SupabaseConfig.anonKey,
    };

    final response = await supabase.functions.invoke(
      'suggest-exchange-rate-gemini',
      body: {
        'target_currency': targetCurrency.trim().toUpperCase(),
        'prompt_usuario': promptUsuario,
      },
      headers: functionHeaders,
    );

    final data = _responseMap(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw StateError(
        'Error en suggest-exchange-rate-gemini (status ${response.status}): '
        '${data['error'] ?? 'sin detalle'}.',
      );
    }

    return data;
  }

  Map<String, dynamic> _responseMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return value.map((key, item) => MapEntry('$key', item));
    }
    return <String, dynamic>{};
  }
}
