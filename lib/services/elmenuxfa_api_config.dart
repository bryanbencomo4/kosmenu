import 'package:kosmenu_app/core/constants.dart';

/// Central API base URL for Next.js routes used by Flutter.
///
/// Preview/dev defines (all required for full isolation from production):
/// ```
/// --dart-define=API_BASE_URL=https://<preview-host>
/// --dart-define=SUPABASE_URL=https://<preview-ref>.supabase.co
/// --dart-define=SUPABASE_ANON_KEY=<preview-anon-key>
/// ```
class ElmenuxfaApiConfig {
  const ElmenuxfaApiConfig._();

  static const String _envBase = String.fromEnvironment('API_BASE_URL');

  static String get baseUrl {
    final fromEnv = _envBase.trim();
    if (fromEnv.isNotEmpty) {
      return _stripTrailingSlash(fromEnv);
    }
    return _stripTrailingSlash(AppLinks.productionUrl);
  }

  static Uri uri(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$baseUrl$normalized');
  }

  static String _stripTrailingSlash(String value) {
    return value.endsWith('/') ? value.substring(0, value.length - 1) : value;
  }
}
