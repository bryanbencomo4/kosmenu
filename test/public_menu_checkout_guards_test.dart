import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('public_menu_view no longer inserts pedidos via Supabase', () {
    final source = File('lib/screens/public_menu_view.dart').readAsStringSync();
    expect(source.contains("from('pedidos')"), isFalse);
    expect(source.contains('.insert('), isFalse);
    expect(source.contains('getPublicUrl'), isFalse);
    expect(source.contains('PublicOrderApiService'), isTrue);
    expect(source.contains('CheckoutAttemptState'), isTrue);
  });

  test('order detail uses signed URL service, not getPublicUrl for proofs', () {
    final source = File('lib/screens/order_detail_screen.dart').readAsStringSync();
    expect(source.contains('fetchComprobanteSignedUrl'), isTrue);
    expect(source.contains("from('comprobantes')"), isFalse);
  });
}
