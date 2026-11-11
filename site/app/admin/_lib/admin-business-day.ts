/**
 * Sales day for Elmenuxfa: America/Caracas calendar day (midnight → midnight).
 * Caracas is UTC−4 year-round (no DST). Day labeled D covers
 * [D 00:00, D+1 00:00) Caracas wall time.
 *
 * Night orders stay on the same day. The next day only starts at midnight
 * Caracas — it is not opened early (e.g. at 20:00).
 */

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

export function adminBusinessDayStart(instant: Date): Date {
  const wall = adminCaracasParts(instant);
  return adminCaracasWallToDate(wall.year, wall.month, wall.day, 0);
}

export function adminBusinessDayEndExclusive(instant: Date): Date {
  return new Date(adminBusinessDayStart(instant).getTime() + 24 * 60 * 60 * 1000);
}

/** Caracas calendar date that labels the day containing [instant]. */
export function adminBusinessDayLabelDate(instant: Date): Date {
  const wall = adminCaracasParts(instant);
  return new Date(Date.UTC(wall.year, wall.month, wall.day));
}

export function adminBusinessDayStartForLabel(label: Date): Date {
  return adminCaracasWallToDate(
    label.getUTCFullYear(),
    label.getUTCMonth(),
    label.getUTCDate(),
    0,
  );
}

export function adminBusinessDayEndForLabel(label: Date): Date {
  return new Date(adminBusinessDayStartForLabel(label).getTime() + 24 * 60 * 60 * 1000);
}

export function adminTodayBusinessWindow(now = new Date()) {
  const startInclusive = adminBusinessDayStart(now);
  return {
    startInclusive,
    endExclusive: new Date(startInclusive.getTime() + 24 * 60 * 60 * 1000),
  };
}

/** @deprecated Kept for imports that still reference the old 20:00 constant. */
export const ADMIN_BUSINESS_DAY_END_HOUR_CARACAS = 0;
