import 'package:kosmenu_app/core/constants.dart';

/// Central API base URL for Next.js routes used by Flutter.
///
/// Override in Preview/dev with:
/// `--dart-define=API_BASE_URL=https://preview.example.com`
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
