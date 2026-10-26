import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:kosmenu_app/services/media_crop.dart';
import 'package:kosmenu_app/widgets/media_crop_editor.dart';

class _Portrait3x4Preset implements CropAspectRatioPresetData {
  const _Portrait3x4Preset();

  @override
  String get name => '3x4';

  @override
  (int, int)? get data => (
        kMenuMediaAspectWidth.toInt(),
        kMenuMediaAspectHeight.toInt(),
      );
}

/// Instagram-style 3:4 crop before uploading category/product photos.
///
/// Existing published images are never touched — only new picks go through
/// this path. Cancel returns `null` and callers must abort the upload.
class MediaImageCropService {
  const MediaImageCropService();

  static const _portrait3x4 = _Portrait3x4Preset();

  /// Crops [source] to menu aspect 3:4. Returns JPEG bytes or `null` if cancelled.
  Future<MediaCropResult?> cropForUpload(
    BuildContext context, {
    required XFile source,
    required MediaCropKind kind,
  }) async {
    if (kIsWeb) {
      return _cropInApp(context, source: source, kind: kind);
    }

    try {
      final native = await _cropNative(source: source, kind: kind);
      if (native != null) return native;
      // null from native cropper = user cancel — do not fall through to in-app
      // (that would force a second crop UI after Cancel).
      return null;
    } catch (error, stackTrace) {
      debugPrint(
        'Native media crop failed, falling back to in-app: '
        '${error.runtimeType}: $error\n$stackTrace',
      );
      if (!context.mounted) return null;
      return _cropInApp(context, source: source, kind: kind);
    }
  }

  Future<MediaCropResult?> _cropInApp(
    BuildContext context, {
    required XFile source,
    required MediaCropKind kind,
  }) async {
    final bytes = await source.readAsBytes();
    if (!context.mounted) return null;
    return showMediaCropEditor(context, sourceBytes: bytes, kind: kind);
  }

  Future<MediaCropResult?> _cropNative({
    required XFile source,
    required MediaCropKind kind,
  }) async {
    final title = kind == MediaCropKind.category
        ? 'Ajusta la portada'
        : 'Ajusta la foto';

    final path = source.path.trim();
    if (path.isEmpty) {
      // Native cropper needs a filesystem path; fall back via catch in caller.
      throw StateError('Media crop source has no path for native cropper');
    }

    final cropped = await ImageCropper().cropImage(
      sourcePath: path,
      compressFormat: ImageCompressFormat.jpg,
      compressQuality: 90,
      aspectRatio: const CropAspectRatio(
        ratioX: kMenuMediaAspectWidth,
        ratioY: kMenuMediaAspectHeight,
      ),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: title,
          toolbarColor: const Color(0xFF121212),
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: const Color(0xFF8B5CF6),
          backgroundColor: const Color(0xFF000000),
          dimmedLayerColor: const Color(0x99000000),
          cropFrameColor: Colors.white,
          cropGridColor: const Color(0x66FFFFFF),
          cropGridRowCount: 2,
          cropGridColumnCount: 2,
          showCropGrid: true,
          lockAspectRatio: true,
          hideBottomControls: false,
          initAspectRatio: _portrait3x4,
          aspectRatioPresets: const [_portrait3x4],
        ),
        IOSUiSettings(
          title: title,
          aspectRatioLockEnabled: true,
          resetAspectRatioEnabled: false,
          aspectRatioPickerButtonHidden: true,
          aspectRatioPresets: const [_portrait3x4],
        ),
      ],
    );

    if (cropped == null) return null;

    final outBytes = await cropped.readAsBytes();
    return MediaCropResult(
      bytes: Uint8List.fromList(outBytes),
      fileName: kind == MediaCropKind.category ? 'category.jpg' : 'product.jpg',
      mimeType: 'image/jpeg',
    );
  }
}
