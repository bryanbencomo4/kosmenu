import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

class ProductImageOptimizer {
  const ProductImageOptimizer._();

  static const int maxDimension = 1280;
  static const int jpegQuality = 78;

  static Uint8List compressToJpeg(Uint8List sourceBytes) {
    if (sourceBytes.isEmpty) {
      throw const FormatException('La imagen está vacía.');
    }

    final img.Image? decoded;
    try {
      decoded = img.decodeImage(sourceBytes);
    } catch (_) {
      throw const FormatException('No se pudo leer el formato de la imagen.');
    }
    if (decoded == null) {
      throw const FormatException('No se pudo leer el formato de la imagen.');
    }

    final oriented = img.bakeOrientation(decoded);
    final scale = math.min(
      1.0,
      maxDimension / math.max(oriented.width, oriented.height),
    );
    final resized = img.copyResize(
      oriented,
      width: math.max(1, (oriented.width * scale).round()),
      height: math.max(1, (oriented.height * scale).round()),
      interpolation: img.Interpolation.average,
    );
    final flattened = img.Image(width: resized.width, height: resized.height);
    img.fill(flattened, color: img.ColorRgb8(255, 255, 255));
    img.compositeImage(flattened, resized);

    return Uint8List.fromList(img.encodeJpg(flattened, quality: jpegQuality));
  }
}