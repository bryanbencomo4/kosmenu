/**
 * Operational sales day for Elmenuxfa: ends at 20:00 America/Caracas.
 * Caracas is UTC−4 year-round (no DST). Business day labeled calendar date D
 * covers [D−1 20:00, D 20:00) Caracas wall time.
 */

export const ADMIN_BUSINESS_DAY_END_HOUR_CARACAS = 20;
const CARACAS_OFFSET_MS = -4 * 60 * 60 * 1000;

/** Caracas wall-clock components derived from an absolute instant. */
export function adminCaracasParts(instant: Date) {
  const wall = new Date(instant.getTime() + CARACAS_OFFSET_MS);
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth(),
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
    ms: wall.getUTCMilliseconds(),
  };
}

/** Absolute instant when Caracas wall clock is y-m-d hour:00. */
export function adminCaracasWallToDate(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
): Date {
  // Caracas = UTC−4 ⇒ UTC = Caracas + 4h.
  return new Date(Date.UTC(year, monthIndex, day, hour) - CARACAS_OFFSET_MS);
}

export function adminBusinessDayEndExclusive(instant: Date): Date {
  const wall = adminCaracasParts(instant);
  if (wall.hour >= ADMIN_BUSINESS_DAY_END_HOUR_CARACAS) {
    const next = new Date(Date.UTC(wall.year, wall.month, wall.day));
    next.setUTCDate(next.getUTCDate() + 1);
    return adminCaracasWallToDate(
      next.getUTCFullYear(),
      next.getUTCMonth(),
      next.getUTCDate(),
      ADMIN_BUSINESS_DAY_END_HOUR_CARACAS,
    );
  }
  return adminCaracasWallToDate(
    wall.year,
    wall.month,
    wall.day,
    ADMIN_BUSINESS_DAY_END_HOUR_CARACAS,
  );
}

export function adminBusinessDayStart(instant: Date): Date {
  return new Date(adminBusinessDayEndExclusive(instant).getTime() - 24 * 60 * 60 * 1000);
}

/** Caracas calendar date that labels the business day containing [instant]. */
export function adminBusinessDayLabelDate(instant: Date): Date {
  const end = adminBusinessDayEndExclusive(instant);
  const wall = adminCaracasParts(new Date(end.getTime() - 1));
  return new Date(Date.UTC(wall.year, wall.month, wall.day));
}

export function adminBusinessDayStartForLabel(label: Date): Date {
  const end = adminCaracasWallToDate(
    label.getUTCFullYear(),
    label.getUTCMonth(),
    label.getUTCDate(),
    ADMIN_BUSINESS_DAY_END_HOUR_CARACAS,
  );
  return new Date(end.getTime() - 24 * 60 * 60 * 1000);
}

export function adminBusinessDayEndForLabel(label: Date): Date {
  return adminCaracasWallToDate(
    label.getUTCFullYear(),
    label.getUTCMonth(),
    label.getUTCDate(),
    ADMIN_BUSINESS_DAY_END_HOUR_CARACAS,
  );
}

export function adminTodayBusinessWindow(now = new Date()) {
  const endExclusive = adminBusinessDayEndExclusive(now);
  return {
    startInclusive: new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000),
    endExclusive,
  };
}
