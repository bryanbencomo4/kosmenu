import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/models/pedido.dart';
import 'package:kosmenu_app/utils/merchant_sales_money.dart';

PedidoModel _order({
  required String id,
  required Map<String, dynamic> detalles,
  double? total,
  String estado = 'entregado',
}) {
  return PedidoModel(
    id: id,
    comercioId: 'c1',
    total: total,
    estado: estado,
    createdAt: DateTime(2026, 10, 30),
    detalles: detalles,
  );
}

void main() {
  test('keeps native COP and estimates USD from USD-base rate', () {
    final money = extractMerchantOrderMoney(
      _order(
        id: '1',
        total: 10,
        detalles: {
          'moneda_base': 'USD',
          'total': 10,
          'moneda_checkout': 'COP',
          'total_moneda_checkout': 42000,
          'tasa_cambio_snapshot': 4200,
        },
      ),
    );
    expect(money.currency, 'COP');
    expect(money.amount, 42000);
    expect(money.usdEstimate, closeTo(10, 0.01));
  });

  test('does not treat identity rate as FX without market units', () {
    final money = extractMerchantOrderMoney(
      _order(
        id: '2',
        total: 50000,
        detalles: {
          'moneda_base': 'COP',
          'total': 50000,
          'moneda_checkout': 'COP',
          'total_moneda_checkout': 50000,
          'tasa_cambio_snapshot': 1,
        },
      ),
    );
    expect(money.usdEstimate, isNull);
    expect(formatMerchantMoneyCompact(50000, 'COP'), 'COP 50.000');
  });

  test('falls back to business/market units-per-USD like admin', () {
    final units = resolveMerchantUnitsPerUsd(
      comercioRow: {
        'moneda': 'VES',
        'tasa_cambio_pesos': 4200,
        'exchange_rate_value': 40,
        'exchange_rate_quote_currency': 'USD',
      },
      marketRow: {
        'bcv_rate': 36.5,
        'payload': {
          'google_rates': {'USD/COP': 4100},
          'bcv_rates': {'USD': 36.5},
        },
      },
    );
    expect(units['COP'], closeTo(4200, 0.01));
    expect(units['VES'], closeTo(40, 0.01));

    final copNative = extractMerchantOrderMoney(
      _order(
        id: 'cop',
        total: 42000,
        detalles: {
          'moneda_base': 'COP',
          'total': 42000,
          'moneda_checkout': 'COP',
          'total_moneda_checkout': 42000,
          'tasa_cambio_snapshot': 1,
        },
      ),
      unitsPerUsd: units,
    );
    expect(copNative.usdEstimate, closeTo(10, 0.01));

    final vesNative = extractMerchantOrderMoney(
      _order(
        id: 'ves',
        total: 200,
        detalles: {
          'moneda_base': 'VES',
          'total': 200,
          'moneda_checkout': 'VES',
          'total_moneda_checkout': 200,
          'tasa_cambio_snapshot': 1,
        },
      ),
      unitsPerUsd: units,
    );
    expect(vesNative.usdEstimate, closeTo(5, 0.01));
  });

  test('multi-currency summary prefers business currency over USD', () {
    final units = <String, double>{'COP': 4000, 'VES': 40};
    final totals = summarizeMerchantSales(
      [
        _order(
          id: 'a',
          total: 10,
          detalles: {
            'moneda_base': 'USD',
            'total': 10,
            'moneda_checkout': 'COP',
            'total_moneda_checkout': 40000,
            'tasa_cambio_snapshot': 4000,
          },
        ),
        _order(
          id: 'b',
          total: 5,
          detalles: {
            'moneda_base': 'USD',
            'total': 5,
            'moneda_checkout': 'VES',
            'total_moneda_checkout': 200,
            'tasa_cambio_snapshot': 40,
          },
        ),
      ],
      unitsPerUsd: units,
      preferredCurrency: 'COP',
    );
    expect(totals.buckets, hasLength(2));
    expect(totals.chartCurrency, 'COP');
    expect(totals.chartIsUsd, isFalse);
    expect(totals.chartAmount, closeTo(60000, 0.01));
    expect(totals.usdEstimate, closeTo(15, 0.01));
  });

  test('formats money without k abbreviation', () {
    expect(formatMerchantMoneyKpi(169000, 'COP'), 'COP 169.000');
    expect(formatMerchantMoneyCompact(16300, 'VES'), 'VES 16.300');
    expect(formatMerchantMoneyExact(12.5, 'USD'), 'US\$ 12,50');
  });
}
