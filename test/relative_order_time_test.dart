import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/core/relative_order_time.dart';

void main() {
  final now = DateTime(2026, 10, 1, 12);

  test('formats recent order times conversationally', () {
    expect(formatRelativeOrderTime(now, now: now), 'ahora');
    expect(
      formatRelativeOrderTime(
        now.subtract(const Duration(minutes: 1)),
        now: now,
      ),
      'hace 1 min',
    );
    expect(
      formatRelativeOrderTime(now.subtract(const Duration(hours: 1)), now: now),
      'hace 1h',
    );
  });

  test('formats days and weekday for older orders', () {
    expect(
      formatRelativeOrderTime(now.subtract(const Duration(days: 2)), now: now),
      'hace 2 días',
    );
    expect(
      formatRelativeOrderTime(now.subtract(const Duration(days: 8)), now: now),
      'desde el miércoles',
    );
  });

  test('handles missing timestamps', () {
    expect(formatRelativeOrderTime(null, now: now), 'hora no disponible');
  });
}
