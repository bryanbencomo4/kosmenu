import 'dart:html' as html;

bool isLikelyMobileWebBrowser() {
  final userAgent = html.window.navigator.userAgent.toLowerCase();
  final hasMobileToken = RegExp(
    r'android|iphone|ipad|ipod|iemobile|opera mini|mobile',
  ).hasMatch(userAgent);
  return hasMobileToken;
}

/// Replaces the current tab. Never uses `window.open`, so iOS/WhatsApp
/// in-app browsers cannot block it as a popup.
bool openUrlInSameTab(String url) {
  final trimmed = url.trim();
  if (trimmed.isEmpty) return false;
  html.window.location.assign(trimmed);
  return true;
}