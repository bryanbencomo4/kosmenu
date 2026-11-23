import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/utils/polygon_geometry.dart';

void main() {
  test('detects overlapping rectangles', () {
    final a = [
      [0.0, 0.0],
      [0.0, 2.0],
      [2.0, 2.0],
      [2.0, 0.0],
    ];
    final b = [
      [1.0, 1.0],
      [1.0, 3.0],
      [3.0, 3.0],
      [3.0, 1.0],
    ];
    expect(polygonsOverlap(a, b), isTrue);
  });

  test('separate polygons do not overlap', () {
    final a = [
      [0.0, 0.0],
      [0.0, 1.0],
      [1.0, 1.0],
      [1.0, 0.0],
    ];
    final b = [
      [2.0, 2.0],
      [2.0, 3.0],
      [3.0, 3.0],
      [3.0, 2.0],
    ];
    expect(polygonsOverlap(a, b), isFalse);
  });
}
