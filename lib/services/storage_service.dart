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

  Future<StorageUploadResult> uploadMenuScan({
    required File imageFile,
    required String comercioId,
  }) async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final path = '$comercioId/$timestamp.jpg';

    final storage = Supabase.instance.client.storage.from(_bucketName);

    await storage.upload(
      path,
      imageFile,
      fileOptions: const FileOptions(contentType: 'image/jpeg', upsert: false),
    );

    final publicUrl = storage.getPublicUrl(path);

    return StorageUploadResult(path: path, publicUrl: publicUrl);
  }
}
