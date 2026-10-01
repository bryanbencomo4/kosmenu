import 'package:intl/intl.dart';

/// Derived mode name for "Tasa automatica con ajuste".
///
/// It is NOT persisted as `exchange_rate_mode` (the DB enum and every legacy
/// reader only know `manual` / `auto`). A business is in this mode when its
/// mode is `auto` and its [ExchangeRateAdjustment.isActive] is true.
const String exchangeModeAutomaticAdjusted = 'automatic_adjusted';

/// Automatic sources that accept a commercial adjustment.
const Set<String> adjustableExchangeSources = <String>{
  'bcv',
  'bcv_usd',
  'bcv_eur',
  'p2p_binance',
};

bool isAdjustableExchangeSource(String source) {
  return adjustableExchangeSources.contains(source.trim().toLowerCase());
}

/// Relative adjustment applied on top of an automatic source rate.
///
/// `effectiveRate = sourceRate * factor`, so the business keeps following the
/// source while preserving its commercial difference.
/// Persisted per quote currency in
/// `branding_ia.config_negocio.exchange_rate_adjustments`.
class ExchangeRateAdjustment {
  const ExchangeRateAdjustment({
    required this.enabled,
    this.factor,
    this.referenceValue,
    this.referenceInverted = false,
  });

  final bool enabled;

  /// `commercialRate / sourceRate` at the moment the seller set the reference.
  final double? factor;

  /// Value typed by the seller (e.g. 3 for "1 VES equivale a 3 COP").
  final double? referenceValue;

  /// true => reference reads "1 quote = X base"; false => "1 base = X quote".
  final bool referenceInverted;

  bool get isActive {
    final value = factor;
    return enabled && value != null && value.isFinite && value > 0;
  }

  ExchangeRateAdjustment copyWith({
    bool? enabled,
    double? factor,
    double? referenceValue,
    bool? referenceInverted,
  }) {
    return ExchangeRateAdjustment(
      enabled: enabled ?? this.enabled,
      factor: factor ?? this.factor,
      referenceValue: referenceValue ?? this.referenceValue,
      referenceInverted: referenceInverted ?? this.referenceInverted,
    );
  }

  Map<String, dynamic> toMap() {
    return <String, dynamic>{
      'enabled': enabled,
      'factor': factor,
      'reference_value': referenceValue,
      'reference_inverted': referenceInverted,
    };
  }

  /// Returns null when [raw] is absent or malformed (legacy businesses).
  static ExchangeRateAdjustment? fromMap(dynamic raw) {
    if (raw is! Map) {
      return null;
    }
    double? positive(dynamic value) {
      final parsed = value is num
          ? value.toDouble()
          : double.tryParse(value?.toString().trim() ?? '');
      if (parsed == null || !parsed.isFinite || parsed <= 0) {
        return null;
      }
      return parsed;
    }

    return ExchangeRateAdjustment(
      enabled: raw['enabled'] == true,
      factor: positive(raw['factor']),
      referenceValue: positive(raw['reference_value']),
      referenceInverted: raw['reference_inverted'] == true,
    );
  }
}

class ExchangeRateConfig {
  const ExchangeRateConfig({this.mode, this.adjustment});

  /// `manual`, `auto` (or the derived `automatic_adjusted`).
  final String? mode;
  final ExchangeRateAdjustment? adjustment;
}

/// `factor = commercialRate / sourceRate`; null if either is not positive.
double? computeAdjustmentFactor({
  required double commercialRate,
  required double sourceRate,
}) {
  if (!commercialRate.isFinite ||
      commercialRate <= 0 ||
      !sourceRate.isFinite ||
      sourceRate <= 0) {
    return null;
  }
  return commercialRate / sourceRate;
}

/// Converts the seller's reference into a commercial rate (quote per base).
double? commercialRateFromReference({
  required double referenceValue,
  required bool inverted,
}) {
  if (!referenceValue.isFinite || referenceValue <= 0) {
    return null;
  }
  return inverted ? 1 / referenceValue : referenceValue;
}

