import 'package:flutter/material.dart';

/// One destination account field shown to the merchant (bank, phone, key…).
class PaymentAccountField {
  const PaymentAccountField({
    required this.label,
    required this.value,
    this.copyable = true,
  });

  final String label;
  final String value;
  final bool copyable;

  factory PaymentAccountField.fromMap(Map<String, dynamic> row) {
    return PaymentAccountField(
      label: '${row['label'] ?? ''}'.trim(),
      value: '${row['value'] ?? ''}'.trim(),
      copyable: row['copyable'] != false,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'label': label,
      'value': value,
      'copyable': copyable,
    };
  }
}

/// A catalog entry the merchant can pay with. Sourced from `payment_methods`.
class PaymentMethodCatalog {
  const PaymentMethodCatalog({
    required this.id,
    required this.code,
    required this.name,
    required this.tagline,
    required this.verification,
    required this.kind,
    required this.isActive,
    required this.sortOrder,
    this.countryCode,
    this.localCurrency,
    this.logoUrl,
    this.brandColor,
    this.instructions,
    this.accountFields = const <PaymentAccountField>[],
    this.requiresReference = false,
    this.requiresReceipt = false,
    this.requiresAdvisorCode = false,
    this.reviewSlaMinutes = 240,
  });

  final String id;
  final String code;
  final String name;
  final String tagline;
  final String verification;
  final String kind;
  final bool isActive;
  final int sortOrder;
  final String? countryCode;
  final String? localCurrency;
  final String? logoUrl;
  final Color? brandColor;
  final String? instructions;
  final List<PaymentAccountField> accountFields;
  final bool requiresReference;
  final bool requiresReceipt;
  final bool requiresAdvisorCode;
  final int reviewSlaMinutes;

  bool get isAutomatic => verification == 'automatic';
  bool get isManual => verification == 'manual';
  bool get isCrypto => kind == 'crypto_checkout';
  bool get isGiftCard => kind == 'gift_card';
  bool get isCash => kind == 'cash';

  /// Manual methods with no destination yet must not be offered: the merchant
  /// would send money nowhere and the review queue would have nothing to match.
  bool get isReadyForCheckout {
    if (!isActive) return false;
    if (isAutomatic) return true;
    if (requiresAdvisorCode) return true;
    return accountFields.any((field) => field.value.isNotEmpty);
  }

  String get slaLabel {
    if (reviewSlaMinutes < 60) {
      return 'Revision en unos minutos';
    }
    final hours = (reviewSlaMinutes / 60).ceil();
    return hours == 1
        ? 'Revision en alrededor de 1 hora'
        : 'Revision en alrededor de $hours horas';
  }

  factory PaymentMethodCatalog.fromRow(Map<String, dynamic> row) {
    final fieldsRaw = row['account_fields'];
    final fields = <PaymentAccountField>[];
    if (fieldsRaw is List) {
      for (final item in fieldsRaw) {
        if (item is Map) {
          final field = PaymentAccountField.fromMap(
            Map<String, dynamic>.from(item),
          );
          if (field.label.isEmpty && field.value.isEmpty) continue;
          fields.add(field);
        }
      }
    }

    return PaymentMethodCatalog(
      id: '${row['id'] ?? row['code'] ?? ''}',
      code: '${row['code'] ?? ''}',
      name: '${row['name'] ?? ''}',
      tagline: '${row['tagline'] ?? ''}',
      verification: '${row['verification'] ?? 'manual'}',
      kind: '${row['kind'] ?? 'bank_transfer'}',
      isActive: row['is_active'] != false,
      sortOrder: row['sort_order'] is num
          ? (row['sort_order'] as num).toInt()
          : int.tryParse('${row['sort_order'] ?? ''}') ?? 100,
      countryCode: _nullableText(row['country_code']),
      localCurrency: _nullableText(row['local_currency']),
      logoUrl: _nullableText(row['logo_url']),
      brandColor: parseBrandColor(row['brand_color']?.toString()),
      instructions: _nullableText(row['instructions']),
      accountFields: fields,
      requiresReference: row['requires_reference'] == true,
      requiresReceipt: row['requires_receipt'] == true,
      requiresAdvisorCode: row['requires_advisor_code'] == true,
      reviewSlaMinutes: row['review_sla_minutes'] is num
          ? (row['review_sla_minutes'] as num).toInt()
          : int.tryParse('${row['review_sla_minutes'] ?? ''}') ?? 240,
    );
  }
}

