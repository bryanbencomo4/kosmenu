class MerchantDeepLink {
  const MerchantDeepLink._();

  static const Set<String> reservedOrderSegments = {
    'view',
    'public',
    'order',
    'orders',
  };

  /// Flutter merchant host (native chat inbox). Next public site remains a fallback.
  static const String publicSiteOrigin = 'https://app.elmenuxfa.com';

  static String? _orderId;
  static Uri? _fallbackUri;
  static bool _openPaymentProof = false;
  static String? _conversationId;
  static String? _conversationComercioId;
  /// Post-login in-app route (e.g. `/asistente`). Login itself stays at app root.
  static String? _nextRoute;

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

  /// Remembers a chat-supervision deep link so the dashboard opens the native inbox.
  static void rememberConversation(
    String? conversationId, {
    String? comercioId,
  }) {
    final id = (conversationId ?? '').trim();
    if (id.isEmpty) return;
    _conversationId = id;
    final cid = (comercioId ?? '').trim();
    if (cid.isNotEmpty) _conversationComercioId = cid;
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
    if (id != null) {
      rememberConversation(
        id,
        comercioId: uri.queryParameters['comercioId'],
      );
    }
  }

  static String? peekOrder() => _orderId;

  static Uri? peekFallbackUri() => _fallbackUri;

  static bool get openPaymentProof => _openPaymentProof;

  static String? peekConversation() => _conversationId;

  static String? peekConversationComercioId() => _conversationComercioId;

  /// Remember where to go after login at `app.elmenuxfa.com/` (never use /asistente as login).
  static void rememberNext(String? route) {
    final raw = (route ?? '').trim();
    if (raw.isEmpty) return;
    final normalized = raw.startsWith('/') ? raw : '/$raw';
    // Allowlist only safe internal destinations.
    if (normalized == '/asistente' || normalized.startsWith('/asistente?')) {
      _nextRoute = '/asistente';
    }
  }

  static void rememberNextFromUri(Uri uri) {
    rememberNext(uri.queryParameters['next']);
  }

  static String? peekNext() => _nextRoute;

  static String? consumeNext() {
    final next = _nextRoute;
    _nextRoute = null;
    return next;
  }

  static String? consumeConversation() {
    final id = _conversationId;
    _conversationId = null;
    _conversationComercioId = null;
    return id;
  }

  /// Absolute URL on the Flutter merchant host (native inbox).
  static Uri? publicConversationUri([
    String? conversationId,
    String? comercioId,
  ]) {
    final id = (conversationId ?? _conversationId ?? '').trim();
    if (id.isEmpty) return null;
    final cid =
        (comercioId ?? _conversationComercioId ?? '').trim();
    final base =
        '$publicSiteOrigin/panel/conversaciones/${Uri.encodeComponent(id)}';
    if (cid.isEmpty) return Uri.parse(base);
    return Uri.parse(
      '$base?comercioId=${Uri.encodeComponent(cid)}',
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
    _conversationComercioId = null;
    _nextRoute = null;
  }
}
