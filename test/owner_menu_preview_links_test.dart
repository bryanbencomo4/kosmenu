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

  test('password recovery web redirect stays on the current app origin', () {
    final uri = AppLinks.passwordRecoveryRedirectUri(
      isWeb: true,
      currentUri: Uri.parse('https://preview-kosmenu.vercel.app/?tab=login'),
    );

    expect(uri.origin, 'https://preview-kosmenu.vercel.app');
    expect(uri.path, '/auth/recovery');
    expect(uri.queryParameters, {'flow': 'password-recovery'});
  });

  test('password recovery native redirect opens the app callback', () {
    final uri = AppLinks.passwordRecoveryRedirectUri(
      isWeb: false,
      currentUri: Uri.parse('https://app.elmenuxfa.com'),
    );

    expect(uri.toString(), 'com.kosmenu.app://reset-password');
  });
}
