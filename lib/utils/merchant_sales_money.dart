import 'package:intl/intl.dart';

import '../models/pedido.dart';
import '../services/order_manager_service.dart';

/// Money helpers for merchant sales charts (pure; no UI).
///
/// Checkout totals stay in their native currency. ≈USD is derived from the
/// order snapshot when possible, otherwise from business/market units-per-USD
/// (same fallback strategy as admin.elmenuxfa.com).

class MerchantOrderMoney {
  const MerchantOrderMoney({
    required this.currency,
    required this.amount,
    required this.baseCurrency,
    required this.baseAmount,
    required this.exchangeRate,
    required this.usdEstimate,
  });

  final String currency;
  final double amount;
  final String baseCurrency;
  final double baseAmount;
  final double? exchangeRate;
  final double? usdEstimate;
}

class MerchantCurrencyBucket {
  const MerchantCurrencyBucket({
    required this.currency,
    required this.amount,
    required this.count,
  });

  final String currency;
  final double amount;
  final int count;
}

class MerchantSalesTotals {
  const MerchantSalesTotals({
    required this.orderCount,
    required this.buckets,
    required this.usdEstimate,
    required this.usdCoveredOrders,
    required this.chartAmount,
    required this.chartIsUsd,
    required this.chartCurrency,
  });

  final int orderCount;
  final List<MerchantCurrencyBucket> buckets;
  final double? usdEstimate;
  final int usdCoveredOrders;

  /// Comparable value used by the line chart / primary total.
  final double chartAmount;
  final bool chartIsUsd;
  final String chartCurrency;
}

String normalizeMerchantCurrency(String? value, {String fallback = 'COP'}) {
  final raw = (value ?? '').trim().toUpperCase();
  if (raw.isEmpty) return fallback;
  if (raw == 'BS' || raw == 'BSS' || raw == 'BOLIVARES' || raw == 'BOLÍVARES') {
    return 'VES';
  }
  if (raw == 'US\$' ||
      raw == 'DOLAR' ||
      raw == 'DOLARES' ||
      raw == 'DÓLAR' ||
      raw == 'DÓLARES') {
    return 'USD';
  }
  if (raw == 'PESOS' || raw == 'COLOMBIANOS') return 'COP';
  return raw.length <= 8 ? raw : raw.substring(0, 8);
}

double? _asDouble(dynamic value) {
  if (value is num) return value.toDouble();
  if (value is String && value.trim().isNotEmpty) {
    return double.tryParse(value.replaceAll(',', '').trim());
  }
  return null;
}

double? _positiveUnitsPerUsd(dynamic value) {
  final rate = _asDouble(value);
  if (rate == null || !rate.isFinite || rate <= 1) return null;
  return rate;
}

Map<String, dynamic> _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, val) => MapEntry(key.toString(), val));
  }
  return const <String, dynamic>{};
}

