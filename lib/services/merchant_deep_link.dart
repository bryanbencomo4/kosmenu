class MerchantDeepLink {
  const MerchantDeepLink._();

  static const Set<String> reservedOrderSegments = {'view', 'public', 'order', 'orders'};

  static String? _orderId;

  static void rememberOrder(String? orderId) {
    final id = (orderId ?? '').trim();
    if (id.isEmpty || reservedOrderSegments.contains(id.toLowerCase())) {
      return;
    }
    _orderId = id;
  }

  static String? peekOrder() => _orderId;

  static String? consumeOrder() {
    final id = _orderId;
    _orderId = null;
    return id;
  }

  static void clear() {
    _orderId = null;
  }
}