class PaymentSubmission {
  const PaymentSubmission({
    required this.id,
    required this.methodCode,
    required this.status,
    required this.amountUsd,
    required this.months,
    this.reference,
    this.reviewNote,
    this.createdAt,
    this.reviewedAt,
  });

  final String id;
  final String methodCode;
  final String status;
  final double amountUsd;
  final int months;
  final String? reference;
  final String? reviewNote;
  final DateTime? createdAt;
  final DateTime? reviewedAt;

  bool get isPending => status == 'pending';
  bool get isRejected => status == 'rejected';

  factory PaymentSubmission.fromRow(Map<String, dynamic> row) {
    return PaymentSubmission(
      id: '${row['id'] ?? ''}',
      methodCode: '${row['method_code'] ?? ''}',
      status: '${row['status'] ?? 'pending'}',
      amountUsd: _asDouble(row['amount_usd']),
      months: row['months'] is num
          ? (row['months'] as num).toInt()
          : int.tryParse('${row['months'] ?? ''}') ?? 1,
      reference: _nullableText(row['reference']),
      reviewNote: _nullableText(row['review_note']),
      createdAt: _asDate(row['created_at']),
      reviewedAt: _asDate(row['reviewed_at']),
    );
  }
}

class ManualPaymentDraft {
  const ManualPaymentDraft({
    this.months = 1,
    this.reference = '',
    this.payerName = '',
    this.advisorCode = '',
    this.declaredAmount,
    this.declaredCurrency,
    this.receiptPath,
  });

  final int months;
  final String reference;
  final String payerName;
  final String advisorCode;
  final double? declaredAmount;
  final String? declaredCurrency;
  final String? receiptPath;
}

class GiftCardRedeemResult {
  const GiftCardRedeemResult({
    required this.months,
    required this.periodEnd,
    this.idempotent = false,
  });

  final int months;
  final DateTime? periodEnd;
  final bool idempotent;
}

