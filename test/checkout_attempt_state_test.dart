import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/checkout_attempt_state.dart';

void main() {
  group('CheckoutAttemptState', () {
    test('keeps one idempotency key for retries of the same attempt', () {
      final attempt = CheckoutAttemptState();
      final first = attempt.idempotencyKey;
      expect(RegExp(r'^[0-9a-f-]{36}$').hasMatch(first), isTrue);
      expect(attempt.tryBeginSubmit(), isTrue);
      attempt.endSubmit();
      expect(attempt.tryBeginSubmit(), isTrue);
      expect(attempt.idempotencyKey, first);
      attempt.endSubmit();
    });

    test('new attempt gets a different idempotency key', () {
      final a = CheckoutAttemptState();
      final b = CheckoutAttemptState();
      expect(a.idempotencyKey, isNot(equals(b.idempotencyKey)));
    });

    test('double tap is blocked while submitting', () {
      final attempt = CheckoutAttemptState();
      expect(attempt.tryBeginSubmit(), isTrue);
      expect(attempt.isSubmitting, isTrue);
      expect(attempt.tryBeginSubmit(), isFalse);
      attempt.endSubmit();
      expect(attempt.isSubmitting, isFalse);
      expect(attempt.tryBeginSubmit(), isTrue);
    });
  });
}
