import 'package:flutter_test/flutter_test.dart';
import 'package:intl_phone_field/phone_number.dart';
import 'package:kosmenu_app/utils/phone_national_normalize.dart';

/// Regression: Cobros crashed with `Instance of 'minified:…'` because
/// `PhoneNumber.isValidNumber()` throws bare Exception subclasses and that
/// path ran during build while counting configured payment methods.
void main() {
  test('intl_phone_field throws Instance-of exceptions for long VE trunk zeros',
      () {
    expect(
      () => PhoneNumber(
        countryISOCode: 'VE',
        countryCode: '+58',
        number: '04247314128',
      ).isValidNumber(),
      throwsA(
        predicate(
          (Object e) =>
              Error.safeToString(e).startsWith("Instance of ") &&
              e is Exception,
        ),
      ),
    );
  });

  test('Edw Burguer payment phones are plausible after normalize', () {
    final nequi = normalizeNationalPhoneDigits('3004211251', iso: 'CO');
    final pagoMovil = normalizeNationalPhoneDigits('0424 7314128', iso: 'VE');

    expect(isPlausibleNationalForCountry(nequi, iso: 'CO'), isTrue);
    expect(isPlausibleNationalForCountry(pagoMovil, iso: 'VE'), isTrue);
    expect(
      {'VE', 'CO'}.any((iso) => isPlausibleNationalForCountry(nequi, iso: iso)),
      isTrue,
    );
  });
}
