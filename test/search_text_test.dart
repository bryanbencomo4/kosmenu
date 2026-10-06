import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/search_text.dart';

void main() {
  test('accented and plain letters match in search', () {
    final folded = foldSearchText('Jamón Selvanegra');
    expect(folded.contains(foldSearchText('jamon')), isTrue);
    expect(folded.contains(foldSearchText('jamón')), isTrue);
    expect(foldSearchText('PizZá El Trueno'), 'pizza el trueno');
    expect(foldSearchText('Niño').contains(foldSearchText('nino')), isTrue);
    expect(foldSearchText('jamo\u0301n'), foldSearchText('jamon'));
  });
}
