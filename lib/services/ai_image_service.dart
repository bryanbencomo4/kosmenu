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
    try {
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
    } on FunctionException catch (error) {
      throw StateError(formatAiImageUserMessage(_functionExceptionDetail(error)));
    }
  }

  Future<Map<String, dynamic>> enqueueOnboardingImages({
    required String comercioId,
    required String catalogId,
  }) async {
    final supabase = Supabase.instance.client;
    try {
      final response = await supabase.functions.invoke(
        'generate-product-images-ai',
        body: {'comercio_id': comercioId.trim(), 'catalog_id': catalogId.trim()},
        headers: _functionHeaders(comercioId),
      );

      return _parseResponse(response, functionName: 'generate-product-images-ai');
    } on FunctionException catch (error) {
      throw StateError(formatAiImageUserMessage(_functionExceptionDetail(error)));
    }
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
        formatAiImageUserMessage(
          '${data['message'] ?? data['error'] ?? 'sin detalle'}',
        ),
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

  String _functionExceptionDetail(FunctionException error) {
    final details = error.details;
    if (details is Map) {
      final message = details['message']?.toString().trim() ?? '';
      final code = details['error']?.toString().trim() ?? '';
      if (message.isNotEmpty) {
        return message;
      }
      if (code.isNotEmpty) {
        return code;
      }
    }
    if (details != null) {
      final raw = details.toString().trim();
      if (raw.isNotEmpty) {
        return raw;
      }
    }
    final reason = (error.reasonPhrase ?? '').trim();
    if (reason.isNotEmpty) {
      return reason;
    }
    return 'Error en generate-product-images-ai (status ${error.status}).';
  }
}

/// Whether [message] means onboarding AI product images were already consumed.
bool isAiImageOnboardingLimitMessage(String? message) {
  final normalized = (message ?? '').toLowerCase();
  return normalized.contains('only available once during onboarding') ||
      normalized.contains('ai image limit reached') ||
      normalized.contains('una vez durante el onboarding') ||
      normalized.contains('ya se uso una vez en onboarding') ||
      normalized.contains('ya se usó una vez en onboarding') ||
      normalized.contains('tope de imagenes ia del onboarding') ||
      normalized.contains('tope de imágenes ia del onboarding') ||
      normalized.contains('onboarding_image_limit') ||
      normalized.contains('onboarding_image_quota');
}

String formatAiImageUserMessage(String? rawMessage) {
  final message = (rawMessage ?? '').trim();
  if (message.isEmpty) {
    return 'No se pudo generar la imagen IA.';
  }

  final normalized = message.toLowerCase();

  if (normalized.contains('resource_exhausted') ||
      normalized.contains('prepayment credits are depleted') ||
      normalized.contains('gemini image generation failed (429)')) {
    return 'Google Gemini no tiene saldo disponible en este momento. Recarga créditos del proyecto e inténtalo de nuevo.';
  }

  if (normalized.contains('not enough credits')) {
    return 'Este comercio no tiene créditos IA suficientes para generar la imagen.';
  }

  if (isAiImageOnboardingLimitMessage(message)) {
    return 'La generación de imágenes IA solo está disponible una vez durante el onboarding. El menú sí se importó correctamente.';
  }

  if (normalized.contains('unauthorized request') ||
      normalized.contains('worker secret')) {
    return 'El servicio interno de imágenes IA no está disponible ahora mismo.';
  }

  if (normalized.contains('producto no encontrado')) {
    return 'No se encontró el producto para generar su imagen IA.';
  }

  if (normalized.contains('ya tiene una imagen manual')) {
    return 'Este producto ya tiene una imagen manual.';
  }

  final firstLine = message.split('\n').first.trim();
  return firstLine.isEmpty ? 'No se pudo generar la imagen IA.' : firstLine;
}
