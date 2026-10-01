import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/exchange_rate_adjustment.dart';

void main() {
  const manualAdjustment = ExchangeRateAdjustment(
    enabled: true,
    factor: 1.149425287,
    referenceValue: 3,
    referenceInverted: true,
  );

  test('1. legacy automatic config keeps 0.29 untouched', () {
    expect(
      resolveEffectiveExchangeRate(
        const ExchangeRateConfig(mode: 'auto'),
        0.29,
      ),
      0.29,
    );
    expect(resolveEffectiveExchangeRate(null, 0.29), 0.29);
  });

  test('2. manual mode keeps 0.31 even with a stored adjustment', () {
    expect(
      resolveEffectiveExchangeRate(
        const ExchangeRateConfig(mode: 'manual', adjustment: manualAdjustment),
        0.31,
      ),
      0.31,
    );
  });

  test('3. 1 VES = 3 COP gives ~0.333333333 and 50.000 COP -> 16.666,67', () {
    final commercial = commercialRateFromReference(
      referenceValue: 3,
      inverted: true,
    )!;
    final factor = computeAdjustmentFactor(
      commercialRate: commercial,
      sourceRate: 0.29,
    )!;
    expect(factor, closeTo(1.149425287, 1e-8));
    final effective = resolveEffectiveExchangeRate(
      ExchangeRateConfig(
        mode: 'auto',
        adjustment: ExchangeRateAdjustment(enabled: true, factor: factor),
      ),
      0.29,
    );
    expect(effective, closeTo(0.333333333, 1e-8));
    expect(formatAdjustmentAmount(50000 * effective), '16.666,67');
    expect(formatAdjustmentPercent(factor), '+14,94 %');
  });

  test('4. changing the source 0.29 -> 0.30 keeps following it', () {
    final factor = computeAdjustmentFactor(
      commercialRate: 1 / 3,
      sourceRate: 0.29,
    )!;
    final effective = resolveEffectiveExchangeRate(
      ExchangeRateConfig(
        mode: 'auto',
        adjustment: ExchangeRateAdjustment(enabled: true, factor: factor),
      ),
      0.30,
    );
    expect(effective, closeTo(0.344827586, 1e-8));
  });

  test('5. disabling the adjustment returns to the plain source rate', () {
    final effective = resolveEffectiveExchangeRate(
      const ExchangeRateConfig(
        mode: 'auto',
        adjustment: ExchangeRateAdjustment(enabled: false, factor: 1.149425287),
      ),
      0.30,
    );
    expect(effective, 0.30);
  });

  test('6. a zero reference is invalid and cannot produce a factor', () {
    final parsed = parseAdjustmentReference('0');
    expect(parsed.status, AdjustmentReferenceStatus.invalid);
    expect(parsed.errorMessage, 'Ingresa un valor mayor que 0.');
    expect(
      parseAdjustmentReference('-2').status,
      AdjustmentReferenceStatus.invalid,
    );
    expect(
      commercialRateFromReference(referenceValue: 0, inverted: true),
      isNull,
    );
    expect(
      computeAdjustmentFactor(commercialRate: 0, sourceRate: 0.29),
      isNull,
    );
  });

  test('7. an empty reference never throws and shows no error', () {
    for (final raw in <String?>[null, '', '  ', ',', '.']) {
      final parsed = parseAdjustmentReference(raw);
      expect(parsed.status, AdjustmentReferenceStatus.empty);
      expect(parsed.errorMessage, isNull);
    }
    expect(
      resolveEffectiveExchangeRate(
        const ExchangeRateConfig(
          mode: 'auto',
          adjustment: ExchangeRateAdjustment(enabled: true),
        ),
        0.29,
      ),
      0.29,
    );
  });

  test('8. legacy configs (no adjustment key) are read as no adjustment', () {
    expect(ExchangeRateAdjustment.fromMap(null), isNull);
    expect(ExchangeRateAdjustment.fromMap(<String, dynamic>{}), isNotNull);
    expect(
      ExchangeRateAdjustment.fromMap(<String, dynamic>{})!.isActive,
      isFalse,
    );
    expect(ExchangeRateAdjustment.fromMap('garbage'), isNull);
  });

  test('reference parsing accepts comma and dot decimals', () {
    expect(parseAdjustmentReference('3').value, 3);
    expect(parseAdjustmentReference('3,47').value, 3.47);
    expect(parseAdjustmentReference('3.47').value, 3.47);
    expect(parseAdjustmentReference('1.250,5').value, 1250.5);
    expect(
      parseAdjustmentReference('abc').status,
      AdjustmentReferenceStatus.empty,
    );
    expect(
      parseAdjustmentReference('3x').status,
      AdjustmentReferenceStatus.invalid,
    );
  });

  test('adjustment map round-trips', () {
    final restored = ExchangeRateAdjustment.fromMap(manualAdjustment.toMap())!;
    expect(restored.enabled, isTrue);
    expect(restored.factor, 1.149425287);
    expect(restored.referenceValue, 3);
    expect(restored.referenceInverted, isTrue);
    expect(formatAdjustmentReferenceInput(3), '3');
    expect(formatAdjustmentReferenceInput(3.47), '3,47');
  });

  test('auto update: factor set at 0.29 keeps following P2P to 0.30', () {
    const initialSource = 0.29;
    const copPerVes = 3;
    final commercialRate = 1 / copPerVes;
    final factor = computeAdjustmentFactor(
      commercialRate: commercialRate,
      sourceRate: initialSource,
    )!;
    expect(factor, closeTo(1.149425287, 1e-8));

    final adjustment = ExchangeRateAdjustment(enabled: true, factor: factor);
    final config = ExchangeRateConfig(mode: 'auto', adjustment: adjustment);

    final atInitial = resolveEffectiveExchangeRate(config, initialSource);
    expect(50000 * atInitial, closeTo(16666.67, 0.01));
    expect(formatAdjustmentAmount(50000 * atInitial), '16.666,67');

    final newEffective = resolveEffectiveExchangeRate(config, 0.30);
    expect(newEffective, closeTo(0.344827586, 1e-8));
    expect(50000 * newEffective, closeTo(17241.38, 0.01));
    expect(formatAdjustmentAmount(50000 * newEffective), '17.241,38');
    expect(formatAdjustmentRate(newEffective), '0,3448');
  });

  test('keeping the commercial change on a new source preserves the rate', () {
    final factor = computeAdjustmentFactor(
      commercialRate: 1 / 3,
      sourceRate: 0.29,
    )!;
    final effectiveNow = 0.29 * factor;
    final newFactor = computeAdjustmentFactor(
      commercialRate: effectiveNow,
      sourceRate: 0.31,
    )!;
    expect(0.31 * newFactor, closeTo(effectiveNow, 1e-12));
  });

  test('factor keeps full precision (not rounded to 4 decimals)', () {
    final factor = computeAdjustmentFactor(
      commercialRate: 1 / 3,
      sourceRate: 0.29,
    )!;
    final roundedTo4 = double.parse(factor.toStringAsFixed(4));
    expect(factor, isNot(roundedTo4));
    expect(
      ExchangeRateAdjustment.fromMap(
        ExchangeRateAdjustment(enabled: true, factor: factor).toMap(),
      )!.factor,
      factor,
    );
  });
}
