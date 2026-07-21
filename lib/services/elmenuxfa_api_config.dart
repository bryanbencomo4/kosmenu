import 'package:kosmenu_app/core/constants.dart';

/// Central API base URL for Next.js routes used by Flutter.
///
/// Required dart-defines for every environment (no silent production fallback):
/// ```
/// --dart-define=API_BASE_URL=https://<host>
/// --dart-define=SUPABASE_URL=https://<ref>.supabase.co
/// --dart-define=SUPABASE_ANON_KEY=<anon-key>
/// ```
class ElmenuxfaApiConfig {
  const ElmenuxfaApiConfig._();

  static String get baseUrl => AppLinks.apiBaseUrl;

  static Uri uri(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$baseUrl$normalized');
  }
}
