import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import 'web_browser_platform_stub.dart'
    if (dart.library.html) 'web_browser_platform_web.dart';

/// Opens [uri] without a popup window.
///
/// On web this replaces the current tab (`location.assign`). Popups are
/// blocked silently on iPhone/WhatsApp in-app browsers.
Future<bool> openUriWithoutPopup(Uri uri) async {
  if (kIsWeb) {
    return openUrlInSameTab(uri.toString());
  }
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
