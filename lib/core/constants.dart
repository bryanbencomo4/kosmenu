import 'package:kosmenu_app/models/comercio.dart';

class SupabaseConfig {
  const SupabaseConfig._();

  /// Required for every build (Preview, QA, Production).
  /// Example:
  /// `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...`
  ///
  /// No silent production defaults — missing defines must fail fast.
  static const String url = String.fromEnvironment('SUPABASE_URL');
  static const String anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const String googleMapsApiKey =
      'AIzaSyB9WNMyQma0-n4sMXN_lWJwYNxxkWDEmyQ';
  static String _currentComercioId = '';
  static String _currentComercioSlug = '';

  static String get currentComercioId => _currentComercioId;
  static String? get currentComercioSlug =>
      _currentComercioSlug.trim().isEmpty ? null : _currentComercioSlug.trim();

  static bool get hasCurrentComercioId => _currentComercioId.trim().isNotEmpty;

  static void setCurrentComercioId(String comercioId, {String? slug}) {
    _currentComercioId = comercioId.trim();
    _currentComercioSlug = (slug ?? '').trim();
  }

  static void setCurrentComercioSlug(String? slug) {
    _currentComercioSlug = (slug ?? '').trim();
  }

  static void clearCurrentComercioId() {
    _currentComercioId = '';
    _currentComercioSlug = '';
  }

  /// Throws when dart-defines are missing or point at an invalid URL/key.
  static void assertRuntimeConfig() {
    final parsedUrl = Uri.tryParse(url);
    if (url.trim().isEmpty || parsedUrl == null || !parsedUrl.hasAuthority) {
      throw StateError(
        'Missing or invalid --dart-define=SUPABASE_URL. '
        'Production fallback is disabled; pass an explicit Supabase URL.',
      );
    }
    if (anonKey.trim().isEmpty || !anonKey.startsWith('eyJ')) {
      throw StateError(
        'Missing or invalid --dart-define=SUPABASE_ANON_KEY. '
        'Production fallback is disabled; pass an explicit anon key.',
      );
    }
  }
}

String getPublicMenuUrl(ComercioModel comercio) {
  final slug = (comercio.slug ?? '').trim();
  final identifier = slug.isNotEmpty ? slug : comercio.id.trim();
  return AppLinks.publicMenuByComercio(identifier);
}

String getPublicMenuQrUrl(ComercioModel comercio) {
  final slug = (comercio.slug ?? '').trim();
  final identifier = slug.isNotEmpty ? slug : comercio.id.trim();
  return AppLinks.publicMenuQrByComercio(identifier);
}

class AppLinks {
  const AppLinks._();

  // Keep base URL without trailing slash to avoid //v/... routes.
  static const String productionUrl = String.fromEnvironment(
    'PUBLIC_SITE_URL',
    defaultValue: 'https://elmenuxfa.com',
  );
  static const String merchantAppUrl = String.fromEnvironment(
    'MERCHANT_APP_URL',
    defaultValue: 'https://app.elmenuxfa.com',
  );
  static const String brandIsotipoUrl = '$productionUrl/branding/isotipo.png';

  static Uri passwordRecoveryRedirectUri({
    required bool isWeb,
    required Uri currentUri,
  }) {
    if (!isWeb) {
      return Uri(scheme: 'com.kosmenu.app', host: 'reset-password');
    }

    return currentUri.replace(
      path: '/auth/recovery',
      queryParameters: const {'flow': 'password-recovery'},
      fragment: '',
    );
  }

  /// Next.js API origin. Required via `--dart-define=API_BASE_URL=...`.
  /// No silent fallback to production — missing define fails at first use.
  static String get apiBaseUrl {
    const fromEnv = String.fromEnvironment('API_BASE_URL');
    final trimmed = fromEnv.trim();
    if (trimmed.isEmpty) {
      throw StateError(
        'Missing --dart-define=API_BASE_URL. '
        'Production fallback is disabled; pass an explicit API origin.',
      );
    }
    return trimmed.endsWith('/')
        ? trimmed.substring(0, trimmed.length - 1)
        : trimmed;
  }

