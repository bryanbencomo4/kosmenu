import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/media_crop.dart';

void main() {
  group('mediaCoverScale', () {
    test('landscape image scales by height for a 3:4 viewport', () {
      final scale = mediaCoverScale(
        imageWidth: 800,
        imageHeight: 400,
        viewportWidth: 300,
        viewportHeight: 400,
      );
      expect(scale, 1);
    });

    test('portrait image covers a 3:4 viewport by width when taller', () {
      final scale = mediaCoverScale(
        imageWidth: 300,
        imageHeight: 600,
        viewportWidth: 300,
        viewportHeight: 400,
      );
      expect(scale, 1);
    });

    test('degenerate sizes return 1', () {
      expect(
        mediaCoverScale(
          imageWidth: 0,
          imageHeight: 100,
          viewportWidth: 300,
          viewportHeight: 400,
        ),
        1,
      );
    });
  });

  group('clampMediaPan', () {
    test('limits pan so the viewport stays covered', () {
      expect(
        clampMediaPan(pan: 999, displayedExtent: 500, viewportExtent: 300),
        100,
      );
    });

    test('blocks pan when image exactly covers the viewport', () {
      expect(
        clampMediaPan(pan: 40, displayedExtent: 300, viewportExtent: 300),
        0,
      );
    });
  });

  group('computeMediaCropRect', () {
    test('centered crop matches 3:4 from a wider image', () {
      final crop = computeMediaCropRect(
        imageWidth: 900,
        imageHeight: 400,
        viewportWidth: 300,
        viewportHeight: 400,
        scale: 1,
        panX: 0,
        panY: 0,
      );

      expect(crop.width, 300);
      expect(crop.height, 400);
      expect(crop.left, 300);
      expect(crop.top, 0);
    });

    test('pan shifts the crop window', () {
      final crop = computeMediaCropRect(
        imageWidth: 900,
        imageHeight: 400,
        viewportWidth: 300,
        viewportHeight: 400,
        scale: 1,
        panX: 100,
        panY: 0,
      );
      expect(crop.left, 200);
    });

    test('extreme pan stays inside image bounds', () {
      final crop = computeMediaCropRect(
        imageWidth: 900,
        imageHeight: 400,
        viewportWidth: 300,
        viewportHeight: 400,
        scale: 1,
        panX: -1e9,
        panY: 1e9,
      );
      expect(crop.left, 900 - crop.width);
      expect(crop.top, 0);
    });
  });

  group('encodeCroppedMedia', () {
    test('encodes opaque RGBA as JPEG', () {
      const w = 6;
      const h = 8;
      final rgba = Uint8List(w * h * 4);
      for (var i = 0; i < rgba.length; i += 4) {
        rgba[i] = 20;
        rgba[i + 1] = 40;
        rgba[i + 2] = 60;
        rgba[i + 3] = 255;
      }

      final result = encodeCroppedMedia(
        straightRgba: rgba,
        width: w,
        height: h,
      );

      expect(result.mimeType, 'image/jpeg');
      final decoded = img.decodeJpg(result.bytes);
      expect(decoded, isNotNull);
      expect(decoded!.width, w);
      expect(decoded.height, h);
    });
  });
}
