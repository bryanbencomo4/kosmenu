import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/merchant_deep_link.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/order_gate_handler.dart';

void main() {
  test('proof intent survives login handoff but is consumed once', () {
    MerchantDeepLink.clear();
    MerchantDeepLink.rememberOrder('EMXFA-000156', openPaymentProof: true);
    expect(MerchantDeepLink.peekOrder(), 'EMXFA-000156');
    expect(MerchantDeepLink.openPaymentProof, isTrue);
    expect(MerchantDeepLink.consumeOrder(), 'EMXFA-000156');
    expect(MerchantDeepLink.openPaymentProof, isFalse);
    MerchantDeepLink.rememberOrder('EMXFA-000157');
    expect(MerchantDeepLink.openPaymentProof, isFalse);
    MerchantDeepLink.clear();
  });
  test('merchantOrderById opens the panel order screen', () {
    expect(
      AppLinks.merchantOrderById('A1B2'),
      'https://app.elmenuxfa.com/orders/view/A1B2',
    );
  });

  test('merchantOrderShareUrl uses panel link with shortCode from /o/{code}', () {
    expect(
      AppLinks.merchantOrderShareUrl(
        orderId: 'EMXFA-000136',
        trackingUrl: 'https://elmenuxfa.com/o/qQ2vtV8HSY',
      ),
      'https://app.elmenuxfa.com/orders/view/EMXFA-000136?shortCode=qQ2vtV8HSY',
    );
  });

  test('extractOrderId reads /orders/view/{id}', () {
    expect(
      OrderGateHandler.extractOrderId(
        Uri.parse('https://app.elmenuxfa.com/orders/view/A1B2'),
      ),
      'A1B2',
    );
  });

  test('extractOrderId reads ?order= for older WhatsApp links', () {
    expect(
      OrderGateHandler.extractOrderId(
        Uri.parse('https://app.elmenuxfa.com/?order=A1B2'),
      ),
      'A1B2',
    );
  });

  test('extractOrderId does not treat "view" as the order id', () {
    expect(
      OrderGateHandler.extractOrderId(
        Uri.parse('https://app.elmenuxfa.com/orders/view/EMXFA-000022'),
      ),
      'EMXFA-000022',
    );
  });

  test('extractOrderId ignores reserved /orders/view without an id', () {
    expect(
      OrderGateHandler.extractOrderId(
        Uri.parse('https://app.elmenuxfa.com/orders/view'),
      ),
      isNull,
    );
  });

  test('extractOrderId reads a hash route', () {
    expect(
      OrderGateHandler.extractOrderId(
        Uri.parse('https://app.elmenuxfa.com/#/orders/view/EMXFA-000027'),
      ),
      'EMXFA-000027',
    );
  });
}
