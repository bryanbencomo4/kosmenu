import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

class StorageUploadResult {
  const StorageUploadResult({required this.path, required this.publicUrl});

  final String path;
  final String publicUrl;
}

class StorageService {
  const StorageService();

  static const String _bucketName = 'menu-scans';

  Future<StorageUploadResult> uploadMenuAsset({
    required File file,
    required String comercioId,
    required String contentType,
    String? fileName,
  }) async {
    final timestamp = DateTime.now().microsecondsSinceEpoch;
    final normalizedName = _normalizedFileName(fileName ?? file.path);
    final path = '$comercioId/${timestamp}_$normalizedName';

    final storage = Supabase.instance.client.storage.from(_bucketName);

    await storage.upload(
      path,
      file,
      fileOptions: FileOptions(contentType: contentType, upsert: false),
    );

    final publicUrl = storage.getPublicUrl(path);

    return StorageUploadResult(path: path, publicUrl: publicUrl);
  }

  Future<StorageUploadResult> uploadMenuScan({
    required File imageFile,
    required String comercioId,
  }) async {
    return uploadMenuAsset(
      file: imageFile,
      comercioId: comercioId,
      contentType: 'image/jpeg',
      fileName: imageFile.path,
    );
  }

  String _normalizedFileName(String value) {
    final slashNormalized = value.replaceAll('\\', '/');
    final rawName = slashNormalized.split('/').last.trim();
    final safeName = rawName.replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '_');
    if (safeName.isEmpty) {
      return 'menu_asset.bin';
    }
    if (safeName.contains('.')) {
      return safeName;
    }
    return '$safeName.bin';
  }
}
