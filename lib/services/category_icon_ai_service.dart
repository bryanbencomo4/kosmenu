import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class CategoryIconAiSuggestion {
  const CategoryIconAiSuggestion({
    required this.emoji,
    required this.reason,
    required this.confidence,
    required this.creditsCharged,
  });

  final String emoji;
  final String reason;
  final double confidence;
  final double creditsCharged;

  factory CategoryIconAiSuggestion.fromMap(Map<String, dynamic> map) {
    return CategoryIconAiSuggestion(
      emoji: map['emoji']?.toString().trim() ??
          '',
      reason: map['reason']?.toString().trim() ?? '',
      confidence: (map['confidence'] as num?)?.toDouble() ??
          double.tryParse('${map['confidence'] ?? 0.7}') ??
          0.7,
      creditsCharged: (map['credits_charged'] as num?)?.toDouble() ??
          double.tryParse('${map['credits_charged'] ?? 1}') ??
          1,
    );
  }
}

class CategoryIconAiService {
  const CategoryIconAiService();

  Future<CategoryIconAiSuggestion> generateIcon({
    required String comercioId,
    required String categoryName,
    String? context,
  }) async {
    final supabase = Supabase.instance.client;
    try {
      final response = await supabase.functions.invoke(
        'generate-category-icon-gemini',
        body: {
          'comercio_id': comercioId.trim(),
          'category_name': categoryName.trim(),
          'context': (context ?? '').trim(),
        },
        headers: {
          'Authorization': 'Bearer ${SupabaseConfig.anonKey}',
          'apikey': SupabaseConfig.anonKey,
          'x-comercio-id': comercioId.trim(),
        },
      );

      final data = _responseMap(response.data);
      if (response.status < 200 || response.status >= 300) {
        throw StateError(
          _friendlyErrorMessage(
            status: response.status,
            detail: '${data['message'] ?? data['error'] ?? 'sin detalle'}',
          ),
        );
      }

      final suggestion = CategoryIconAiSuggestion.fromMap(data);
      if (suggestion.emoji.isEmpty) {
        throw StateError('No se pudo sugerir el emoji de la categoría.');
      }
      return suggestion;
    } on FunctionException catch (error) {
      throw StateError(
        _friendlyErrorMessage(
          status: error.status,
          detail: '${error.details ?? error.reasonPhrase ?? error.toString()}',
        ),
      );
    } catch (error) {
      throw StateError(_friendlyErrorMessage(detail: error.toString()));
    }
  }

  String _friendlyErrorMessage({int? status, String? detail}) {
    final normalized = (detail ?? '').toLowerCase();
    if (normalized.contains('not enough credits')) {
      return 'No tienes créditos IA suficientes para generar un icono.';
    }
    if (normalized.contains('ai disabled')) {
      return 'La IA no está habilitada para este comercio.';
    }
    if (normalized.contains('boot_error') ||
        normalized.contains('function failed to start') ||
        normalized.contains('service unavailable') ||
        status == 503) {
      return 'El servicio de iconos IA no está disponible en este momento. Inténtalo nuevamente en unos minutos.';
    }
    if (normalized.contains('gemini error')) {
      return 'No se pudo sugerir el emoji con IA en este momento.';
    }
    if (normalized.contains('emoji')) {
      return 'No se pudo sugerir el emoji de la categoría.';
    }
    if (normalized.contains('missing comercio_id')) {
      return 'No se encontró el comercio activo para generar el icono.';
    }
    return 'No se pudo sugerir el emoji con IA.';
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