import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:kosmenu_app/services/media_crop.dart';

/// Longest side of an exported category/product crop, in pixels.
const int kMaxMediaOutputLongSide = 1600;

/// Rasterizes [crop] out of [image] and encodes JPEG for upload.
///
/// Never upscales: a small source keeps its resolution, capped at
/// [maxLongSide] on the longer edge.
Future<MediaCropResult> rasterizeMediaCrop({
  required ui.Image image,
  required MediaCropRect crop,
  int maxLongSide = kMaxMediaOutputLongSide,
  String fileName = 'media.jpg',
}) async {
  final srcW = math.max(1, crop.width.round());
  final srcH = math.max(1, crop.height.round());
  final longSide = math.max(srcW, srcH);
  final scaleDown = longSide > maxLongSide ? maxLongSide / longSide : 1.0;
  final outW = math.max(1, (srcW * scaleDown).round());
  final outH = math.max(1, (srcH * scaleDown).round());

  final target = Rect.fromLTWH(0, 0, outW.toDouble(), outH.toDouble());
  final recorder = ui.PictureRecorder();
  Canvas(recorder, target).drawImageRect(
    image,
    Rect.fromLTWH(crop.left, crop.top, crop.width, crop.height),
    target,
    Paint()..filterQuality = FilterQuality.medium,
  );

  final picture = recorder.endRecording();
  final ui.Image rendered;
  try {
    rendered = await picture.toImage(outW, outH);
  } finally {
    picture.dispose();
  }

  try {
    final rgba = await rendered.toByteData(
      format: ui.ImageByteFormat.rawStraightRgba,
    );
    if (rgba == null) {
      throw StateError('Cropped media could not be read back.');
    }
    return encodeCroppedMedia(
      straightRgba: rgba.buffer.asUint8List(
        rgba.offsetInBytes,
        rgba.lengthInBytes,
      ),
      width: outW,
      height: outH,
      fileName: fileName,
    );
  } finally {
    rendered.dispose();
  }
}
