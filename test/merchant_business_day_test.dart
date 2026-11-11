import 'package:flutter_test/flutter_test.dart';
import 'package:kosmenu_app/utils/merchant_business_day.dart';

void main() {
  test('afternoon Caracas stays on same calendar day', () {
    // 15:00 Caracas = 19:00 UTC
    final instant = DateTime.utc(2026, 10, 31, 19, 0);
    final start = merchantBusinessDayStart(instant);
    final end = merchantBusinessDayEndExclusive(instant);
    final label = merchantBusinessDayLabelDate(instant);

    expect(label, DateTime.utc(2026, 10, 31));
    // Oct 31 00:00 Caracas = Oct 31 04:00 UTC
    expect(start, DateTime.utc(2026, 10, 31, 4));
    // Nov 1 00:00 Caracas = Nov 1 04:00 UTC
    expect(end, DateTime.utc(2026, 11, 1, 4));
  });

  test('night Caracas order stays on same day (not next morning)', () {
    // 21:00 Caracas Sat Oct 31 = 01:00 UTC Nov 1
    final instant = DateTime.utc(2026, 11, 1, 1, 0);
    final label = merchantBusinessDayLabelDate(instant);
    expect(label, DateTime.utc(2026, 10, 31));
    expect(caracasWeekdayShort(label), 'Sab');
    expect(
      merchantBusinessDayStart(instant),
      DateTime.utc(2026, 10, 31, 4),
    );
    expect(
      merchantBusinessDayEndExclusive(instant),
      DateTime.utc(2026, 11, 1, 4),
    );
  });

  test('next Caracas day only starts at midnight', () {
    // 00:30 Caracas Nov 1 = 04:30 UTC Nov 1
    final instant = DateTime.utc(2026, 11, 1, 4, 30);
    final label = merchantBusinessDayLabelDate(instant);
    expect(label, DateTime.utc(2026, 11, 1));
    expect(caracasWeekdayShort(label), 'Dom');
    expect(
      merchantBusinessDayStart(instant),
      DateTime.utc(2026, 11, 1, 4),
    );
    expect(
      merchantBusinessDayEndExclusive(instant),
      DateTime.utc(2026, 11, 2, 4),
    );
  });

  test('label helpers align with Caracas midnight', () {
    final label = DateTime(2026, 10, 31);
    expect(
      merchantBusinessDayStartForLabel(label),
      DateTime.utc(2026, 10, 31, 4),
    );
    expect(
      merchantBusinessDayEndForLabel(label),
      DateTime.utc(2026, 11, 1, 4),
    );
  });

  test('weekday short labels follow Caracas calendar date', () {
    expect(caracasWeekdayShort(DateTime.utc(2026, 11, 1)), 'Dom');
    expect(caracasWeekdayShort(DateTime.utc(2026, 10, 31)), 'Sab');
  });
}
