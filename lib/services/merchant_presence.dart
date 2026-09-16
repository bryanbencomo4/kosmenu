import 'merchant_presence_stub.dart'
    if (dart.library.html) 'merchant_presence_web.dart' as impl;

void syncMerchantPresence({
  required String name,
  String? logoUrl,
  String? slug,
}) {
  impl.syncMerchantPresence(name: name, logoUrl: logoUrl, slug: slug);
}

void clearMerchantPresence() {
  impl.clearMerchantPresence();
}
