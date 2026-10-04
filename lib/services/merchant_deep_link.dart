class MerchantDeepLink {
  const MerchantDeepLink._();

  static const Set<String> reservedOrderSegments = {
    'view',
    'public',
    'order',
    'orders',
  };

  static String? _orderId;
  static Uri? _fallbackUri;
  static bool _openPaymentProof = false;

  static void rememberOrder(
    String? orderId, {
    Uri? fallbackUri,
    bool openPaymentProof = false,
  }) {
    final id = (orderId ?? '').trim();
    if (id.isEmpty || reservedOrderSegments.contains(id.toLowerCase())) {
      return;
    }
    _orderId = id;
    _fallbackUri = fallbackUri;
    _openPaymentProof = openPaymentProof;
  }

  static String? peekOrder() => _orderId;

  static Uri? peekFallbackUri() => _fallbackUri;

  static bool get openPaymentProof => _openPaymentProof;

  static String? consumeOrder() {
    final id = _orderId;
    _orderId = null;
    _fallbackUri = null;
    _openPaymentProof = false;
    return id;
  }

  static void clear() {
    _orderId = null;
    _fallbackUri = null;
    _openPaymentProof = false;
  }
}
