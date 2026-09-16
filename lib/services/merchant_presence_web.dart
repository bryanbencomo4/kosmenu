import 'dart:convert';
import 'dart:html' as html;

const String _cookieName = 'elmenuxfa_merchant';

void syncMerchantPresence({
  required String name,
  String? logoUrl,
  String? slug,
}) {
  final trimmedName = name.trim();
  if (trimmedName.isEmpty) {
    clearMerchantPresence();
    return;
  }

  final payload = <String, Object?>{
    'name': trimmedName.length > 80 ? trimmedName.substring(0, 80) : trimmedName,
    'logoUrl': _safeLogoUrl(logoUrl),
    'slug': _clipped(slug, 80),
  };

  html.document.cookie = _cookie(
    value: Uri.encodeComponent(jsonEncode(payload)),
    maxAgeSeconds: 2592000,
  );
}

void clearMerchantPresence() {
  html.document.cookie = _cookie(value: '', maxAgeSeconds: 0);
}

String? _clipped(String? value, int max) {
  final trimmed = (value ?? '').trim();
  if (trimmed.isEmpty) return null;
  return trimmed.length > max ? trimmed.substring(0, max) : trimmed;
}

String? _safeLogoUrl(String? value) {
  final trimmed = (value ?? '').trim();
  if (trimmed.isEmpty || !trimmed.startsWith('https://')) return null;
  return trimmed.length > 500 ? trimmed.substring(0, 500) : trimmed;
}

String _cookie({required String value, required int maxAgeSeconds}) {
  final hostname = html.window.location.hostname ?? '';
  final parts = <String>[
    '$_cookieName=$value',
    'Path=/',
    'Max-Age=$maxAgeSeconds',
    'SameSite=Lax',
  ];
  if (hostname == 'elmenuxfa.com' || hostname.endsWith('.elmenuxfa.com')) {
    parts.add('Domain=.elmenuxfa.com');
  }
  if (hostname != 'localhost' && hostname != '127.0.0.1') {
    parts.add('Secure');
  }
  return parts.join('; ');
}
