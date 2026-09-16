import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/logo_crop.dart';
import 'package:kosmenu_app/services/logo_rasterizer.dart';

/// A 200x100 PNG whose left half is red and right half is blue, so an exported
/// crop can be checked against known pixels.
Uint8List _twoTonePng() {
  final image = img.Image(width: 200, height: 100, numChannels: 4);
  for (var y = 0; y < 100; y++) {
    for (var x = 0; x < 200; x++) {
      if (x < 100) {
        image.setPixelRgba(x, y, 255, 0, 0, 255);
      } else {
        image.setPixelRgba(x, y, 0, 0, 255, 255);
      }
    }
  }
  return img.encodePng(image);
}

/// A 64x64 PNG that is fully transparent on its left half.
Uint8List _halfTransparentPng() {
  final image = img.Image(width: 64, height: 64, numChannels: 4);
  for (var y = 0; y < 64; y++) {
    for (var x = 0; x < 64; x++) {
      image.setPixelRgba(x, y, 0, 200, 0, x < 32 ? 0 : 255);
    }
  }
  return img.encodePng(image);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('el recorte exportado corresponde a la region pedida', () async {
    final image = await decodeImageFromList(_twoTonePng());
    addTearDown(image.dispose);

    // El cuadrado centrado de una imagen 200x100 va de x = 50 a x = 150, o sea
    // mitad rojo y mitad azul.
    final result = await rasterizeLogoCrop(
      image: image,
      crop: const LogoCropRect(left: 50, top: 0, side: 100),
    );

    final decoded = img.decodeImage(result.bytes)!;
    expect(decoded.width, 100);
    expect(decoded.height, 100);
    expect(decoded.getPixel(10, 50).r, greaterThan(200));
    expect(decoded.getPixel(10, 50).b, lessThan(60));
    expect(decoded.getPixel(90, 50).b, greaterThan(200));
    expect(decoded.getPixel(90, 50).r, lessThan(60));
  });

  test('un recorte desplazado toma solo la mitad indicada', () async {
    final image = await decodeImageFromList(_twoTonePng());
    addTearDown(image.dispose);

    // Solo la mitad azul.
    final result = await rasterizeLogoCrop(
      image: image,
      crop: const LogoCropRect(left: 100, top: 0, side: 100),
    );

    final decoded = img.decodeImage(result.bytes)!;
    expect(decoded.getPixel(10, 50).b, greaterThan(200));
    expect(decoded.getPixel(90, 50).b, greaterThan(200));
    expect(decoded.getPixel(50, 50).r, lessThan(60));
  });

  test('una imagen opaca se exporta como JPG', () async {
    final image = await decodeImageFromList(_twoTonePng());
    addTearDown(image.dispose);

    final result = await rasterizeLogoCrop(
      image: image,
      crop: const LogoCropRect(left: 50, top: 0, side: 100),
    );

    expect(result.mimeType, 'image/jpeg');
    expect(result.fileName, 'logo.jpg');
  });

  test('un logo con transparencia se exporta como PNG y la conserva', () async {
    final image = await decodeImageFromList(_halfTransparentPng());
    addTearDown(image.dispose);

    final result = await rasterizeLogoCrop(
      image: image,
      crop: const LogoCropRect(left: 0, top: 0, side: 64),
    );

    expect(result.mimeType, 'image/png');
    final decoded = img.decodePng(result.bytes)!;
    expect(decoded.getPixel(5, 32).a, 0);
    expect(decoded.getPixel(60, 32).a, 255);
  });

  test('el recorte nunca se amplia mas alla de su resolucion original', () async {
    final image = await decodeImageFromList(_halfTransparentPng());
    addTearDown(image.dispose);

    final result = await rasterizeLogoCrop(
      image: image,
      crop: const LogoCropRect(left: 0, top: 0, side: 64),
    );

    expect(img.decodeImage(result.bytes)!.width, 64);
  });

  test('un recorte grande se limita al maximo de salida', () async {
    final source = img.Image(width: 1200, height: 1200, numChannels: 4);
    img.fill(source, color: source.getColor(20, 40, 60, 255));
    final image = await decodeImageFromList(img.encodePng(source));
    addTearDown(image.dispose);

    final result = await rasterizeLogoCrop(
      image: image,
      crop: const LogoCropRect(left: 0, top: 0, side: 1200),
    );

    expect(img.decodeImage(result.bytes)!.width, kMaxLogoOutputSide);
  });

  test('la imagen decodificada expone el tamano real de la fuente', () async {
    final image = await decodeImageFromList(_twoTonePng());
    addTearDown(image.dispose);

    expect(image.width, 200);
    expect(image.height, 100);
  });

  test('bytes que no son una imagen no se pueden decodificar', () async {
    await expectLater(
      decodeImageFromList(Uint8List.fromList(<int>[1, 2, 3, 4, 5])),
      throwsA(isA<Object>()),
    );
  });

  test('rawStraightRgba esta disponible para el pipeline de exportacion', () async {
    final image = await decodeImageFromList(_halfTransparentPng());
    addTearDown(image.dispose);

    final rgba = await image.toByteData(
      format: ui.ImageByteFormat.rawStraightRgba,
    );
    expect(rgba, isNotNull);
    expect(rgba!.lengthInBytes, 64 * 64 * 4);
  });
}
