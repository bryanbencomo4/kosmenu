import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/venezuela_states.dart';

void main() {
  test('catalog has 24 unique federal entities', () {
    expect(venezuelaStates, hasLength(24));
    expect(
      venezuelaStates.map((state) => state.slug).toSet(),
      hasLength(24),
    );
  });

  test('sanitize keeps known slugs in catalog order', () {
    expect(
      sanitizeVenezuelaStateSlugs(const [
        'miranda',
        'MIRANDA',
        'foo',
        'distrito-capital',
      ]),
      ['distrito-capital', 'miranda'],
    );
  });

  test('format labels for one and many states', () {
    expect(formatVenezuelaOperatingStates(const ['miranda']), 'Miranda');
    expect(
      formatVenezuelaOperatingStates(const ['miranda', 'distrito-capital']),
      'Distrito Capital y Miranda',
    );
  });
}
