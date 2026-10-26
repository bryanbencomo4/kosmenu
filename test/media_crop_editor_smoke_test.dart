import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kosmenu_app/services/media_crop.dart';
import 'package:kosmenu_app/widgets/media_crop_editor.dart';

Uint8List _pngBytes({required int width, required int height}) {
  final image = img.Image(width: width, height: height, numChannels: 4);
  img.fill(image, color: image.getColor(40, 120, 200, 255));
  return Uint8List.fromList(img.encodePng(image));
}

class _EditorSession {
  bool completed = false;
  MediaCropResult? result;
}

Future<_EditorSession> _openEditor(
  WidgetTester tester, {
  required Uint8List sourceBytes,
  required MediaCropKind kind,
}) async {
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
    showMediaCropEditor(
      capturedContext,
      sourceBytes: sourceBytes,
      kind: kind,
    ).then((value) {
      session
        ..completed = true
        ..result = value;
    });
    await Future<void>.delayed(const Duration(milliseconds: 50));
  });
  await tester.pumpAndSettle();
  return session;
}

Future<void> _drainRealAsync(WidgetTester tester) async {
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await tester.pump();
}

void main() {
  testWidgets('media crop editor opens and can cancel', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final session = await _openEditor(
      tester,
      sourceBytes: _pngBytes(width: 900, height: 600),
      kind: MediaCropKind.product,
    );

    expect(find.text('Ajusta la foto del producto'), findsOneWidget);
    expect(find.byKey(mediaCropViewportKey), findsOneWidget);
    expect(find.text('Usar foto'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    await _drainRealAsync(tester);

    expect(find.text('Ajusta la foto del producto'), findsNothing);
    expect(session.completed, isTrue);
    expect(session.result, isNull);
  });

  testWidgets('media crop editor confirms 3:4 jpeg', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final session = await _openEditor(
      tester,
      sourceBytes: _pngBytes(width: 300, height: 400),
      kind: MediaCropKind.category,
    );

    expect(find.text('Ajusta la portada'), findsOneWidget);

    await tester.tap(find.text('Usar foto'));
    await tester.pump();
    await _drainRealAsync(tester);
    // Avoid pumpAndSettle while CircularProgressIndicator animates.
    for (var i = 0; i < 40 && !session.completed; i++) {
      await _drainRealAsync(tester);
    }

    expect(tester.takeException(), isNull);
    expect(session.completed, isTrue);
    expect(session.result, isNotNull);
    expect(session.result!.mimeType, 'image/jpeg');
    expect(session.result!.bytes.length, greaterThan(100));

    final decoded = img.decodeJpg(session.result!.bytes);
    expect(decoded, isNotNull);
    expect(decoded!.width / decoded.height, closeTo(3 / 4, 0.05));
  });
}
