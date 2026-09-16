import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:kosmenu_app/services/logo_crop.dart';

/// Largest side of an exported logo, in pixels.
const int kMaxLogoOutputSide = 512;

/// Rasterizes [crop] out of [image] and encodes it as an uploadable logo.
///
/// The output is square and never upscaled, so a small source logo keeps its
/// own resolution instead of being blown up to [maxOutputSide].
///
/// Split out of the editor widget so the crop that gets uploaded can be
/// verified against known pixels without driving a dialog.
Future<LogoCropResult> rasterizeLogoCrop({
  required ui.Image image,
  required LogoCropRect crop,
  int maxOutputSide = kMaxLogoOutputSide,
}) async {
  final outputSide = crop.side.round().clamp(1, maxOutputSide);
  final target = Rect.fromLTWH(
    0,
    0,
    outputSide.toDouble(),
    outputSide.toDouble(),
  );

  final recorder = ui.PictureRecorder();
  Canvas(recorder, target).drawImageRect(
    image,
    Rect.fromLTWH(crop.left, crop.top, crop.side, crop.side),
    target,
    Paint()..filterQuality = FilterQuality.medium,
  );

  final picture = recorder.endRecording();
  final ui.Image rendered;
  try {
    rendered = await picture.toImage(outputSide, outputSide);
  } finally {
    picture.dispose();
  }

  try {
    // Straight (non-premultiplied) RGBA, because premultiplied bytes would
    // darken every semi-transparent pixel once re-encoded.
    final rgba = await rendered.toByteData(
      format: ui.ImageByteFormat.rawStraightRgba,
    );
    if (rgba == null) {
      throw StateError('Cropped logo could not be read back.');
    }
    return encodeCroppedLogo(
      straightRgba: rgba.buffer.asUint8List(
        rgba.offsetInBytes,
        rgba.lengthInBytes,
      ),
      side: outputSide,
    );
  } finally {
    rendered.dispose();
  }
}