/// Built-in catalog used when the table is empty or the migration is not on
/// this environment yet. Account numbers stay empty so we never invent a
/// destination; admin fills those in `payment_methods.account_fields`.
List<PaymentMethodCatalog> fallbackPaymentMethods() {
  return const <PaymentMethodCatalog>[
    PaymentMethodCatalog(
      id: 'crypto_usdt',
      code: 'crypto_usdt',
      name: 'Binance Pay',
      tagline: 'Pago con cripto · se activa al confirmar la red',
      verification: 'automatic',
      kind: 'crypto_checkout',
      isActive: true,
      sortOrder: 10,
      localCurrency: 'USDT',
      brandColor: Color(0xFFF3BA2F),
      instructions:
          'Te llevamos al checkout seguro de Binance Pay. La activacion es automatica en cuanto la red confirma la transaccion.',
      reviewSlaMinutes: 5,
    ),
    PaymentMethodCatalog(
      id: 'gift_card',
      code: 'gift_card',
      name: 'Tarjeta de regalo',
      tagline: 'Canjea tu codigo y se activa al instante',
      verification: 'automatic',
      kind: 'gift_card',
      isActive: true,
      sortOrder: 20,
      brandColor: Color(0xFF7C3AED),
      instructions:
          'Escribe el codigo de tu tarjeta de regalo. Se activa al instante y no necesitas enviar comprobante.',
      reviewSlaMinutes: 5,
    ),
    PaymentMethodCatalog(
      id: 'pago_movil',
      code: 'pago_movil',
      name: 'Pago movil',
      tagline: 'Transferencia interbancaria en Venezuela',
      verification: 'manual',
      kind: 'bank_transfer',
      isActive: true,
      sortOrder: 30,
      countryCode: 'VE',
      localCurrency: 'VES',
      brandColor: Color(0xFF1E4E9C),
      requiresReference: true,
      requiresReceipt: true,
    ),
    PaymentMethodCatalog(
      id: 'bancolombia',
      code: 'bancolombia',
      name: 'Bancolombia',
      tagline: 'Transferencia o consignacion',
      verification: 'manual',
      kind: 'bank_transfer',
      isActive: true,
      sortOrder: 40,
      countryCode: 'CO',
      localCurrency: 'COP',
      brandColor: Color(0xFFFDDA24),
      requiresReference: true,
      requiresReceipt: true,
    ),
    PaymentMethodCatalog(
      id: 'nequi',
      code: 'nequi',
      name: 'Nequi',
      tagline: 'Envio desde la app Nequi',
      verification: 'manual',
      kind: 'wallet',
      isActive: true,
      sortOrder: 50,
      countryCode: 'CO',
      localCurrency: 'COP',
      brandColor: Color(0xFF200020),
      requiresReference: true,
      requiresReceipt: true,
    ),
    PaymentMethodCatalog(
      id: 'bre_b',
      code: 'bre_b',
      name: 'Bre-B',
      tagline: 'Pagos inmediatos con llave',
      verification: 'manual',
      kind: 'bank_transfer',
      isActive: true,
      sortOrder: 60,
      countryCode: 'CO',
      localCurrency: 'COP',
      brandColor: Color(0xFF0033A0),
      requiresReference: true,
      requiresReceipt: true,
    ),
    PaymentMethodCatalog(
      id: 'zinli',
      code: 'zinli',
      name: 'Zinli',
      tagline: 'Transferencia desde tu cuenta Zinli',
      verification: 'manual',
      kind: 'wallet',
      isActive: true,
      sortOrder: 70,
      localCurrency: 'USD',
      brandColor: Color(0xFF00C08B),
      requiresReference: true,
      requiresReceipt: true,
    ),
    PaymentMethodCatalog(
      id: 'efectivo',
      code: 'efectivo',
      name: 'Efectivo',
      tagline: 'Solo con un asesor de venta autorizado',
      verification: 'manual',
      kind: 'cash',
      isActive: true,
      sortOrder: 80,
      brandColor: Color(0xFF15803D),
      requiresAdvisorCode: true,
      reviewSlaMinutes: 480,
    ),
  ];
}

List<PaymentMethodCatalog> mergePaymentCatalog(
  List<PaymentMethodCatalog> remote,
) {
  if (remote.isEmpty) {
    return fallbackPaymentMethods()
        .where((method) => method.isReadyForCheckout)
        .toList(growable: false);
  }

  final ordered = [...remote]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  return ordered.where((method) => method.isReadyForCheckout).toList(growable: false);
}

List<PaymentMethodCatalog> automaticPaymentMethods(
  List<PaymentMethodCatalog> methods,
) {
  return methods.where((method) => method.isAutomatic).toList(growable: false);
}

List<PaymentMethodCatalog> manualPaymentMethods(
  List<PaymentMethodCatalog> methods,
) {
  return methods.where((method) => method.isManual).toList(growable: false);
}

Color? parseBrandColor(String? raw) {
  final value = (raw ?? '').trim();
  if (!RegExp(r'^#?[0-9A-Fa-f]{6}$').hasMatch(value)) {
    return null;
  }
  final hex = value.startsWith('#') ? value.substring(1) : value;
  return Color(int.parse('FF$hex', radix: 16));
}

