import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/utils/merchant_business_day.dart';

void main() {
  test('before 20:00 Caracas stays on same calendar label day', () {
    // 15:00 Caracas = 19:00 UTC
    final instant = DateTime.utc(2026, 10, 31, 19, 0);
    final start = merchantBusinessDayStart(instant);
    final end = merchantBusinessDayEndExclusive(instant);
    final label = merchantBusinessDayLabelDate(instant);

    expect(label, DateTime(2026, 10, 31));
    expect(start, DateTime.utc(2026, 10, 31)); // Oct 30 20:00 Caracas = Oct 31 00:00 UTC
    expect(end, DateTime.utc(2026, 11, 1)); // Oct 31 20:00 Caracas = Nov 1 00:00 UTC
  });

  test('at/after 20:00 Caracas rolls into next business day', () {
    // 20:30 Caracas = 00:30 UTC next day
    final instant = DateTime.utc(2026, 11, 1, 0, 30);
    final label = merchantBusinessDayLabelDate(instant);
    expect(label, DateTime(2026, 11, 1));
    expect(
      merchantBusinessDayStart(instant),
      DateTime.utc(2026, 11, 1),
    );
    expect(
      merchantBusinessDayEndExclusive(instant),
      DateTime.utc(2026, 11, 2),
    );
  });

  test('label helpers align with 20:00 Caracas close', () {
    final label = DateTime(2026, 10, 31);
    expect(
      merchantBusinessDayStartForLabel(label),
      DateTime.utc(2026, 10, 31),
    );
    expect(
      merchantBusinessDayEndForLabel(label),
      DateTime.utc(2026, 11, 1),
    );
  });
}
