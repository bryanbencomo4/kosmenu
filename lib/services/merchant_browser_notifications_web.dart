import 'dart:convert';
import 'dart:js_interop';

import 'package:supabase_flutter/supabase_flutter.dart';

@JS('__merchantNotifications')
external _MerchantNotifications? get _bridge;

extension type _MerchantNotifications._(JSObject _) implements JSObject {
  external JSPromise<JSString> enable(JSString config, JSString vapidKey);
  external void show(JSString orderId, JSString label);
}

Future<String> enableMerchantBrowserNotifications() async {
  final bridge = _bridge;
  if (bridge == null) return 'unsupported';
  const config = String.fromEnvironment('FIREBASE_WEB_CONFIG');
  const vapidKey = String.fromEnvironment('FIREBASE_WEB_VAPID_KEY');
  try {
    final result =
        jsonDecode(
              (await bridge.enable(config.toJS, vapidKey.toJS).toDart).toDart,
            )
            as Map<String, dynamic>;
    final token = result['token']?.toString().trim() ?? '';
    final client = Supabase.instance.client;
    final user = client.auth.currentUser;
    if (token.isNotEmpty && user != null) {
      await client.from('user_tokens').upsert({
        'user_id': user.id,
        'fcm_token': token,
        'device_type': 'web',
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      }, onConflict: 'user_id,fcm_token');
    }
    return result['status']?.toString() ?? 'unsupported';
  } catch (_) {
    return 'error';
  }
}

void showMerchantBrowserNotification(String orderId, String label) {
  _bridge?.show(orderId.toJS, label.toJS);
}
