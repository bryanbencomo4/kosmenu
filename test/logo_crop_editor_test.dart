import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/logo_crop.dart';
import 'package:kosmenu_app/widgets/logo_crop_editor.dart';

/// A portrait PNG, i.e. the shape of a photo straight out of a phone camera,
/// which is what has to fit inside a narrow screen.
Uint8List _portraitPhotoPng() {
  final image = img.Image(width: 300, height: 400, numChannels: 4);
  img.fill(image, color: image.getColor(120, 60, 200, 255));
  return img.encodePng(image);
}

/// A 300x400 PNG, red above y = 200 and blue below it, so a vertical drag
/// visibly changes which band the exported crop lands on.
Uint8List _topBottomPng() {
  final image = img.Image(width: 300, height: 400, numChannels: 4);
  for (var y = 0; y < 400; y++) {
    for (var x = 0; x < 300; x++) {
      if (y < 200) {
        image.setPixelRgba(x, y, 255, 0, 0, 255);
      } else {
        image.setPixelRgba(x, y, 0, 0, 255, 255);
      }
    }
  }
  return img.encodePng(image);
}

/// Tracks the editor future without awaiting it from the test's fake-async
/// zone: the future is created inside [WidgetTester.runAsync], so awaiting it
/// outside would never see it complete.
class _EditorSession {
  bool completed = false;
  LogoCropResult? result;
}

void main() {
  Future<_EditorSession> openEditor(
    WidgetTester tester,
    Uint8List sourceBytes,
  ) async {
    late BuildContext capturedContext;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            capturedContext = context;
            return const SizedBox.expand();
          },
        ),
      ),
    );

    final session = _EditorSession();
    await tester.runAsync(() async {
      showLogoCropEditor(capturedContext, sourceBytes: sourceBytes).then((
        value,
      ) {
        session
          ..completed = true
          ..result = value;
      });
      // Let the decode finish so the dialog route gets pushed.
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pumpAndSettle();

    return session;
  }

  /// Gives the real async zone a chance to deliver the dialog's result.
  Future<void> drainRealAsync(WidgetTester tester) async {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
  }

  testWidgets('el editor cabe en una pantalla de telefono angosta', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await openEditor(tester, _portraitPhotoPng());

    expect(find.text('Ajusta tu logo'), findsOneWidget);
    expect(find.text('Usar foto'), findsOneWidget);
    expect(find.byType(Slider), findsOneWidget);
    expect(tester.takeException(), isNull);

    // El visor cuadrado debe caber dentro del dialogo.
    final viewport = tester.getSize(find.byKey(logoCropViewportKey));
    expect(viewport.width, viewport.height);
    expect(viewport.width, lessThanOrEqualTo(320));
  });

  testWidgets('el editor cabe con una escala de texto grande', (tester) async {
    tester.view.physicalSize = const Size(360, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    late BuildContext capturedContext;
    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Builder(
            builder: (context) {
              capturedContext = context;
              return const SizedBox.expand();
            },
          ),
        ),
      ),
    );

    await tester.runAsync(() async {
      showLogoCropEditor(capturedContext, sourceBytes: _portraitPhotoPng());
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await tester.pumpAndSettle();

    expect(find.text('Usar foto'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cancelar cierra el editor sin devolver imagen', (tester) async {
    final session = await openEditor(tester, _portraitPhotoPng());

    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    await drainRealAsync(tester);

    expect(session.completed, isTrue);
    expect(session.result, isNull);
    expect(find.text('Ajusta tu logo'), findsNothing);
  });

  testWidgets('arrastrar dentro del visor no lanza excepciones', (
    tester,
  ) async {
    await openEditor(tester, _portraitPhotoPng());

    await tester.drag(
      find.byKey(logoCropViewportKey),
      const Offset(-40, -30),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Ajusta tu logo'), findsOneWidget);
  });

  testWidgets('el editor exporta una imagen al confirmar', (tester) async {
    final session = await openEditor(tester, _portraitPhotoPng());

    await tester.tap(find.text('Usar foto'));
    await tester.pump();
    // Rasterizar y codificar es trabajo asincrono real.
    await drainRealAsync(tester);
    await tester.pumpAndSettle();
    await drainRealAsync(tester);

    expect(session.completed, isTrue);
    expect(session.result, isNotNull);
    expect(img.decodeImage(session.result!.bytes), isNotNull);
  });

  group('lo que se arrastra es lo que se exporta', () {
    /// Confirms the editor and returns the exported logo.
    Future<img.Image> exportAfter(
      WidgetTester tester,
      Future<void> Function() interact,
    ) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final session = await openEditor(tester, _topBottomPng());
      await interact();

      await tester.tap(find.text('Usar foto'));
      await tester.pump();
      await drainRealAsync(tester);
      await tester.pumpAndSettle();
      await drainRealAsync(tester);

      return img.decodeImage(session.result!.bytes)!;
    }

    testWidgets('sin arrastrar, el borde rojo/azul queda centrado', (
      tester,
    ) async {
      final exported = await exportAfter(tester, () async {});

      // El recorte por defecto va de y = 50 a y = 350, asi que y = 170 del
      // resultado cae en la banda azul (y = 220 del original).
      expect(exported.getPixel(150, 170).b, greaterThan(200));
      expect(exported.getPixel(150, 170).r, lessThan(60));
    });

    testWidgets('arrastrar hacia abajo trae la banda roja al recorte', (
      tester,
    ) async {
      final exported = await exportAfter(tester, () async {
        // Mas alla del limite: debe recortarse al maximo desplazamiento.
        await tester.drag(
          find.byKey(logoCropViewportKey),
          const Offset(0, 60),
        );
        await tester.pumpAndSettle();
      });

      // Ahora el recorte arranca en y = 0, asi que y = 170 sigue siendo rojo.
      expect(exported.getPixel(150, 170).r, greaterThan(200));
      expect(exported.getPixel(150, 170).b, lessThan(60));
    });
  });
}