/// Builds "units of currency per 1 USD" like admin (`admin-usd-rates.ts`).
Map<String, double> resolveMerchantUnitsPerUsd({
  Map<String, dynamic>? comercioRow,
  Map<String, dynamic>? marketRow,
}) {
  final out = <String, double>{};

  void put(String currency, dynamic value, {bool onlyIfMissing = false}) {
    final rate = _positiveUnitsPerUsd(value);
    if (rate == null) return;
    final code = normalizeMerchantCurrency(currency);
    if (onlyIfMissing && out.containsKey(code)) return;
    out[code] = rate;
  }

  final comercio = comercioRow;
  if (comercio != null) {
    final moneda = normalizeMerchantCurrency(
      comercio['moneda']?.toString(),
      fallback: '',
    );
    final quote = normalizeMerchantCurrency(
      comercio['exchange_rate_quote_currency']?.toString(),
      fallback: '',
    );
    final branding = _asMap(comercio['branding_ia']);
    final config = _asMap(branding['config_negocio']);
    final configuredRates = _asMap(config['exchange_rates']);

    put('COP', comercio['tasa_cambio_pesos']);
    put('COP', config['tasa_cambio_pesos']);
    put('COP', configuredRates['COP']);

    final exchangeValue = _positiveUnitsPerUsd(comercio['exchange_rate_value']) ??
        _positiveUnitsPerUsd(config['exchange_rate_value']);
    if (exchangeValue != null) {
      if (quote == 'USD' || (quote.isEmpty && moneda == 'VES')) {
        put(moneda.isEmpty ? 'VES' : moneda, exchangeValue);
      } else if (moneda == 'USD' && quote.isNotEmpty) {
        put(quote, exchangeValue);
      } else if (moneda == 'VES') {
        put('VES', exchangeValue);
      }
    }

    put('VES', configuredRates['VES']);
    put('EUR', configuredRates['EUR']);
    for (final entry in configuredRates.entries) {
      put(entry.key, entry.value);
    }
  }

  // Market rates only fill gaps — business commercial rates win (like admin).
  final market = marketRow;
  if (market != null) {
    final payload = _asMap(market['payload']);
    final googleRates = _asMap(payload['google_rates']);
    final bcvRates = _asMap(payload['bcv_rates']);

    put('COP', googleRates['USD/COP'], onlyIfMissing: true);
    put('EUR', googleRates['USD/EUR'], onlyIfMissing: true);
    put('VES', bcvRates['USD'] ?? market['bcv_rate'], onlyIfMissing: true);
    put('VES', market['p2p_binance_rate'], onlyIfMissing: true);

    final vesUsd = _positiveUnitsPerUsd(googleRates['VES/USD']);
    if (!out.containsKey('VES') && vesUsd != null && vesUsd < 1) {
      out['VES'] = 1 / vesUsd;
    }
  }

  return out;
}

MerchantOrderMoney extractMerchantOrderMoney(
  PedidoModel pedido, {
  Map<String, double>? unitsPerUsd,
}) {
  final detalles = pedido.detalles;
  final checkoutCurrency = normalizeMerchantCurrency(
    pedido.checkoutCurrencySnapshot,
    fallback: '',
  );
  final checkoutTotal = pedido.checkoutTotalSnapshot;
  final hasCheckout =
      checkoutCurrency.isNotEmpty && checkoutTotal != null && checkoutTotal > 0;

  final baseAmount = _asDouble(detalles['total']) ?? pedido.total ?? 0.0;
  final exchangeRate = pedido.exchangeRateSnapshot;

  String baseCurrency;
  final rawBase = (detalles['moneda_base'] ?? detalles['moneda'])?.toString();
  if (rawBase != null && rawBase.trim().isNotEmpty) {
    baseCurrency = normalizeMerchantCurrency(rawBase);
  } else if (hasCheckout && (exchangeRate == null || exchangeRate == 1)) {
    baseCurrency = checkoutCurrency;
  } else if (hasCheckout) {
    baseCurrency = 'USD';
  } else {
    baseCurrency = normalizeMerchantCurrency(
      pedido.currencyForDisplay(),
      fallback: 'COP',
    );
  }

  final currency = hasCheckout
      ? checkoutCurrency
      : normalizeMerchantCurrency(
          pedido.currencyForDisplay(fallback: baseCurrency),
        );
  final checkoutAmount = checkoutTotal;
  final double amount;
  if (hasCheckout && checkoutAmount != null) {
    amount = checkoutAmount;
  } else {
    final display = pedido.totalForDisplay(currency);
    amount = display > 0 ? display : (baseAmount > 0 ? baseAmount : 0.0);
  }

  final safeBaseAmount = baseAmount > 0 ? baseAmount : amount;

  return MerchantOrderMoney(
    currency: currency,
    amount: amount,
    baseCurrency: baseCurrency,
    baseAmount: safeBaseAmount,
    exchangeRate: exchangeRate,
    usdEstimate: _estimateUsd(
      currency: currency,
      amount: amount,
      baseCurrency: baseCurrency,
      baseAmount: safeBaseAmount,
      exchangeRate: exchangeRate,
      unitsPerUsd: unitsPerUsd,
    ),
  );
}

