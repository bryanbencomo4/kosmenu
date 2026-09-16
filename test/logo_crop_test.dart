import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/logo_crop.dart';

/// Builds a straight RGBA buffer of [side] x [side] pixels, all with alpha
/// [alpha].
Uint8List _rgba(int side, {int alpha = 255}) {
  final bytes = Uint8List(side * side * 4);
  for (var i = 0; i < bytes.length; i += 4) {
    bytes[i] = 10;
    bytes[i + 1] = 20;
    bytes[i + 2] = 30;
    bytes[i + 3] = alpha;
  }
  return bytes;
}

void main() {
  group('logoCoverScale', () {
    test('Caso 1: imagen apaisada escala por el lado corto', () {
      final scale = logoCoverScale(
        imageWidth: 800,
        imageHeight: 400,
        viewportSide: 200,
      );
      // El alto (400) es el limitante: 200 / 400 = 0.5.
      expect(scale, 0.5);
    });

    test('Caso 2: imagen vertical escala por el ancho', () {
      final scale = logoCoverScale(
        imageWidth: 400,
        imageHeight: 800,
        viewportSide: 200,
      );
      expect(scale, 0.5);
    });

    test('Caso 3: tamanos degenerados devuelven 1 y no dividen por cero', () {
      expect(
        logoCoverScale(imageWidth: 0, imageHeight: 100, viewportSide: 200),
        1,
      );
      expect(
        logoCoverScale(imageWidth: 100, imageHeight: 100, viewportSide: 0),
        1,
      );
    });
  });

  group('clampLogoPan', () {
    test('no permite arrastrar hasta dejar un hueco en el viewport', () {
      // Imagen de 300 px en un viewport de 200: sobran 50 px por lado.
      final clamped = clampLogoPan(
        pan: 999,
        displayedExtent: 300,
        viewportSide: 200,
      );
      expect(clamped, 50);
    });

    test('bloquea el arrastre cuando la imagen cubre justo el viewport', () {
      expect(
        clampLogoPan(pan: 40, displayedExtent: 200, viewportSide: 200),
        0,
      );
    });

    test('respeta un arrastre que ya estaba dentro del limite', () {
      expect(
        clampLogoPan(pan: -12, displayedExtent: 400, viewportSide: 200),
        -12,
      );
    });
  });

  group('computeLogoCropRect', () {
    test('sin zoom ni arrastre recorta el cuadrado central', () {
      // 800x400 en un viewport de 200 => cover 0.5, lado recortado 400.
      final crop = computeLogoCropRect(
        imageWidth: 800,
        imageHeight: 400,
        viewportSide: 200,
        scale: 0.5,
        panX: 0,
        panY: 0,
      );

      expect(crop.side, 400);
      expect(crop.left, 200);
      expect(crop.top, 0);
    });

    test('el zoom recorta una region mas pequena del original', () {
      final crop = computeLogoCropRect(
        imageWidth: 800,
        imageHeight: 400,
        viewportSide: 200,
        scale: 1, // cover 0.5 con zoom x2
        panX: 0,
        panY: 0,
      );

      expect(crop.side, 200);
      expect(crop.left, 300);
      expect(crop.top, 100);
    });

    test('arrastrar a la derecha mueve el recorte hacia la izquierda', () {
      final crop = computeLogoCropRect(
        imageWidth: 800,
        imageHeight: 400,
        viewportSide: 200,
        scale: 0.5,
        panX: 50,
        panY: 0,
      );

      // 50 px de pantalla a escala 0.5 son 100 px de la imagen original.
      expect(crop.left, 100);
    });

    test('un arrastre exagerado queda dentro de los limites de la imagen', () {
      final crop = computeLogoCropRect(
        imageWidth: 800,
        imageHeight: 400,
        viewportSide: 200,
        scale: 0.5,
        panX: -100000,
        panY: 100000,
      );

      expect(crop.left, 800 - crop.side);
      expect(crop.top, 0);
    });

    test('una escala invalida no produce NaN ni infinitos', () {
      final crop = computeLogoCropRect(
        imageWidth: 800,
        imageHeight: 400,
        viewportSide: 200,
        scale: 0,
        panX: 0,
        panY: 0,
      );

      expect(crop.side.isFinite, isTrue);
      expect(crop.left.isFinite, isTrue);
      expect(crop.top.isFinite, isTrue);
    });
  });

  group('rgbaHasTransparency', () {
    test('detecta un unico pixel translucido', () {
      final bytes = _rgba(4);
      bytes[4 * 4 + 3] = 200;
      expect(rgbaHasTransparency(bytes), isTrue);
    });

    test('un buffer totalmente opaco no reporta transparencia', () {
      expect(rgbaHasTransparency(_rgba(4)), isFalse);
    });
  });

  group('encodeCroppedLogo', () {
    test('un logo opaco se sube como JPG', () {
      final result = encodeCroppedLogo(straightRgba: _rgba(8), side: 8);

      expect(result.fileName, 'logo.jpg');
      expect(result.mimeType, 'image/jpeg');
      expect(img.decodeJpg(result.bytes), isNotNull);
    });

    test('un logo con transparencia se sube como PNG y la conserva', () {
      final result = encodeCroppedLogo(
        straightRgba: _rgba(8, alpha: 0),
        side: 8,
      );

      expect(result.fileName, 'logo.png');
      expect(result.mimeType, 'image/png');

      final decoded = img.decodePng(result.bytes);
      expect(decoded, isNotNull);
      expect(decoded!.getPixel(0, 0).a, 0);
    });

    test('el PNG conserva el tamano recortado', () {
      final result = encodeCroppedLogo(
        straightRgba: _rgba(16, alpha: 0),
        side: 16,
      );

      final decoded = img.decodePng(result.bytes)!;
      expect(decoded.width, 16);
      expect(decoded.height, 16);
    });
  });
}
