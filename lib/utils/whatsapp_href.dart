import 'package:url_launcher/url_launcher.dart';

/// WhatsApp chat links that work with both WhatsApp and WhatsApp Business.
///
/// Prefer `api.whatsapp.com/send` over `wa.me`, and try the `whatsapp://`
/// scheme first so devices with only WhatsApp Business still open a chat.
String digitsOnlyPhone(String? value) {
  return (value ?? '').replaceAll(RegExp(r'\D'), '');
}

String buildWhatsAppHref(String? phone, {String? text}) {
  final digits = digitsOnlyPhone(phone);
  if (digits.isEmpty) return '';
  final params = <String, String>{'phone': digits};
  final message = (text ?? '').trim();
  if (message.isNotEmpty) params['text'] = message;
  return Uri.https('api.whatsapp.com', '/send', params).toString();
}

Uri? buildWhatsAppDeepLinkUri(String? phone, {String? text}) {
  final digits = digitsOnlyPhone(phone);
  if (digits.isEmpty) return null;
  final params = <String, String>{'phone': digits};
  final message = (text ?? '').trim();
  if (message.isNotEmpty) params['text'] = message;
  return Uri(scheme: 'whatsapp', host: 'send', queryParameters: params);
}

/// Opens WhatsApp (or WhatsApp Business) for [phone].
Future<bool> openWhatsAppChat(String? phone, {String? text}) async {
  final https = buildWhatsAppHref(phone, text: text);
  if (https.isEmpty) return false;

  final deep = buildWhatsAppDeepLinkUri(phone, text: text);
  if (deep != null) {
    try {
      if (await canLaunchUrl(deep)) {
        final opened = await launchUrl(deep, mode: LaunchMode.externalApplication);
        if (opened) return true;
      }
    } catch (_) {
      // Fall through to HTTPS.
    }
  }

  return launchUrl(Uri.parse(https), mode: LaunchMode.externalApplication);
}

/// Opens a WhatsApp https/deep link, preferring Business-compatible handoff.
Future<bool> openWhatsAppHref(String href) async {
  final uri = Uri.tryParse(href.trim());
  if (uri == null) return false;

  String? phone;
  String? text;
  if (uri.scheme == 'whatsapp') {
    phone = uri.queryParameters['phone'];
    text = uri.queryParameters['text'];
  } else if (uri.scheme == 'https' && uri.host == 'api.whatsapp.com') {
    phone = uri.queryParameters['phone'];
    text = uri.queryParameters['text'];
  } else if (uri.scheme == 'https' && uri.host == 'wa.me') {
    phone = uri.path.replaceAll(RegExp(r'\D'), '');
    text = uri.queryParameters['text'];
  }

  if ((phone ?? '').replaceAll(RegExp(r'\D'), '').isNotEmpty) {
    return openWhatsAppChat(phone, text: text);
  }

  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
