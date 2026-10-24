import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/utils/phone_national_normalize.dart';

void main() {
  group('nationalDigitsFromStoredPhone', () {
    test('empty and dial-only must not leave 58 in the field', () {
      expect(nationalDigitsFromStoredPhone('', iso: 'VE'), '');
      expect(nationalDigitsFromStoredPhone('+58', iso: 'VE'), '');
      expect(nationalDigitsFromStoredPhone('58', iso: 'VE'), '');
      expect(nationalDigitsFromStoredPhone('+', iso: 'VE'), '');
    });

    test('strips VE dial code from full E.164', () {
      expect(
        nationalDigitsFromStoredPhone('+584140821633', iso: 'VE'),
        '4140821633',
      );
      expect(
        nationalDigitsFromStoredPhone('584140821633', iso: 'VE'),
        '4140821633',
      );
    });

    test('strips trunk zero from 11-digit local', () {
      expect(
        nationalDigitsFromStoredPhone('04140821633', iso: 'VE'),
        '4140821633',
      );
      expect(
        nationalDigitsFromStoredPhone('+5804140821633', iso: 'VE'),
        '4140821633',
      );
    });

    test('keeps already-national numbers', () {
      expect(
        nationalDigitsFromStoredPhone('4140821633', iso: 'VE'),
        '4140821633',
      );
    });
  });

  test('nationalToE164 skips empty national', () {
    expect(
      nationalToE164(nationalDigits: '', dialCodeDigits: '58'),
      '',
    );
    expect(
      nationalToE164(nationalDigits: '4140821633', dialCodeDigits: '58'),
      '+584140821633',
    );
  });

  test('isPlausibleVeNational', () {
    expect(isPlausibleVeNational('4140821633'), isTrue);
    expect(isPlausibleVeNational('414082163'), isFalse);
    expect(isPlausibleVeNational('+58'), isFalse);
  });

  test('rejects random digits for selected country', () {
    expect(
      isPlausibleNationalForCountry('0061680315', iso: 'VE'),
      isFalse,
    );
    expect(
      isPlausibleNationalForCountry('4140821633', iso: 'VE'),
      isTrue,
    );
    expect(
      isPlausibleNationalForCountry('3001234567', iso: 'CO'),
      isTrue,
    );
    expect(
      isPlausibleNationalForCountry('4140821633', iso: 'CO'),
      isFalse,
    );
    expect(
      phoneValidationMessage(nationalDigits: '0061680315', iso: 'VE'),
      'Número inválido para ese país.',
    );
  });
}
