/// Sales day for Elmenuxfa: America/Caracas calendar day (midnight → midnight).
///
/// Caracas is UTC−4 year-round (no DST). A day labeled calendar date D covers
/// `[D 00:00, D+1 00:00)` Caracas wall time.
///
/// Night orders (e.g. 21:00–23:59) stay on the same day. The next day only
/// starts at midnight Caracas — it is not created early at 20:00.
library;

const Duration kCaracasOffsetFromUtc = Duration(hours: -4);

/// Mon..Sun short labels for Caracas calendar weekdays (DateTime.weekday).
const List<String> kCaracasWeekdayShortEs = <String>[
  'Lun',
  'Mar',
  'Mie',
  'Jue',
  'Vie',
  'Sab',
  'Dom',
];

/// Caracas wall-clock as a UTC-marked DateTime (read .hour/.day as Caracas).
DateTime caracasWall(DateTime instant) =>
    instant.toUtc().add(kCaracasOffsetFromUtc);

/// Instant (UTC-based DateTime) when Caracas wall clock is [y-m-d hour:00].
DateTime caracasWallToInstant(int year, int month, int day, int hour) {
  // Caracas = UTC−4 ⇒ UTC = Caracas + 4h.
  return DateTime.utc(year, month, day, hour).subtract(kCaracasOffsetFromUtc);
}

/// Short weekday label (Lun..Dom) for a Caracas calendar y-m-d.
String caracasWeekdayShort(DateTime caracasDate) {
  final weekday = DateTime.utc(
    caracasDate.year,
    caracasDate.month,
    caracasDate.day,
  ).weekday; // 1=Mon .. 7=Sun
  return kCaracasWeekdayShortEs[(weekday - 1).clamp(0, 6)];
}

/// Inclusive start of the Caracas calendar day that contains [instant].
DateTime merchantBusinessDayStart(DateTime instant) {
  final wall = caracasWall(instant);
  return caracasWallToInstant(wall.year, wall.month, wall.day, 0);
}

/// Exclusive end of the Caracas calendar day that contains [instant]
/// (= next Caracas midnight).
DateTime merchantBusinessDayEndExclusive(DateTime instant) {
  final start = merchantBusinessDayStart(instant);
  return start.add(const Duration(days: 1));
}

/// Calendar date (y-m-d, Caracas) that labels the day of [instant].
/// Returned as a UTC date-only value so .year/.month/.day/.weekday are stable
/// regardless of the device timezone.
DateTime merchantBusinessDayLabelDate(DateTime instant) {
  final wall = caracasWall(instant);
  return DateTime.utc(wall.year, wall.month, wall.day);
}

/// Caracas midnight that opens the day labeled [labelDate].
DateTime merchantBusinessDayStartForLabel(DateTime labelDate) {
  return caracasWallToInstant(
    labelDate.year,
    labelDate.month,
    labelDate.day,
    0,
  );
}

/// Caracas midnight that closes the day labeled [labelDate] (exclusive).
DateTime merchantBusinessDayEndForLabel(DateTime labelDate) {
  return merchantBusinessDayStartForLabel(labelDate).add(
    const Duration(days: 1),
  );
}

/// "Today" Caracas calendar window relative to [now].
({DateTime startInclusive, DateTime endExclusive}) merchantTodayBusinessWindow([
  DateTime? now,
]) {
  final instant = now ?? DateTime.now();
  final start = merchantBusinessDayStart(instant);
  return (
    startInclusive: start,
    endExclusive: start.add(const Duration(days: 1)),
  );
}
