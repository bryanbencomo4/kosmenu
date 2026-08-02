import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/constants.dart';

void main() {
  test('ownerMenuPreviewByComercio points at /preview and not /v', () {
    final url = AppLinks.ownerMenuPreviewByComercio('commerce-1');
    expect(url, 'https://elmenuxfa.com/preview/commerce-1');
    expect(url.contains('/v/'), isFalse);
  });

  test('ownerMenuPreviewUri embeds access token in hash only', () {
    final uri = AppLinks.ownerMenuPreviewUri(
      comercioId: 'mybusiness',
      accessToken: 'tok.en.value',
    );
    expect(uri.path, '/preview/mybusiness');
    expect(uri.fragment, contains('access_token='));
    expect(uri.queryParameters.containsKey('access_token'), isFalse);
  });
}
