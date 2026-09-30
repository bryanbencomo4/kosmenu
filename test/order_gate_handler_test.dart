import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/constants.dart';
import 'package:kosmenu_app/services/order_gate_handler.dart';

void main() {
  test('merchantOrderById opens the panel order screen', () {
    expect(
      AppLinks.merchantOrderById('A1B2'),
      'https://app.elmenuxfa.com/orders/view/A1B2',
    );
  });

  test('merchantOrderShareUrl uses panel link with shortCode from /o/{code}', () {
    expect(
      AppLinks.merchantOrderShareUrl(
        orderId: 'EMXFA-000130',
        trackingUrl: 'https://elmenuxfa.com/o/jjyYZ_1KbL',
      ),
      'https://app.elmenuxfa.com/orders/view/EMXFA-000130?shortCode=jjyYZ_1KbL',
    );
  });

  test('customerOrderTrackingUrl keeps the public tracker for the diner', () {
    expect(
      AppLinks.customerOrderTrackingUrl(
        orderId: 'EMXFA-000130',
        trackingUrl: 'https://elmenuxfa.com/o/jjyYZ_1KbL',
      ),
      'https://elmenuxfa.com/o/jjyYZ_1KbL',
    );
    expect(
      AppLinks.customerOrderTrackingUrl(orderId: 'EMXFA-000130'),
      isNot(contains('app.elmenuxfa.com')),
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