  static String brandAsset(String assetPath) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final normalizedPath = assetPath.startsWith('/')
        ? assetPath
        : '/$assetPath';
    return '$base$normalizedPath';
  }

  static String publicMenuByComercio(String comercioId) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedId = Uri.encodeComponent(comercioId.trim());
    return '$base/v/$encodedId';
  }

  static String publicMenuQrByComercio(String comercioId) {
    return '${publicMenuByComercio(comercioId)}?src=qr';
  }

  static String publicMenuByIdentifier({
    required String comercioId,
    String? slug,
  }) {
    final identifier = (slug ?? '').trim().isNotEmpty
        ? slug!.trim()
        : comercioId.trim();
    return publicMenuByComercio(identifier);
  }

  /// Owner-only Next.js preview (same UI as `/v/[id]`, skips publish gate).
  static String ownerMenuPreviewByComercio(String comercioId) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedId = Uri.encodeComponent(comercioId.trim());
    return '$base/preview/$encodedId';
  }

  static Uri ownerMenuPreviewUri({
    required String comercioId,
    required String accessToken,
  }) {
    final base = ownerMenuPreviewByComercio(comercioId);
    final token = accessToken.trim();
    if (token.isEmpty) {
      return Uri.parse(base);
    }
    return Uri.parse('$base#access_token=${Uri.encodeComponent(token)}');
  }

  static String orderDetailsById(
    String orderId, {
    bool forceWebView = false,
    String? trackingToken,
  }) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedId = Uri.encodeComponent(orderId.trim());
    final query = <String, String>{
      if (forceWebView) 'view': 'web',
      if ((trackingToken ?? '').trim().isNotEmpty) 't': trackingToken!.trim(),
    };
    final suffix = query.isEmpty
        ? ''
        : '?${query.entries.map((entry) => '${entry.key}=${Uri.encodeComponent(entry.value)}').join('&')}';
    return '$base/orders/$encodedId$suffix';
  }

  static String merchantOrderById(
    String orderId, {
    String? fallbackUri,
    String? fallbackShortCode,
  }) {
    final encodedId = Uri.encodeComponent(orderId.trim());
    final fallback = (fallbackUri ?? '').trim();
    final shortCode = (fallbackShortCode ?? '').trim();
    final query = shortCode.isNotEmpty
        ? '?shortCode=${Uri.encodeComponent(shortCode)}'
        : fallback.isEmpty
        ? ''
        : '?fallback=${Uri.encodeComponent(fallback)}';
    return '$merchantAppUrl/orders/view/$encodedId$query';
  }

  /// WhatsApp / share URL that both the diner and the merchant can open.
  /// The panel route serves the shop; `shortCode` lets guests fall through
  /// to the public `/o/{code}` tracker without a popup.
  static String merchantOrderShareUrl({
    required String orderId,
    String? trackingUrl,
  }) {
    final raw = (trackingUrl ?? '').trim();
    final parsed = Uri.tryParse(raw);
    if (parsed != null) {
      final segments =
          parsed.pathSegments.where((segment) => segment.isNotEmpty).toList();
      if (segments.length >= 2) {
        final oIndex = segments.lastIndexOf('o');
        if (oIndex >= 0 && oIndex + 1 < segments.length) {
          final code = segments[oIndex + 1];
          if (RegExp(r'^[A-Za-z0-9_-]{10}$').hasMatch(code)) {
            return merchantOrderById(orderId, fallbackShortCode: code);
          }
        }
      }
      final existingShort = (parsed.queryParameters['shortCode'] ?? '').trim();
      if (existingShort.isNotEmpty) {
        return merchantOrderById(orderId, fallbackShortCode: existingShort);
      }
      if (parsed.queryParameters.containsKey('t') ||
          parsed.queryParameters.containsKey('token')) {
        return merchantOrderById(orderId);
      }
    }
    if (raw.isNotEmpty) {
      return merchantOrderById(orderId, fallbackUri: raw);
    }
    return merchantOrderById(orderId);
  }

  static String deliveryInviteByToken(String token) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedToken = Uri.encodeComponent(token.trim());
    return '$base/delivery/invite/$encodedToken';
  }

  static String shortOrderByCode(String code) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    return '$base/o/${Uri.encodeComponent(code.trim())}';
  }
}
