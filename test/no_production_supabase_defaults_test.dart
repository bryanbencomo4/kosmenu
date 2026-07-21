import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Flutter config has no silent production Supabase defaults', () {
    final source = File('lib/core/constants.dart').readAsStringSync();
    expect(source.contains('qqhberaayhohxlbbhdyi'), isFalse);
    expect(
      source.contains("defaultValue: 'https://qqhberaayhohxlbbhdyi"),
      isFalse,
    );
    expect(source.contains('defaultValue:'), isFalse);
    expect(source.contains("String.fromEnvironment('SUPABASE_URL')"), isTrue);
    expect(
      source.contains("String.fromEnvironment('SUPABASE_ANON_KEY')"),
      isTrue,
    );
    expect(
      source.contains('Production fallback is disabled'),
      isTrue,
    );
  });

  test('API base URL helper no longer falls back to production host', () {
    final apiConfig = File('lib/services/elmenuxfa_api_config.dart').readAsStringSync();
    expect(apiConfig.contains('return _stripTrailingSlash(AppLinks.productionUrl)'), isFalse);
    expect(apiConfig.contains('baseUrl => AppLinks.apiBaseUrl'), isTrue);
  });
}