double? _estimateUsd({
  required String currency,
  required double amount,
  required String baseCurrency,
  required double baseAmount,
  required double? exchangeRate,
  Map<String, double>? unitsPerUsd,
}) {
  if (amount <= 0 && baseAmount <= 0) return null;
  if (currency == 'USD') return amount > 0 ? amount : null;

  if (baseCurrency == 'USD' &&
      baseAmount > 0 &&
      (amount <= 0 || (baseAmount - amount).abs() > 0.01)) {
    return baseAmount;
  }

  if (baseCurrency == 'USD' &&
      currency != 'USD' &&
      exchangeRate != null &&
      exchangeRate > 0 &&
      exchangeRate != 1 &&
      amount > 0) {
    return amount / exchangeRate;
  }

  final perUsd = unitsPerUsd?[currency];
  if (currency != 'USD' &&
      amount > 0 &&
      perUsd != null &&
      perUsd.isFinite &&
      perUsd > 1) {
    return amount / perUsd;
  }

  if (baseCurrency != 'USD' &&
      baseCurrency != currency &&
      baseAmount > 0) {
    final basePerUsd = unitsPerUsd?[baseCurrency];
    if (basePerUsd != null && basePerUsd.isFinite && basePerUsd > 1) {
      return baseAmount / basePerUsd;
    }
  }

  return null;
}

/// Converts [amount] from [fromCurrency] into [toCurrency] using units-per-USD.
double? convertMerchantAmount({
  required double amount,
  required String fromCurrency,
  required String toCurrency,
  Map<String, double>? unitsPerUsd,
  double? usdEstimate,
}) {
  if (amount <= 0) return null;
  final from = normalizeMerchantCurrency(fromCurrency);
  final to = normalizeMerchantCurrency(toCurrency);
  if (from == to) return amount;

  if (to == 'USD') {
    if (usdEstimate != null && usdEstimate > 0) return usdEstimate;
    final perUsd = unitsPerUsd?[from];
    if (perUsd != null && perUsd > 1) return amount / perUsd;
    return null;
  }

  if (from == 'USD') {
    final perUsd = unitsPerUsd?[to];
    if (perUsd != null && perUsd > 1) return amount * perUsd;
    return null;
  }

  final fromPerUsd = unitsPerUsd?[from];
  final toPerUsd = unitsPerUsd?[to];
  if (fromPerUsd != null &&
      fromPerUsd > 1 &&
      toPerUsd != null &&
      toPerUsd > 1) {
    return (amount / fromPerUsd) * toPerUsd;
  }

  if (usdEstimate != null && usdEstimate > 0 && toPerUsd != null && toPerUsd > 1) {
    return usdEstimate * toPerUsd;
  }
  return null;
}

double sumAmountsInCurrency({
  required Map<String, double> byCurrency,
  required String toCurrency,
  Map<String, double>? unitsPerUsd,
  double usdEstimate = 0,
}) {
  final to = normalizeMerchantCurrency(toCurrency);
  if (to == 'USD') return usdEstimate > 0 ? usdEstimate : 0;
  var sum = 0.0;
  var any = false;
  for (final entry in byCurrency.entries) {
    if (entry.value <= 0) continue;
    final converted = convertMerchantAmount(
      amount: entry.value,
      fromCurrency: entry.key,
      toCurrency: to,
      unitsPerUsd: unitsPerUsd,
      usdEstimate: entry.key == 'USD' ? entry.value : null,
    );
    if (converted == null) continue;
    sum += converted;
    any = true;
  }
  if (any) return sum;
  if (usdEstimate > 0) {
    final viaUsd = convertMerchantAmount(
      amount: usdEstimate,
      fromCurrency: 'USD',
      toCurrency: to,
      unitsPerUsd: unitsPerUsd,
      usdEstimate: usdEstimate,
    );
    if (viaUsd != null) return viaUsd;
  }
  return byCurrency[to] ?? 0;
}

