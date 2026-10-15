import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:kosmenu_app/core/constants.dart';
import 'package:package_info_plus/package_info_plus.dart';

class AndroidAppRelease {
  const AndroidAppRelease({
    required this.versionCode,
    required this.versionName,
    required this.forceUpdate,
    required this.downloadUrl,
    this.notes = '',
    this.fileName = '',
  });

  final int versionCode;
  final String versionName;
  final bool forceUpdate;
  final String downloadUrl;
  final String notes;
  final String fileName;

  factory AndroidAppRelease.fromJson(Map<String, dynamic> json) {
    return AndroidAppRelease(
      versionCode: (json['versionCode'] as num?)?.toInt() ?? 0,
      versionName: (json['versionName'] as String?)?.trim() ?? '',
      forceUpdate: json['forceUpdate'] == true,
      downloadUrl: (json['downloadUrl'] as String?)?.trim() ?? '',
      notes: (json['notes'] as String?)?.trim() ?? '',
      fileName: (json['fileName'] as String?)?.trim() ?? '',
    );
  }
}

class AppUpdateService {
  const AppUpdateService._();

  /// Returns a release when the installed Android build must update.
  static Future<AndroidAppRelease?> checkRequiredAndroidUpdate() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) {
      return null;
    }

    try {
      final info = await PackageInfo.fromPlatform();
      final localCode = int.tryParse(info.buildNumber.trim()) ?? 0;
      if (localCode <= 0) return null;

      final uri = Uri.parse('${AppLinks.apiBaseUrl}/api/app/android-release');
      final response = await http
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 12));

      if (response.statusCode != 200) return null;

      final payload = jsonDecode(response.body);
      if (payload is! Map) return null;
      final data = payload['data'];
      if (data is! Map) return null;

      final releaseRaw = data['release'];
      if (releaseRaw is! Map) return null;

      final release = AndroidAppRelease.fromJson(
        Map<String, dynamic>.from(releaseRaw),
      );
      if (release.versionCode <= 0 || release.downloadUrl.isEmpty) {
        return null;
      }
      if (!release.forceUpdate) return null;
      if (release.versionCode <= localCode) return null;
      return release;
    } catch (error) {
      debugPrint('App update check failed: $error');
      return null;
    }
  }
}
