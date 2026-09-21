import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';

void main() {
  group('catalog grouping', () {
    test('separa automaticos y manuales y oculta cuentas vacias', () {
      final methods = mergePaymentCatalog(fallbackPaymentMethods());
      final automatic = automaticPaymentMethods(methods);
      final manual = manualPaymentMethods(methods);
      final checkout = checkoutPaymentMethods(methods);

      expect(automatic.map((item) => item.code), ['crypto_usdt', 'gift_card']);
      expect(manual.map((item) => item.code), ['pago_movil', 'efectivo']);
      expect(checkout.map((item) => item.code), [
        'crypto_usdt',
        'gift_card',
        'pago_movil',
      ]);
      expect(checkout.any((item) => item.code == 'efectivo'), isFalse);
      expect(methods.any((item) => item.code == 'bancolombia'), isFalse);
    });

    test('un metodo manual con cuenta lista si aparece', () {
      final bancolombia = fallbackPaymentMethods().firstWhere(
        (item) => item.code == 'bancolombia',
      );
      final ready = PaymentMethodCatalog(
        id: bancolombia.id,
        code: bancolombia.code,
        name: bancolombia.name,
        tagline: bancolombia.tagline,
        verification: bancolombia.verification,
        kind: bancolombia.kind,
        isActive: true,
        sortOrder: bancolombia.sortOrder,
        accountFields: const [
          PaymentAccountField(label: 'Cuenta', value: '123'),
        ],
        requiresReference: true,
        requiresReceipt: true,
      );

      final methods = mergePaymentCatalog([ready]);
      expect(methods.map((item) => item.code), ['bancolombia']);
      expect(checkoutPaymentMethods(methods), isEmpty);
    });
  });

  group('gift card code', () {
    test('normaliza guiones y minusculas', () {
      expect(normalizeGiftCardCode('emx-ab12-cd34-ef56'), 'EMXAB12CD34EF56');
      expect(isPlausibleGiftCardCode('EMX-AB12-CD34-EF56'), isTrue);
      expect(isPlausibleGiftCardCode('corto'), isFalse);
    });
  });

  group('pago movil', () {
    final pagoMovil = fallbackPaymentMethods().firstWhere(
      (item) => item.code == 'pago_movil',
    );

    test('parsea account_fields desde lista o json', () {
      expect(
        parseAccountFields([
          {'label': 'Teléfono', 'value': '0412'},
        ]).first.value,
        '0412',
      );
      expect(
        parseAccountFields('[{"label":"Banco","value":"BDV"}]').first.label,
        'Banco',
      );
    });

    test('es checkout automatico y no pide comprobante', () {
      expect(pagoMovil.isPagoMovil, isTrue);
      expect(pagoMovil.isAutomatedCheckout, isTrue);
      expect(pagoMovil.requiresReceipt, isFalse);
      expect(pagoMovil.isReadyForCheckout, isTrue);
    });

    test('exige exactamente 4 digitos de referencia', () {
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(),
        ),
        contains('4 dígitos'),
      );
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(reference: '875'),
        ),
        contains('4 dígitos'),
      );
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(reference: '001122'),
        ),
        contains('4 dígitos'),
      );
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(reference: '8754'),
        ),
        isNull,
      );
    });

    test('convierte USD a bolivares con tasa BCV', () {
      expect(vesAmountFromUsd(usd: 10, bcvRate: 36.5), 365);
      expect(formatBolivares(365), 'Bs. 365,00');
      expect(formatBolivares(1234.5), 'Bs. 1.234,50');
      expect(vesAmountFromUsd(usd: 10, bcvRate: null), isNull);
    });
  });

  group('manual draft', () {
    test('efectivo exige codigo de asesor y no pide comprobante', () {
      final cash = fallbackPaymentMethods().firstWhere(
        (item) => item.code == 'efectivo',
      );
      expect(
        validateManualPaymentDraft(
          method: cash,
          draft: const ManualPaymentDraft(),
        ),
        contains('asesor'),
      );
      expect(
        validateManualPaymentDraft(
          method: cash,
          draft: const ManualPaymentDraft(advisorCode: 'ANA-24'),
        ),
        isNull,
      );
    });
  });

  group('rpc errors', () {
    test('traduce los codigos que el comerciante puede provocar', () {
      expect(
        mapBillingRpcError('GIFT_CARD_ALREADY_REDEEMED'),
        contains('ya fue canjeada'),
      );
      expect(mapBillingRpcError('ADVISOR_CODE_INVALID'), contains('asesor'));
      expect(
        mapBillingRpcError('SUBMISSION_ALREADY_PENDING'),
        contains('en revision'),
      );
      expect(
        mapBillingRpcError('REFERENCE_ALREADY_USED'),
        contains('referencia'),
      );
    });
  });

  test('parsea color de marca', () {
    expect(parseBrandColor('#F3BA2F'), const Color(0xFFF3BA2F));
    expect(parseBrandColor('nope'), isNull);
  });
}
