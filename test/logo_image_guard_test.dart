import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/services/logo_image_guard.dart';

void main() {
  group('isHeicOrHeifLogo', () {
    test('Caso 1: HEIC por extension con MIME vacio -> rechazado', () {
      final rejected = isHeicOrHeifLogo(fileName: 'logo.heic', mimeType: '');
      expect(rejected, isTrue);
    });

    test('Caso 2: HEIF por MIME con nombre .jpg -> rechazado', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'image/heif',
      );
      expect(rejected, isTrue);
    });

    test('Caso 3: JPG compatible -> permitido', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'image/jpeg',
      );
      expect(rejected, isFalse);
    });

    test('Caso 4: PNG con MIME vacio -> permitido (no se rechaza solo '
        'por MIME vacio)', () {
      final rejected = isHeicOrHeifLogo(fileName: 'logo.png', mimeType: '');
      expect(rejected, isFalse);
    });

    test('MIME nulo se trata igual que MIME vacio', () {
      final rejected = isHeicOrHeifLogo(fileName: 'logo.webp', mimeType: null);
      expect(rejected, isFalse);
    });

    test('WEBP con MIME correcto -> permitido', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.webp',
        mimeType: 'image/webp',
      );
      expect(rejected, isFalse);
    });

    test('JPEG (extension larga) con MIME correcto -> permitido', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpeg',
        mimeType: 'image/jpeg',
      );
      expect(rejected, isFalse);
    });

    test('Caso adicional: .HEIC en mayusculas -> rechazado '
        '(case-insensitive)', () {
      final rejected = isHeicOrHeifLogo(fileName: 'logo.HEIC', mimeType: '');
      expect(rejected, isTrue);
    });

    test('Caso adicional: MIME en mayusculas -> rechazado '
        '(case-insensitive)', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'IMAGE/HEIC',
      );
      expect(rejected, isTrue);
    });

    test('Caso adicional: image/heic-sequence -> rechazado', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'image/heic-sequence',
      );
      expect(rejected, isTrue);
    });

    test('Caso adicional: image/heif-sequence -> rechazado', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.png',
        mimeType: 'image/heif-sequence',
      );
      expect(rejected, isTrue);
    });

    test('Caso adicional: MIME con espacios y parametros -> normalizado y '
        'rechazado', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.heic',
        mimeType: '  image/heic; encoding=utf-8  ',
      );
      expect(rejected, isTrue);
    });

    test('Caso adicional: MIME con parametros pero formato compatible -> '
        'permitido', () {
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'image/jpeg; charset=binary',
      );
      expect(rejected, isFalse);
    });

    test('Caso adicional: mismatch entre MIME y extension invoca '
        'onFormatMismatch y aun asi rechaza', () {
      final messages = <String>[];
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'image/heic',
        onFormatMismatch: messages.add,
      );

      expect(rejected, isTrue);
      expect(messages, hasLength(1));
      expect(messages.single, contains('mismatch'));
    });

    test('Caso adicional: sin mismatch no se invoca onFormatMismatch', () {
      final messages = <String>[];
      final rejected = isHeicOrHeifLogo(
        fileName: 'logo.jpg',
        mimeType: 'image/jpeg',
        onFormatMismatch: messages.add,
      );

      expect(rejected, isFalse);
      expect(messages, isEmpty);
    });
  });

  group('classifyCroppedPath', () {
    test('Caso 5: el cropper devuelve null -> se interpreta como cancelacion, '
        'no como error', () {
      final outcome = classifyCroppedPath(null);
      expect(outcome, isA<LogoEditCancelled>());
      expect(outcome, isNot(isA<LogoEditFailure>()));
    });

    test('Ruta vacia (o solo espacios) se interpreta como fallo, nunca como '
        'cancelacion', () {
      final outcomeEmpty = classifyCroppedPath('');
      final outcomeBlank = classifyCroppedPath('   ');

      expect(outcomeEmpty, isA<LogoEditFailure>());
      expect(outcomeBlank, isA<LogoEditFailure>());
    });

    test(
      'Caso 7: el cropper devuelve una ruta valida -> exito con esa ruta',
      () {
        final outcome = classifyCroppedPath('  /tmp/logo_cropped.jpg  ');

        expect(outcome, isA<LogoEditSuccess>());
        expect((outcome as LogoEditSuccess).path, '/tmp/logo_cropped.jpg');
      },
    );
  });

  group('LogoEditOutcome (resultado tipado)', () {
    test('Caso 6: un error real (excepcion) queda tipado como fallo y es '
        'distinguible de una cancelacion voluntaria', () {
      final error = Exception('boom');
      final stackTrace = StackTrace.current;
      final outcome = LogoEditFailure(error, stackTrace);

      final isTreatedAsError = switch (outcome) {
        LogoEditCancelled() => false,
        LogoEditSuccess() => false,
        LogoEditFailure() => true,
      };

      expect(isTreatedAsError, isTrue);
      expect(outcome.error, error);
      expect(outcome.stackTrace, stackTrace);
    });

    test('success/cancelled/failure son mutuamente excluyentes ante un switch '
        'exhaustivo', () {
      String describe(LogoEditOutcome outcome) => switch (outcome) {
        LogoEditSuccess(:final path) => 'success:$path',
        LogoEditCancelled() => 'cancelled',
        LogoEditFailure() => 'failure',
      };

      expect(describe(const LogoEditSuccess('a.jpg')), 'success:a.jpg');
      expect(describe(const LogoEditCancelled()), 'cancelled');
      expect(
        describe(LogoEditFailure(Exception('x'), StackTrace.current)),
        'failure',
      );
    });
  });
}
