import 'package:kosmenu_app/core/exchange_rate_adjustment.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Snapshot of commerce FX for admin price displays and COP↔USD editors.
///
/// [usdCopRate] is always **COP per 1 USD** (same orientation the product list
/// and form historically used). It is resolved from
/// `branding_ia.config_negocio` + live `global_market_rates`, not from the
/// legacy `comercios.exchange_rate_value` column (which often holds a VES P2P
/// rate and must not be used as USD/COP).
class CommerceFxSnapshot {
  const CommerceFxSnapshot({
    required this.baseCurrency,
    required this.usdCopRate,
  });

  final String baseCurrency;

  /// COP units per 1 USD. `0` when unavailable.
  final double usdCopRate;
}

double? _positiveRate(dynamic value) {
  if (value is num) {
    final n = value.toDouble();
    if (n.isFinite && n > 0) return n;
    return null;
  }
  final parsed = double.tryParse(
    (value ?? '').toString().trim().replaceAll(',', '.'),
  );
  if (parsed == null || !parsed.isFinite || parsed <= 0) return null;
  return parsed;
}

String _normCurrency(dynamic value) {
  final code = (value ?? '').toString().trim().toUpperCase();
  if (code.isEmpty || code == 'SIN MONEDA') return 'COP';
  return code;
}

Map<String, String> _stringMap(dynamic raw) {
  if (raw is! Map) return <String, String>{};
  final out = <String, String>{};
  for (final entry in raw.entries) {
    final key = _normCurrency(entry.key);
    final value = (entry.value ?? '').toString().trim().toLowerCase();
    if (key.isNotEmpty && value.isNotEmpty) {
      out[key] = value;
    }
  }
  return out;
}

Map<String, double> _rateMap(dynamic raw) {
  if (raw is! Map) return <String, double>{};
  final out = <String, double>{};
  for (final entry in raw.entries) {
    final key = _normCurrency(entry.key);
    final value = _positiveRate(entry.value);
    if (key.isNotEmpty && value != null) {
      out[key] = value;
    }
  }
  return out;
}

Map<String, ExchangeRateAdjustment> _adjustmentMap(dynamic raw) {
  if (raw is! Map) return <String, ExchangeRateAdjustment>{};
  final out = <String, ExchangeRateAdjustment>{};
  for (final entry in raw.entries) {
    final key = _normCurrency(entry.key);
    final adjustment = ExchangeRateAdjustment.fromMap(entry.value);
    if (key.isNotEmpty && adjustment != null) {
      out[key] = adjustment;
    }
  }
  return out;
}

Map<String, double> _googleAnchors(dynamic payload) {
  final out = <String, double>{};
  if (payload is! Map) return out;
  final raw = payload['google_rates'];
  if (raw is! Map) return out;
  for (final entry in raw.entries) {
    final key = entry.key.toString().trim().toUpperCase();
    final value = _positiveRate(entry.value);
    if (key.isNotEmpty && value != null) {
      out[key] = value;
    }
  }
  return out;
}

/// Google Finance pair rate as **quote units per 1 base unit**.
double _googleRateForPair(
  String baseCurrency,
  String quoteCurrency,
  Map<String, double> anchors,
) {
  final base = _normCurrency(baseCurrency);
  final quote = _normCurrency(quoteCurrency);
  if (base == quote) return 1;

  final direct = anchors['$base/$quote'] ?? 0;
  if (direct > 0) return direct;

  final usdCop = anchors['USD/COP'] ?? 0;
  final usdEur = anchors['USD/EUR'] ?? 0;
  final vesUsd = anchors['VES/USD'] ?? 0;

  if (base == 'USD' && quote == 'COP' && usdCop > 0) return usdCop;
  if (base == 'COP' && quote == 'USD' && usdCop > 0) return 1 / usdCop;
  if (base == 'USD' && quote == 'EUR' && usdEur > 0) return usdEur;
  if (base == 'EUR' && quote == 'USD' && usdEur > 0) return 1 / usdEur;
  if (base == 'USD' && quote == 'VES' && vesUsd > 0) return 1 / vesUsd;
  if (base == 'VES' && quote == 'USD' && vesUsd > 0) return vesUsd;
  if (base == 'COP' && quote == 'EUR' && usdCop > 0 && usdEur > 0) {
    return usdEur / usdCop;
  }
  if (base == 'EUR' && quote == 'COP' && usdCop > 0 && usdEur > 0) {
    return usdCop / usdEur;
  }
  return 0;
}

double _sourceRateQuotePerBase({
  required String baseCurrency,
  required String quoteCurrency,
  required Map<String, double> googleAnchors,
}) {
  final base = _normCurrency(baseCurrency);
  final quote = _normCurrency(quoteCurrency);
  if (base == quote) return 1;

  // COP↔USD is always Google Finance (BCV/P2P only apply to VES pairs).
  return _googleRateForPair(base, quote, googleAnchors);
}

