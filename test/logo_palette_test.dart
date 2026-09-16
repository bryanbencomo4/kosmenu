import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/logo_palette.dart';

void main() {
  /// Encodes a logo shaped like the ones merchants upload: a colored mark over
  /// a background that covers most of the canvas.
  Uint8List logoPng({
    required int mark,
    required int background,
    int backgroundAlpha = 255,
    int size = 120,
  }) {
    final image = img.Image(width: size, height: size, numChannels: 4);
    final bgColor = img.ColorRgba8(
      (background >> 16) & 0xFF,
      (background >> 8) & 0xFF,
      background & 0xFF,
      backgroundAlpha,
    );
    final markColor = img.ColorRgba8(
      (mark >> 16) & 0xFF,
      (mark >> 8) & 0xFF,
      mark & 0xFF,
      255,
    );

    img.fill(image, color: bgColor);
    // A centered square covering ~25% of the canvas, so the background stays
    // the most frequent color.
    img.fillRect(
      image,
      x1: size ~/ 4,
      y1: size ~/ 4,
      x2: size ~/ 4 + size ~/ 2,
      y2: size ~/ 4 + size ~/ 2,
      color: markColor,
    );

    return Uint8List.fromList(img.encodePng(image));
  }

  /// The rescue palette the app used to force onto every brand.
  const rescueRed = Color(0xFFE63946);

  bool isBlueish(Color color) {
    final hue = HSLColor.fromColor(color).hue;
    return hue > 190 && hue < 260;
  }

  test('Caso 1: un logo azul sobre blanco produce un primario azul', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x1E63C8, background: 0xFFFFFF),
    );

    expect(palette, isNotNull);
    expect(
      isBlueish(palette!.primary),
      isTrue,
      reason: 'primario fue ${palette.primary}',
    );
    // El blanco es el color mas frecuente, pero no sirve como color de marca.
    expect(palette.primary.computeLuminance(), lessThan(0.6));
  });

  test('Caso 2: el primario no es el rojo de respaldo', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x1E63C8, background: 0xFFFFFF),
    );

    expect(
      logoColorDistance(palette!.primary, rescueRed),
      greaterThan(40),
      reason: 'la paleta local no debe parecerse al respaldo Premium',
    );
  });

  test('Caso 3: ignora el fondo transparente y usa el color de la marca', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x1E63C8, background: 0x000000, backgroundAlpha: 0),
    );

    expect(palette, isNotNull);
    expect(isBlueish(palette!.primary), isTrue);
    // Solo el cuadrado opaco cuenta, asi que es el unico color detectado.
    expect(palette.colors, hasLength(1));
  });

  test('Caso 4: un logo verde produce una paleta verde', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x19A34A, background: 0xFFFFFF),
    );

    final hue = HSLColor.fromColor(palette!.primary).hue;
    expect(hue, greaterThan(90));
    expect(hue, lessThan(170));
  });

  test('Caso 5: el acento se diferencia del primario', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x1E63C8, background: 0xFFFFFF),
    );

    expect(logoColorDistance(palette!.primary, palette.accent), greaterThan(20));
  });

  test('Caso 6: el texto contrasta con la superficie', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x1E63C8, background: 0x101010),
    );

    final surfaceIsDark =
        ThemeData.estimateBrightnessForColor(palette!.surface) ==
        Brightness.dark;
    expect(
      palette.text,
      surfaceIsDark ? const Color(0xFFF8F5FF) : const Color(0xFF1D1733),
    );
  });

  test('Caso 7: una imagen completamente transparente no da paleta', () {
    final image = img.Image(width: 40, height: 40, numChannels: 4);
    img.fill(image, color: img.ColorRgba8(0, 0, 0, 0));

    expect(
      extractLogoPalette(Uint8List.fromList(img.encodePng(image))),
      isNull,
    );
  });

  test('Caso 8: bytes que no son imagen no dan paleta', () {
    expect(
      extractLogoPalette(Uint8List.fromList(<int>[1, 2, 3, 4, 5])),
      isNull,
    );
  });

  test('Caso 9: los colores dominantes vienen ordenados por frecuencia', () {
    final palette = extractLogoPalette(
      logoPng(mark: 0x1E63C8, background: 0xFFFFFF),
    );

    // El fondo blanco ocupa mas superficie que la marca.
    expect(palette!.colors.first.computeLuminance(), greaterThan(0.8));
  });
}
