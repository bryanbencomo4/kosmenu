import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/payment_catalog.dart';

void main() {
  group('catalog grouping', () {
    test('separa automaticos y manuales y oculta cuentas vacias', () {
      final methods = mergePaymentCatalog(fallbackPaymentMethods());
      final automatic = automaticPaymentMethods(methods);
      final manual = manualPaymentMethods(methods);

      expect(automatic.map((item) => item.code), ['crypto_usdt', 'gift_card']);
      expect(manual.map((item) => item.code), ['efectivo']);
      expect(methods.any((item) => item.code == 'bancolombia'), isFalse);
    });

    test('un metodo manual con cuenta lista si aparece', () {
      final bancolombia = fallbackPaymentMethods().firstWhere((item) => item.code == 'bancolombia');
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
    });
  });

  group('gift card code', () {
    test('normaliza guiones y minusculas', () {
      expect(normalizeGiftCardCode('emx-ab12-cd34-ef56'), 'EMXAB12CD34EF56');
      expect(isPlausibleGiftCardCode('EMX-AB12-CD34-EF56'), isTrue);
      expect(isPlausibleGiftCardCode('corto'), isFalse);
    });
  });

  group('manual draft', () {
    final pagoMovil = PaymentMethodCatalog.fromRow({
      'code': 'pago_movil',
      'name': 'Pago movil',
      'verification': 'manual',
      'kind': 'bank_transfer',
      'requires_reference': true,
      'requires_receipt': true,
      'account_fields': [
        {'label': 'Telefono', 'value': '0414'},
      ],
    });

    test('exige referencia y comprobante', () {
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(),
        ),
        contains('referencia'),
      );
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(reference: '001122'),
        ),
        contains('comprobante'),
      );
      expect(
        validateManualPaymentDraft(
          method: pagoMovil,
          draft: const ManualPaymentDraft(
            reference: '001122',
            receiptPath: 'biz/file.jpg',
          ),
        ),
        isNull,
      );
    });

    test('efectivo exige codigo de asesor y no pide comprobante', () {
      final cash = fallbackPaymentMethods().firstWhere((item) => item.code == 'efectivo');
      expect(
        validateManualPaymentDraft(method: cash, draft: const ManualPaymentDraft()),
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
      expect(mapBillingRpcError('GIFT_CARD_ALREADY_REDEEMED'), contains('ya fue canjeada'));
      expect(mapBillingRpcError('ADVISOR_CODE_INVALID'), contains('asesor'));
      expect(mapBillingRpcError('SUBMISSION_ALREADY_PENDING'), contains('en revision'));
      expect(mapBillingRpcError('REFERENCE_ALREADY_USED'), contains('referencia'));
    });
  });

  test('parsea color de marca', () {
    expect(parseBrandColor('#F3BA2F'), const Color(0xFFF3BA2F));
    expect(parseBrandColor('nope'), isNull);
  });
}
