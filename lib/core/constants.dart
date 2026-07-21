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

class AppLinks {
  const AppLinks._();

  // Keep base URL without trailing slash to avoid //v/... routes.
  static const String productionUrl = 'https://elmenuxfa.com';
  static const String brandIsotipoUrl = '$productionUrl/branding/isotipo.png';

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

  static String publicMenuByIdentifier({
    required String comercioId,
    String? slug,
  }) {
    final identifier = (slug ?? '').trim().isNotEmpty
        ? slug!.trim()
        : comercioId.trim();
    return publicMenuByComercio(identifier);
  }

  static String orderDetailsById(String orderId, {bool forceWebView = false}) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedId = Uri.encodeComponent(orderId.trim());
    final suffix = forceWebView ? '?view=web' : '';
    return '$base/orders/$encodedId$suffix';
  }

  static String deliveryInviteByToken(String token) {
    final base = productionUrl.endsWith('/')
        ? productionUrl.substring(0, productionUrl.length - 1)
        : productionUrl;
    final encodedToken = Uri.encodeComponent(token.trim());
    return '$base/delivery/invite/$encodedToken';
  }
}