MerchantSalesTotals summarizeMerchantSales(
  Iterable<PedidoModel> orders, {
  Map<String, double>? unitsPerUsd,
  String? preferredCurrency,
}) {
  final active = orders
      .where((o) => !o.isArchived)
      .where((o) => o.statusBucket != OrderStatusBucket.canceled)
      .toList(growable: false);

  final preferred = preferredCurrency == null || preferredCurrency.trim().isEmpty
      ? null
      : normalizeMerchantCurrency(preferredCurrency);

  final byCurrency = <String, ({double amount, int count})>{};
  var usdSum = 0.0;
  var usdCovered = 0;
  var preferredSum = 0.0;
  var preferredCovered = 0;

  for (final pedido in active) {
    final money = extractMerchantOrderMoney(
      pedido,
      unitsPerUsd: unitsPerUsd,
    );
    if (money.amount <= 0) continue;
    final prev = byCurrency[money.currency];
    byCurrency[money.currency] = (
      amount: (prev?.amount ?? 0) + money.amount,
      count: (prev?.count ?? 0) + 1,
    );
    final usd = money.usdEstimate;
    if (usd != null && usd > 0) {
      usdSum += usd;
      usdCovered += 1;
    }
    if (preferred != null) {
      final converted = convertMerchantAmount(
        amount: money.amount,
        fromCurrency: money.currency,
        toCurrency: preferred,
        unitsPerUsd: unitsPerUsd,
        usdEstimate: usd,
      );
      if (converted != null && converted > 0) {
        preferredSum += converted;
        preferredCovered += 1;
      }
    }
  }

  final buckets = byCurrency.entries
      .map(
        (e) => MerchantCurrencyBucket(
          currency: e.key,
          amount: e.value.amount,
          count: e.value.count,
        ),
      )
      .toList(growable: false)
    ..sort((a, b) => b.amount.compareTo(a.amount));

  if (buckets.isEmpty) {
    return MerchantSalesTotals(
      orderCount: 0,
      buckets: const <MerchantCurrencyBucket>[],
      usdEstimate: null,
      usdCoveredOrders: 0,
      chartAmount: 0,
      chartIsUsd: preferred == 'USD',
      chartCurrency: preferred ?? 'COP',
    );
  }

  // Prefer business main currency totals (converted) over ≈USD aggregates.
  if (preferred != null && preferredCovered > 0) {
    return MerchantSalesTotals(
      orderCount: active.length,
      buckets: buckets,
      usdEstimate: usdCovered > 0 ? usdSum : null,
      usdCoveredOrders: usdCovered,
      chartAmount: preferredSum,
      chartIsUsd: preferred == 'USD',
      chartCurrency: preferred,
    );
  }

  final primary = buckets.first;
  return MerchantSalesTotals(
    orderCount: active.length,
    buckets: buckets,
    usdEstimate: usdCovered > 0 ? usdSum : null,
    usdCoveredOrders: usdCovered,
    chartAmount: primary.amount,
    chartIsUsd: primary.currency == 'USD',
    chartCurrency: primary.currency,
  );
}

final NumberFormat _esInteger = NumberFormat.decimalPattern('es_CO')
  ..maximumFractionDigits = 0
  ..minimumFractionDigits = 0;
final NumberFormat _esMoney = NumberFormat.decimalPattern('es_CO')
  ..maximumFractionDigits = 2
  ..minimumFractionDigits = 2;

String _formatAmountBody(double amount, String currency) {
  final code = normalizeMerchantCurrency(currency);
  if (code == 'USD' || code == 'EUR') {
    return _esMoney.format(amount);
  }
  return _esInteger.format(amount.round());
}

/// Full readable amount (Spanish thousands). Prefer this over "k".
String formatMerchantMoneyExact(double amount, String currency) {
  final code = normalizeMerchantCurrency(currency);
  final body = _formatAmountBody(amount, code);
  if (code == 'USD') return 'US\$ $body';
  return '$code $body';
}

/// Card/chip label: same readable style as exact (FittedBox handles overflow).
String formatMerchantMoneyCompact(double amount, String currency) {
  final code = normalizeMerchantCurrency(currency);
  final abs = amount.abs();
  // Only abbreviate extreme values so narrow layouts stay usable.
  if (abs >= 10000000 && code != 'USD' && code != 'EUR') {
    final millions = amount / 1000000;
    final body = NumberFormat.decimalPattern('es_CO')
        .format(double.parse(millions.toStringAsFixed(abs >= 100000000 ? 0 : 1)));
    return '$code $body mill.';
  }
  return formatMerchantMoneyExact(amount, code);
}

String formatMerchantUsdCompact(double amount) =>
    formatMerchantMoneyCompact(amount, 'USD');

/// KPI cards: always Spanish-readable amounts (no "k" / "+N").
String formatMerchantMoneyKpi(double amount, String currency) =>
    formatMerchantMoneyCompact(amount, currency);