/// Single entry point that turns a source (or manual) rate into the rate used
/// for every conversion. Manual rates and non-adjusted automatic rates are
/// returned untouched. No rounding is applied here.
double resolveEffectiveExchangeRate(
  ExchangeRateConfig? config,
  double sourceRate,
) {
  if (!sourceRate.isFinite || sourceRate <= 0) {
    return 0;
  }
  final mode = (config?.mode ?? '').trim().toLowerCase();
  if (mode == 'manual') {
    return sourceRate;
  }
  final adjustment = config?.adjustment;
  if (adjustment != null && adjustment.isActive) {
    return sourceRate * adjustment.factor!;
  }
  return sourceRate;
}

enum AdjustmentReferenceStatus { empty, invalid, valid }

class AdjustmentReferenceParse {
  const AdjustmentReferenceParse(this.status, [this.value]);

  final AdjustmentReferenceStatus status;
  final double? value;

  /// Empty is neutral (no error while the seller is still typing).
  String? get errorMessage => status == AdjustmentReferenceStatus.invalid
      ? 'Ingresa un valor mayor que 0.'
      : null;
}

/// Parses what the seller typed ("3", "3,5", "1.250,5"). Never throws.
AdjustmentReferenceParse parseAdjustmentReference(String? raw) {
  final text = (raw ?? '').replaceAll(RegExp(r'\s'), '');
  if (!RegExp(r'\d').hasMatch(text)) {
    return const AdjustmentReferenceParse(AdjustmentReferenceStatus.empty);
  }
  if (!RegExp(r'^[0-9.,]+$').hasMatch(text)) {
    return const AdjustmentReferenceParse(AdjustmentReferenceStatus.invalid);
  }

  final lastComma = text.lastIndexOf(',');
  final lastDot = text.lastIndexOf('.');
  final commaCount = ','.allMatches(text).length;
  final dotCount = '.'.allMatches(text).length;

  String normalized;
  if (lastComma >= 0 && lastDot >= 0) {
    final decimalIndex = lastComma > lastDot ? lastComma : lastDot;
    normalized =
        '${text.substring(0, decimalIndex).replaceAll(RegExp(r'[.,]'), '')}.${text.substring(decimalIndex + 1)}';
  } else if (commaCount + dotCount > 1) {
    normalized = text.replaceAll(RegExp(r'[.,]'), '');
  } else {
    normalized = text.replaceAll(',', '.');
  }

  final value = double.tryParse(normalized);
  if (value == null || !value.isFinite || value <= 0) {
    return const AdjustmentReferenceParse(AdjustmentReferenceStatus.invalid);
  }
  return AdjustmentReferenceParse(AdjustmentReferenceStatus.valid, value);
}

/// Text for the reference field: up to 6 decimals, comma as decimal mark.
String formatAdjustmentReferenceInput(double value) {
  if (!value.isFinite || value <= 0) {
    return '';
  }
  var fixed = value.toStringAsFixed(6);
  if (fixed.contains('.')) {
    fixed = fixed.replaceAll(RegExp(r'0+$'), '').replaceAll(RegExp(r'\.$'), '');
  }
  return fixed.replaceAll('.', ',');
}

/// Money-like amount with the project's es_CO formatting (16.666,67).
String formatAdjustmentAmount(double value) {
  final format = NumberFormat.decimalPattern('es_CO')
    ..minimumFractionDigits = 2
    ..maximumFractionDigits = 2;
  return format.format(value);
}

/// Whole-number sample amount (50.000).
String formatAdjustmentSample(double value) {
  return NumberFormat.decimalPattern('es_CO').format(value);
}

/// Display-only rate with 4 decimals (0,3448); calculations never use it.
String formatAdjustmentRate(double value) {
  final format = NumberFormat.decimalPattern('es_CO')
    ..minimumFractionDigits = 4
    ..maximumFractionDigits = 4;
  return format.format(value);
}

/// "+14,94 %" / "-8,10 %" for the optional "Ver detalles" section.
String formatAdjustmentPercent(double factor) {
  final percent = (factor - 1) * 100;
  final format = NumberFormat.decimalPattern('es_CO')
    ..minimumFractionDigits = 2
    ..maximumFractionDigits = 2;
  final sign = percent >= 0 ? '+' : '-';
  return '$sign${format.format(percent.abs())} %';
}

/// Factor with 6 decimals for "Ver detalles" (never shown outside it).
String formatAdjustmentFactor(double factor) {
  final format = NumberFormat.decimalPattern('es_CO')
    ..minimumFractionDigits = 6
    ..maximumFractionDigits = 6;
  return format.format(factor);
}
