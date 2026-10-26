/// Rectangular crop math and JPEG encoding for category/product media.
///
/// Pure Dart (no Flutter) so crop mapping can be unit-tested without widgets.
library;

import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

/// Aspect used by public menu category cards and product thumbs (width:height).
const double kMenuMediaAspectWidth = 3;
const double kMenuMediaAspectHeight = 4;

/// Source rectangle in image pixels matching the editor viewport.
class MediaCropRect {
  const MediaCropRect({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
  });

  final double left;
  final double top;
  final double width;
  final double height;
}

/// Cropped media ready to upload (always JPEG for product/category photos).
class MediaCropResult {
  const MediaCropResult({
    required this.bytes,
    required this.fileName,
    required this.mimeType,
  });

  final Uint8List bytes;
  final String fileName;
  final String mimeType;
}

/// Smallest scale that covers a [viewportWidth] x [viewportHeight] frame.
double mediaCoverScale({
  required int imageWidth,
  required int imageHeight,
  required double viewportWidth,
  required double viewportHeight,
}) {
  if (imageWidth <= 0 ||
      imageHeight <= 0 ||
      viewportWidth <= 0 ||
      viewportHeight <= 0) {
    return 1;
  }
  return math.max(viewportWidth / imageWidth, viewportHeight / imageHeight);
}

double mediaMaxPan({
  required double displayedExtent,
  required double viewportExtent,
}) {
  return math.max(0, (displayedExtent - viewportExtent) / 2);
}

double clampMediaPan({
  required double pan,
  required double displayedExtent,
  required double viewportExtent,
}) {
  final limit = mediaMaxPan(
    displayedExtent: displayedExtent,
    viewportExtent: viewportExtent,
  );
  return pan.clamp(-limit, limit);
}

/// Source rectangle for an image drawn centered, scaled by [scale], panned by
/// [panX]/[panY] (logical pixels) inside the viewport.
MediaCropRect computeMediaCropRect({
  required int imageWidth,
  required int imageHeight,
  required double viewportWidth,
  required double viewportHeight,
  required double scale,
  required double panX,
  required double panY,
}) {
  final safeScale = scale <= 0 ? 1.0 : scale;
  final cropW = math.min(viewportWidth / safeScale, imageWidth.toDouble());
  final cropH = math.min(viewportHeight / safeScale, imageHeight.toDouble());
  final left = imageWidth / 2 - (viewportWidth / 2 + panX) / safeScale;
  final top = imageHeight / 2 - (viewportHeight / 2 + panY) / safeScale;

  return MediaCropRect(
    left: left.clamp(0.0, math.max(0.0, imageWidth - cropW)),
    top: top.clamp(0.0, math.max(0.0, imageHeight - cropH)),
    width: cropW,
    height: cropH,
  );
}

/// Encodes a straight RGBA buffer as JPEG for menu media uploads.
MediaCropResult encodeCroppedMedia({
  required Uint8List straightRgba,
  required int width,
  required int height,
  String fileName = 'media.jpg',
}) {
  final image = img.Image.fromBytes(
    width: width,
    height: height,
    bytes: straightRgba.buffer,
    bytesOffset: straightRgba.offsetInBytes,
    numChannels: 4,
  );

  return MediaCropResult(
    bytes: Uint8List.fromList(img.encodeJpg(image, quality: 90)),
    fileName: fileName,
    mimeType: 'image/jpeg',
  );
}

/// Storage object path for the uncropped master sibling (`foo.jpg` → `foo_full.jpg`).
///
/// Re-crop editors load this so framing can be adjusted without losing pixels
/// that were outside the previous 3:4 window.
String mediaMasterObjectPath(String croppedObjectPath) {
  final path = croppedObjectPath.trim();
  final slash = path.lastIndexOf('/');
  final dir = slash >= 0 ? path.substring(0, slash + 1) : '';
  final name = slash >= 0 ? path.substring(slash + 1) : path;
  final dot = name.lastIndexOf('.');
  if (dot <= 0) return '${path}_full';
  final base = name.substring(0, dot);
  if (base.endsWith('_full')) return path;
  final ext = name.substring(dot);
  return '$dir${base}_full$ext';
}

/// Public URL of the uncropped master sibling for a published cropped image.
String? mediaMasterSiblingUrl(String? publishedUrl) {
  final raw = publishedUrl?.trim() ?? '';
  if (raw.isEmpty) return null;
  final uri = Uri.tryParse(raw);
  if (uri == null || !uri.hasScheme) return null;
  final path = uri.path;
  final slash = path.lastIndexOf('/');
  final name = slash >= 0 ? path.substring(slash + 1) : path;
  final dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  final base = name.substring(0, dot);
  final masterPath =
      base.endsWith('_full') ? path : mediaMasterObjectPath(path);
  return Uri(
    scheme: uri.scheme,
    host: uri.host,
    port: uri.hasPort ? uri.port : null,
    path: masterPath,
  ).toString();
}
