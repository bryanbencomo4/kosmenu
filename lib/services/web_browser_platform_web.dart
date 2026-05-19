import 'dart:html' as html;

bool isLikelyMobileWebBrowser() {
  final userAgent = html.window.navigator.userAgent.toLowerCase();
  final hasMobileToken = RegExp(
    r'android|iphone|ipad|ipod|iemobile|opera mini|mobile',
  ).hasMatch(userAgent);
  return hasMobileToken;
}