import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/product_image_optimizer.dart';

void main() {
  test('resizes product images and returns a smaller JPEG', () {
    final source = img.Image(width: 2400, height: 1200);
    img.fill(source, color: img.ColorRgb8(190, 75, 40));
    final sourceBytes = Uint8List.fromList(img.encodeJpg(source, quality: 95));

    final optimizedBytes = ProductImageOptimizer.compressToJpeg(sourceBytes);
    final optimized = img.decodeImage(optimizedBytes);

    expect(optimized, isNotNull);
    expect(optimized!.width, 1280);
    expect(optimized.height, 640);
    expect(optimizedBytes.length, lessThan(sourceBytes.length));
  });

  test('rejects empty and unreadable image data', () {
    expect(
      () => ProductImageOptimizer.compressToJpeg(Uint8List(0)),
      throwsFormatException,
    );
    expect(
      () => ProductImageOptimizer.compressToJpeg(Uint8List.fromList([1, 2, 3])),
      throwsFormatException,
    );
  });
}