/// Strips separators so `EMX-ABCD-EFGH-IJKL` and `emxabcdefghijkl` match.
String normalizeGiftCardCode(String raw) {
  return raw.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toUpperCase();
}

bool isPlausibleGiftCardCode(String raw) {
  final normalized = normalizeGiftCardCode(raw);
  return normalized.length >= 12 && normalized.length <= 24;
}

String? validateManualPaymentDraft({
  required PaymentMethodCatalog method,
  required ManualPaymentDraft draft,
}) {
  if (draft.months < 1 || draft.months > 24) {
    return 'Elige entre 1 y 24 meses.';
  }
  if (method.requiresReference && draft.reference.trim().length < 4) {
    return 'Escribe el numero de referencia de la transferencia.';
  }
  if (method.requiresReceipt && (draft.receiptPath == null || draft.receiptPath!.isEmpty)) {
    return 'Sube el comprobante de pago para que podamos verificarlo.';
  }
  if (method.requiresAdvisorCode && draft.advisorCode.trim().length < 4) {
    return 'Escribe el codigo que te dio el asesor de venta autorizado.';
  }
  return null;
}

/// Maps Postgres / PostgREST exception codes to a merchant-facing sentence.
String mapBillingRpcError(Object error) {
  final text = error.toString();
  final code = _extractRpcCode(text);

  return switch (code) {
    'NOT_AUTHENTICATED' => 'Inicia sesion para continuar.',
    'NOT_BUSINESS_OWNER' => 'Esta cuenta no es la dueña de este negocio.',
    'TOO_MANY_ATTEMPTS' =>
      'Demasiados intentos. Espera 10 minutos antes de volver a canjear.',
    'GIFT_CARD_NOT_FOUND' => 'Ese codigo no existe. Revisa que lo hayas escrito bien.',
    'GIFT_CARD_ALREADY_REDEEMED' => 'Esa tarjeta de regalo ya fue canjeada.',
    'GIFT_CARD_VOID' => 'Esa tarjeta de regalo fue anulada.',
    'GIFT_CARD_EXPIRED' => 'Esa tarjeta de regalo ya vencio.',
    'METHOD_NOT_AVAILABLE' => 'Este metodo de pago no esta disponible ahora.',
    'METHOD_NOT_MANUAL' => 'Este metodo se confirma solo. No envies comprobante.',
    'REFERENCE_REQUIRED' => 'Falta el numero de referencia.',
    'RECEIPT_REQUIRED' => 'Falta el comprobante de pago.',
    'RECEIPT_NOT_FOUND' =>
      'No encontramos el comprobante. Vuelve a subirlo e intenta de nuevo.',
    'ADVISOR_CODE_INVALID' =>
      'Ese codigo de asesor no es valido. Pidelo de nuevo al asesor autorizado.',
    'SUBMISSION_ALREADY_PENDING' =>
      'Ya tienes un pago en revision. Cancela el anterior o espera la respuesta.',
    'REFERENCE_ALREADY_USED' =>
      'Esa referencia ya fue usada. Si pagaste de nuevo, usa el numero nuevo.',
    'SUBMISSION_NOT_FOUND' => 'No encontramos esa solicitud de pago.',
    'PLAN_NOT_FOUND' => 'El plan no esta disponible en este momento.',
    'INVALID_MONTHS' => 'Elige entre 1 y 24 meses.',
    _ => 'No se pudo completar el pago. Intenta de nuevo o escribe a soporte.',
  };
}

String? _extractRpcCode(String text) {
  final match = RegExp(
    r'\b([A-Z]{3,}(?:_[A-Z0-9]+)*)\b',
  ).firstMatch(text);
  return match?.group(1);
}

String? _nullableText(dynamic value) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? null : text;
}

double _asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('$value') ?? 0;
}

DateTime? _asDate(dynamic value) {
  if (value == null) return null;
  return DateTime.tryParse('$value');
}
