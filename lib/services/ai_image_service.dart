import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AiImageService {
  const AiImageService();

  Future<Map<String, dynamic>> enqueueProductImage({
    required String comercioId,
    required String productId,
    required String productName,
    String? description,
    String? categoryName,
    String? customPrompt,
  }) async {
    final supabase = Supabase.instance.client;
    final response = await supabase.functions.invoke(
      'generate-product-images-ai',
      body: {
        'comercio_id': comercioId.trim(),
        'items': [
          {
            'type': 'product',
            'id': productId.trim(),
            'name': productName.trim(),
            'description': (description ?? '').trim(),
            'category_name': (categoryName ?? '').trim(),
            'image_prompt': (customPrompt ?? '').trim(),
          },
        ],
      },
      headers: _functionHeaders(comercioId),
    );

    return _parseResponse(response, functionName: 'generate-product-images-ai');
  }

  Future<Map<String, dynamic>> enqueueOnboardingImages({
    required String comercioId,
    required String catalogId,
  }) async {
    final supabase = Supabase.instance.client;
    final response = await supabase.functions.invoke(
      'generate-product-images-ai',
      body: {'comercio_id': comercioId.trim(), 'catalog_id': catalogId.trim()},
      headers: _functionHeaders(comercioId),
    );

    return _parseResponse(response, functionName: 'generate-product-images-ai');
  }

  Map<String, String> _functionHeaders(String comercioId) {
    final session = Supabase.instance.client.auth.currentSession;
    final token = session?.accessToken ?? SupabaseConfig.anonKey;
    return {
      'Authorization': 'Bearer $token',
      'apikey': SupabaseConfig.anonKey,
      'x-comercio-id': comercioId.trim(),
    };
  }

  Map<String, dynamic> _parseResponse(
    FunctionResponse response, {
    required String functionName,
  }) {
    final data = _responseMap(response.data);
    if (response.status < 200 || response.status >= 300) {
      throw StateError(
        'Error en $functionName (status ${response.status}): '
        '${data['message'] ?? data['error'] ?? 'sin detalle'}.',
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
