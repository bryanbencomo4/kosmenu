import 'package:kosmenu_app/core/constants.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ProductDescriptionAiResult {
  const ProductDescriptionAiResult({
    required this.description,
    required this.visualKind,
    required this.creditsCharged,
  });

  final String description;
  final String visualKind;
  final double creditsCharged;

  factory ProductDescriptionAiResult.fromMap(Map<String, dynamic> map) {
    return ProductDescriptionAiResult(
      description: map['description']?.toString().trim() ?? '',
      visualKind: map['visual_kind']?.toString().trim() ?? 'retail',
      creditsCharged:
          (map['credits_charged'] as num?)?.toDouble() ??
          double.tryParse('${map['credits_charged'] ?? 1}') ??
          1,
    );
  }
}

class ProductDescriptionAiService {
  const ProductDescriptionAiService();

  Future<ProductDescriptionAiResult> generateDescription({
    required String comercioId,
    required String productName,
    String? categoryName,
    String? description,
    String? businessName,
    String? businessCategory,
  }) async {
    final supabase = Supabase.instance.client;
    try {
      final response = await supabase.functions.invoke(
        'generate-product-description-gemini',
        body: {
          'comercio_id': comercioId.trim(),
          'product_name': productName.trim(),
          if ((categoryName ?? '').trim().isNotEmpty)
            'category_name': categoryName!.trim(),
          if ((description ?? '').trim().isNotEmpty)
            'description': description!.trim(),
          if ((businessName ?? '').trim().isNotEmpty)
            'business_name': businessName!.trim(),
          if ((businessCategory ?? '').trim().isNotEmpty)
            'business_category': businessCategory!.trim(),
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

      final result = ProductDescriptionAiResult.fromMap(data);
      if (result.description.isEmpty) {
        throw StateError('No se pudo generar la descripción del producto.');
      }
      return result;
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
      return 'No tienes créditos IA suficientes para generar la descripción.';
    }
    if (normalized.contains('ai disabled')) {
      return 'La IA no está habilitada para este comercio.';
    }
    if (normalized.contains('gemini') || normalized.contains('description generation failed')) {
      return 'No se pudo generar la descripción con IA en este momento.';
    }
    return 'No se pudo generar la descripción con IA.';
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
