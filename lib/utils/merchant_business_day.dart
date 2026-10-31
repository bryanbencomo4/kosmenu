/// Operational sales day for Elmenuxfa: ends at 20:00 America/Caracas.
///
/// Caracas is UTC−4 year-round (no DST). A business day labeled calendar date D
/// covers `[D−1 20:00, D 20:00)` Caracas wall time.
library;

const int kMerchantBusinessDayEndHourCaracas = 20;
const Duration kCaracasOffsetFromUtc = Duration(hours: -4);

/// Caracas wall-clock as a UTC-marked DateTime (read .hour/.day as Caracas).
DateTime _caracasWall(DateTime instant) =>
    instant.toUtc().add(kCaracasOffsetFromUtc);

/// Instant (UTC-based DateTime) when Caracas wall clock is [y-m-d hour:00].
DateTime caracasWallToInstant(int year, int month, int day, int hour) {
  // Caracas = UTC−4 ⇒ UTC = Caracas + 4h.
  return DateTime.utc(year, month, day, hour).subtract(kCaracasOffsetFromUtc);
}

/// Exclusive end of the business day that contains [instant].
DateTime merchantBusinessDayEndExclusive(DateTime instant) {
  final wall = _caracasWall(instant);
  if (wall.hour >= kMerchantBusinessDayEndHourCaracas) {
    // After/at 20:00 → current business day ends tomorrow 20:00 Caracas.
    final next = DateTime.utc(wall.year, wall.month, wall.day).add(
      const Duration(days: 1),
    );
    return caracasWallToInstant(
      next.year,
      next.month,
      next.day,
      kMerchantBusinessDayEndHourCaracas,
    );
  }
  return caracasWallToInstant(
    wall.year,
    wall.month,
    wall.day,
    kMerchantBusinessDayEndHourCaracas,
  );
}

/// Inclusive start of the business day that contains [instant].
DateTime merchantBusinessDayStart(DateTime instant) {
  return merchantBusinessDayEndExclusive(instant).subtract(
    const Duration(days: 1),
  );
}

/// Calendar date (y-m-d, Caracas) used to label the business day of [instant].
/// Equals the Caracas calendar date of the exclusive end (the day that "closes"
/// at 20:00).
DateTime merchantBusinessDayLabelDate(DateTime instant) {
  final end = merchantBusinessDayEndExclusive(instant);
  final wall = _caracasWall(end.subtract(const Duration(milliseconds: 1)));
  return DateTime(wall.year, wall.month, wall.day);
}

/// Start of the business day that ends at the next 20:00 Caracas on/after
/// [labelDate]'s calendar close — i.e. label D ⇒ [D−1 20:00, D 20:00).
DateTime merchantBusinessDayStartForLabel(DateTime labelDate) {
  final end = caracasWallToInstant(
    labelDate.year,
    labelDate.month,
    labelDate.day,
    kMerchantBusinessDayEndHourCaracas,
  );
  return end.subtract(const Duration(days: 1));
}

DateTime merchantBusinessDayEndForLabel(DateTime labelDate) {
  return caracasWallToInstant(
    labelDate.year,
    labelDate.month,
    labelDate.day,
    kMerchantBusinessDayEndHourCaracas,
  );
}

/// "Today" business-day window relative to [now].
({DateTime startInclusive, DateTime endExclusive}) merchantTodayBusinessWindow([
  DateTime? now,
]) {
  final instant = now ?? DateTime.now();
  final end = merchantBusinessDayEndExclusive(instant);
  return (
    startInclusive: end.subtract(const Duration(days: 1)),
    endExclusive: end,
  );
}
