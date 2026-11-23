import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/merchant_deep_link.dart';

void main() {
  tearDown(MerchantDeepLink.clear);

  test('parses panel conversaciones deep link', () {
    final uri = Uri.parse(
      'https://app.elmenuxfa.com/panel/conversaciones/11111111-1111-4111-8111-111111111111?x=1',
    );
    expect(
      MerchantDeepLink.conversationIdFromUri(uri),
      '11111111-1111-4111-8111-111111111111',
    );
  });

  test('builds public Next panel URL without secrets', () {
    MerchantDeepLink.rememberConversation(
      '11111111-1111-4111-8111-111111111111',
    );
    final href = MerchantDeepLink.publicConversationUri();
    expect(href?.toString(), contains('https://app.elmenuxfa.com/panel/conversaciones/'));
    expect(href?.toString(), isNot(contains('service_role')));
    expect(href?.toString(), isNot(contains('Bearer')));
  });

  test('ignores unrelated panel paths', () {
    expect(
      MerchantDeepLink.conversationIdFromUri(
        Uri.parse('https://app.elmenuxfa.com/panel/orders'),
      ),
      isNull,
    );
  });
}
