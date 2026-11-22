class MerchantDeepLink {
  const MerchantDeepLink._();

  static const Set<String> reservedOrderSegments = {
    'view',
    'public',
    'order',
    'orders',
  };

  /// Public Next.js site that hosts `/panel/conversaciones` (not the Flutter host).
  static const String publicSiteOrigin = 'https://elmenuxfa.com';

  static String? _orderId;
  static Uri? _fallbackUri;
  static bool _openPaymentProof = false;
  static String? _conversationId;

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

  /// Remembers a chat-supervision deep link so AuthGate can open the Next panel.
  static void rememberConversation(String? conversationId) {
    final id = (conversationId ?? '').trim();
    if (id.isEmpty) return;
    _conversationId = id;
  }

  /// Parses `/panel/conversaciones/{id}` (with optional query) from a URI.
  static String? conversationIdFromUri(Uri uri) {
    final segments =
        uri.pathSegments.where((segment) => segment.isNotEmpty).toList();
    if (segments.length >= 3 &&
        segments[0] == 'panel' &&
        segments[1] == 'conversaciones') {
      final id = segments[2].trim();
      return id.isEmpty ? null : id;
    }
    return null;
  }

  static void rememberConversationFromUri(Uri uri) {
    final id = conversationIdFromUri(uri);
    if (id != null) rememberConversation(id);
  }

  static String? peekOrder() => _orderId;

  static Uri? peekFallbackUri() => _fallbackUri;

  static bool get openPaymentProof => _openPaymentProof;

  static String? peekConversation() => _conversationId;

  static String? consumeConversation() {
    final id = _conversationId;
    _conversationId = null;
    return id;
  }

  /// Absolute URL on the public Next site (auth + Realtime bandeja).
  static Uri? publicConversationUri([String? conversationId]) {
    final id = (conversationId ?? _conversationId ?? '').trim();
    if (id.isEmpty) return null;
    return Uri.parse(
      '$publicSiteOrigin/panel/conversaciones/${Uri.encodeComponent(id)}',
    );
  }

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
    _conversationId = null;
  }
}
