class MerchantDeepLink {
  const MerchantDeepLink._();

  static const Set<String> reservedOrderSegments = {'view', 'public', 'order', 'orders'};

  static String? _orderId;
  static Uri? _fallbackUri;

  static void rememberOrder(String? orderId, {Uri? fallbackUri}) {
    final id = (orderId ?? '').trim();
    if (id.isEmpty || reservedOrderSegments.contains(id.toLowerCase())) {
      return;
    }
    _orderId = id;
    _fallbackUri = fallbackUri;
  }

  static String? peekOrder() => _orderId;

  static Uri? peekFallbackUri() => _fallbackUri;

  static String? consumeOrder() {
    final id = _orderId;
    _orderId = null;
    _fallbackUri = null;
    return id;
  }

  static void clear() {
    _orderId = null;
    _fallbackUri = null;
  }
}
