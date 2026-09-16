/// Square-crop math and encoding for the in-app logo editor.
///
/// Deliberately free of any Flutter dependency (only `dart:math`,
/// `dart:typed_data` and the pure-Dart `image` package are used) so the mapping
/// between what the editor paints and what it exports can be unit-tested
/// without a widget environment.
library;

import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// The square region of the source image, in source pixels, that the editor
/// viewport is currently showing.
class LogoCropRect {
  const LogoCropRect({
    required this.left,
    required this.top,
    required this.side,
  });

  final double left;
  final double top;
  final double side;
}

/// A cropped logo, already encoded and ready to be uploaded.
class LogoCropResult {
  const LogoCropResult({
    required this.bytes,
    required this.fileName,
    required this.mimeType,
  });

  final Uint8List bytes;

  /// Name carried into `XFile`, because the storage upload derives both the
  /// object extension and its `Content-Type` from it.
  final String fileName;

  final String mimeType;
}

/// Smallest scale at which an [imageWidth] x [imageHeight] image still covers a
/// square viewport of [viewportSide] logical pixels, so the editor never shows
/// empty space next to the logo.
///
/// Returns 1 for degenerate sizes so callers never divide by zero.
double logoCoverScale({
  required int imageWidth,
  required int imageHeight,
  required double viewportSide,
}) {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportSide <= 0) {
    return 1;
  }
  return math.max(viewportSide / imageWidth, viewportSide / imageHeight);
}

/// How far the image can be dragged along one axis before a gap would appear
/// inside the viewport. Zero when the image exactly covers it.
double logoMaxPan({
  required double displayedExtent,
  required double viewportSide,
}) {
  return math.max(0, (displayedExtent - viewportSide) / 2);
}

/// Keeps [pan] within [logoMaxPan] so the viewport stays fully covered.
double clampLogoPan({
  required double pan,
  required double displayedExtent,
  required double viewportSide,
}) {
  final limit = logoMaxPan(
    displayedExtent: displayedExtent,
    viewportSide: viewportSide,
  );
  return pan.clamp(-limit, limit);
}

/// Source rectangle matching what the editor paints, where the image is drawn
/// centered on the viewport, scaled by [scale] and displaced by [panX]/[panY]
/// logical pixels.
///
/// The result is clamped to the image bounds so accumulated floating point
/// drift can never ask the rasterizer for pixels outside the source.
LogoCropRect computeLogoCropRect({
  required int imageWidth,
  required int imageHeight,
  required double viewportSide,
  required double scale,
  required double panX,
  required double panY,
}) {
  final safeScale = scale <= 0 ? 1.0 : scale;
  final side = math.min(
    viewportSide / safeScale,
    math.min(imageWidth, imageHeight).toDouble(),
  );
  final left = imageWidth / 2 - (viewportSide / 2 + panX) / safeScale;
  final top = imageHeight / 2 - (viewportSide / 2 + panY) / safeScale;

  return LogoCropRect(
    left: left.clamp(0.0, math.max(0.0, imageWidth - side)),
    top: top.clamp(0.0, math.max(0.0, imageHeight - side)),
    side: side,
  );
}

/// Encodes the [side] x [side] straight (non-premultiplied) RGBA buffer of a
/// cropped logo.
///
/// PNG is used while the crop still has transparent pixels: logos with a
/// cut-out background lose their shape once flattened onto JPEG's opaque
/// canvas. Fully opaque crops are encoded as JPEG instead, which is several
/// times lighter for the same logo that every public menu visit downloads.
LogoCropResult encodeCroppedLogo({
  required Uint8List straightRgba,
  required int side,
}) {
  final image = img.Image.fromBytes(
    width: side,
    height: side,
    bytes: straightRgba.buffer,
    bytesOffset: straightRgba.offsetInBytes,
    numChannels: 4,
  );

  if (rgbaHasTransparency(straightRgba)) {
    return LogoCropResult(
      bytes: img.encodePng(image),
      fileName: 'logo.png',
      mimeType: 'image/png',
    );
  }

  return LogoCropResult(
    bytes: img.encodeJpg(image, quality: 88),
    fileName: 'logo.jpg',
    mimeType: 'image/jpeg',
  );
}

/// True when any pixel of a straight RGBA buffer is not fully opaque.
bool rgbaHasTransparency(Uint8List rgba) {
  for (var i = 3; i < rgba.length; i += 4) {
    if (rgba[i] != 255) {
      return true;
    }
  }
  return false;
}