/// Resolves **COP per 1 USD** from branding modes/sources + live market rates.
double resolveUsdCopRate({
  required String baseCurrency,
  required Map<String, String> exchangeRateModes,
  required Map<String, String> exchangeRateSources,
  required Map<String, double> exchangeRates,
  required Map<String, ExchangeRateAdjustment> exchangeRateAdjustments,
  required Map<String, double> googleAnchors,
  double? legacyExchangeRateValue,
}) {
  final base = _normCurrency(baseCurrency);
  final googleUsdCop = googleAnchors['USD/COP'] ?? 0;

  final quote = base == 'USD' ? 'COP' : 'USD';
  final pairBase = (base == 'COP' || base == 'USD') ? base : 'USD';
  final pairQuote = pairBase == 'COP' ? 'USD' : 'COP';

  final mode = (exchangeRateModes[quote] ??
          exchangeRateModes[pairQuote] ??
          'auto')
      .trim()
      .toLowerCase();
  final source = (exchangeRateSources[quote] ??
          exchangeRateSources[pairQuote] ??
          'google')
      .trim()
      .toLowerCase();
  final snapshot = exchangeRates[quote] ?? exchangeRates[pairQuote];

  double? quotePerBase;

  if (mode == 'auto' || mode == exchangeModeAutomaticAdjusted) {
    final live = _sourceRateQuotePerBase(
      baseCurrency: pairBase,
      quoteCurrency: pairQuote,
      googleAnchors: googleAnchors,
    );
    if (live > 0 && live != 1) {
      quotePerBase = resolveEffectiveExchangeRate(
        ExchangeRateConfig(
          mode: 'auto',
          adjustment: isAdjustableExchangeSource(source)
              ? exchangeRateAdjustments[quote] ??
                  exchangeRateAdjustments[pairQuote]
              : null,
        ),
        live,
      );
    }
  }

  if (quotePerBase == null || quotePerBase <= 0) {
    if (mode == 'manual' && snapshot != null && snapshot > 0) {
      quotePerBase = snapshot;
    } else if (snapshot != null && snapshot > 0 && snapshot != 1) {
      quotePerBase = snapshot;
    }
  }

  // Convert quote-per-base into COP-per-USD.
  if (quotePerBase != null && quotePerBase > 0) {
    if (pairBase == 'COP') {
      // quotePerBase is USD per 1 COP → invert.
      final usdCop = 1 / quotePerBase;
      if (usdCop.isFinite && usdCop > 0) return usdCop;
    }
    if (pairBase == 'USD') {
      // quotePerBase is already COP per 1 USD.
      return quotePerBase;
    }
  }

  if (googleUsdCop > 0) return googleUsdCop;

  // Legacy column only when there is no per-currency FX config at all.
  // Never use it when USD/COP is configured (it often holds a VES P2P rate).
  final hasConfiguredPair = exchangeRateModes.containsKey('USD') ||
      exchangeRateModes.containsKey('COP') ||
      exchangeRateSources.containsKey('USD') ||
      exchangeRateSources.containsKey('COP');
  final legacy = legacyExchangeRateValue;
  if (!hasConfiguredPair &&
      legacy != null &&
      legacy.isFinite &&
      legacy > 0 &&
      legacy != 1) {
    return legacy;
  }

  return 0;
}

/// Loads [CommerceFxSnapshot] for the active commerce.
Future<CommerceFxSnapshot> loadCommerceFx(
  SupabaseClient client,
  String comercioId,
) async {
  final id = comercioId.trim();
  if (id.isEmpty) {
    return const CommerceFxSnapshot(baseCurrency: 'USD', usdCopRate: 0);
  }

  final comercio = await client
      .from('comercios')
      .select(
        'moneda, exchange_rate_value, tasa_cambio_pesos, branding_ia',
      )
      .eq('id', id)
      .maybeSingle();

  final base = _normCurrency(comercio?['moneda']);
  final legacy = _positiveRate(
        comercio?['exchange_rate_value'],
      ) ??
      _positiveRate(comercio?['tasa_cambio_pesos']);

  final branding = comercio?['branding_ia'];
  final config = branding is Map ? branding['config_negocio'] : null;

  final modes = _stringMap(config is Map ? config['exchange_rate_modes'] : null);
  final sources =
      _stringMap(config is Map ? config['exchange_rate_sources'] : null);
  final rates = _rateMap(config is Map ? config['exchange_rates'] : null);
  final adjustments =
      _adjustmentMap(config is Map ? config['exchange_rate_adjustments'] : null);

  Map<String, double> googleAnchors = <String, double>{};

  try {
    final market = await client
        .from('global_market_rates')
        .select('payload')
        .order('updated_at', ascending: false)
        .limit(1)
        .maybeSingle();
    googleAnchors = _googleAnchors(market?['payload']);
  } catch (_) {
    // Keep snapshot with branding-only / legacy fallbacks.
  }

  final usdCop = resolveUsdCopRate(
    baseCurrency: base,
    exchangeRateModes: modes,
    exchangeRateSources: sources,
    exchangeRates: rates,
    exchangeRateAdjustments: adjustments,
    googleAnchors: googleAnchors,
    legacyExchangeRateValue: legacy,
  );

  return CommerceFxSnapshot(baseCurrency: base, usdCopRate: usdCop);
}
