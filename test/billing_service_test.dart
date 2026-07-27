import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/billing_service.dart';

void main() {
  group('BillingPlan', () {
    test('parses plan row and formats price', () {
      final plan = BillingPlan.fromRow({
        'id': 'p1',
        'code': 'menu_monthly',
        'name': 'Menú Digital',
        'description': 'desc',
        'price_amount': 10,
        'price_currency': 'USD',
        'billing_interval': 'month',
      });

      expect(plan.code, 'menu_monthly');
      expect(plan.priceLabel, '\$10 USD');
    });
  });

  group('BillingSubscription', () {
    test('active and needsPayment flags', () {
      final active = BillingSubscription.fromRow({
        'id': 's1',
        'status': 'active',
        'plan_id': 'p1',
        'cancel_at_period_end': false,
      });
      expect(active.isActive, isTrue);
      expect(active.needsPayment, isFalse);

      final pending = BillingSubscription.fromRow({
        'id': 's2',
        'status': 'pending',
        'plan_id': 'p1',
        'cancel_at_period_end': false,
      });
      expect(pending.needsPayment, isTrue);
    });
  });

  group('BillingPayment', () {
    test('open reusable when not expired', () {
      final payment = BillingPayment.fromRow({
        'id': 'pay1',
        'order_id': 'o1',
        'status': 'open',
        'amount': 10,
        'currency': 'USD',
        'checkout_url': 'https://pay.zenobank.io/ch_x',
        'expires_at': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
      });
      expect(payment.isOpenReusable, isTrue);
    });

    test('expired open checkout is not reusable', () {
      final payment = BillingPayment.fromRow({
        'id': 'pay2',
        'order_id': 'o2',
        'status': 'open',
        'amount': 10,
        'currency': 'USD',
        'checkout_url': 'https://pay.zenobank.io/ch_y',
        'expires_at': DateTime.now().subtract(const Duration(hours: 1)).toIso8601String(),
      });
      expect(payment.isOpenReusable, isFalse);
    });
  });

  group('BillingSnapshot grandfathering', () {
    test('legacy online commerce without subscription is grandfathered', () {
      const snap = BillingSnapshot(
        plan: null,
        subscription: null,
        latestPayment: null,
        billingExempt: true,
        businessOnline: true,
      );
      expect(snap.isGrandfathered, isTrue);
      expect(snap.hasActiveSubscription, isFalse);
    });

    test('non-exempt without subscription is not grandfathered', () {
      const snap = BillingSnapshot(
        plan: null,
        subscription: null,
        latestPayment: null,
        billingExempt: false,
        businessOnline: false,
      );
      expect(snap.isGrandfathered, isFalse);
    });
  });

  group('CreateCheckoutResult', () {
    test('parses edge function response', () {
      final result = CreateCheckoutResult.fromMap({
        'checkoutUrl': 'https://pay.zenobank.io/ch_1',
        'checkoutId': 'ch_1',
        'expiresAt': '2030-01-01T00:00:00Z',
        'reused': true,
        'orderId': 'km_order',
      });
      expect(result.checkoutId, 'ch_1');
      expect(result.reused, isTrue);
      expect(result.expiresAt, isNotNull);
    });
  });
}
