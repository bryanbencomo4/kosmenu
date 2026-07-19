import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/comprobante_signed_url_session.dart';

void main() {
  group('ComprobanteSignedUrlSession', () {
    test('stores ephemeral url and clears it', () {
      final session = ComprobanteSignedUrlSession();
      expect(session.hasUsableUrl, isFalse);
      session.store(url: 'https://example.test/signed', expiresInSec: 300);
      expect(session.hasUsableUrl, isTrue);
      expect(session.url, 'https://example.test/signed');
      session.clear();
      expect(session.url, isNull);
      expect(session.hasUsableUrl, isFalse);
    });

    test('caps ttl at 5 minutes for client-side expiry bookkeeping', () {
      final session = ComprobanteSignedUrlSession();
      session.store(url: 'https://example.test/signed', expiresInSec: 9999);
      final expiresAt = session.expiresAt!;
      final delta = expiresAt.difference(DateTime.now());
      expect(delta.inSeconds <= 300, isTrue);
      expect(delta.inSeconds >= 250, isTrue);
    });

    test('empty url clears session', () {
      final session = ComprobanteSignedUrlSession();
      session.store(url: 'https://example.test/signed', expiresInSec: 120);
      session.store(url: '   ', expiresInSec: 120);
      expect(session.url, isNull);
      expect(session.hasUsableUrl, isFalse);
    });
  });
}
