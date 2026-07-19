import 'package:kosmenu_app/services/public_order_api_service.dart';

/// One checkout attempt: single in-flight submit + stable idempotency key.
///
/// A new instance (new sheet / new attempt) gets a new key.
class CheckoutAttemptState {
  CheckoutAttemptState({String? idempotencyKey})
    : idempotencyKey = (idempotencyKey == null || idempotencyKey.trim().isEmpty)
          ? generateCheckoutIdempotencyKey()
          : idempotencyKey.trim();

  final String idempotencyKey;
  bool _isSubmitting = false;

  bool get isSubmitting => _isSubmitting;

  /// Returns false if a submit is already in flight (double-tap guard).
  bool tryBeginSubmit() {
    if (_isSubmitting) return false;
    _isSubmitting = true;
    return true;
  }

  void endSubmit() {
    _isSubmitting = false;
  }
}
