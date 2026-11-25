/**
 * Parse natural-language hours into Flutter BusinessSchedule shape:
 * { timezone, days: { monday: { open, ranges: [{start,end}] }, ... } }
 */

export const SCHEDULE_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type ScheduleDayKey = (typeof SCHEDULE_DAY_KEYS)[number];

export type BusinessHoursRange = { start: string; end: string };
export type BusinessDaySchedule = { open: boolean; ranges: BusinessHoursRange[] };
export type FlutterBusinessSchedule = {
  timezone: string;
  days: Record<ScheduleDayKey, BusinessDaySchedule>;
  updatedVia?: string;
  updatedAt?: string;
  sourceText?: string;
};

const DAY_MAP: Record<string, ScheduleDayKey> = {
  lun: 'monday',
  lunes: 'monday',
  mon: 'monday',
  monday: 'monday',
  mar: 'tuesday',
  martes: 'tuesday',
  tue: 'tuesday',
  tuesday: 'tuesday',
  mie: 'wednesday',
  mier: 'wednesday',
  miercoles: 'wednesday',
  miércoles: 'wednesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  jue: 'thursday',
  jueves: 'thursday',
  thu: 'thursday',
  thursday: 'thursday',
  vie: 'friday',
  viernes: 'friday',
  fri: 'friday',
  friday: 'friday',
  sab: 'saturday',
  sabado: 'saturday',
  sábado: 'saturday',
  sat: 'saturday',
  saturday: 'saturday',
  dom: 'sunday',
  domingo: 'sunday',
  sun: 'sunday',
  sunday: 'sunday',
};

const LABELS: Record<ScheduleDayKey, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

function emptyDays(): Record<ScheduleDayKey, BusinessDaySchedule> {
  return {
    monday: { open: false, ranges: [] },
    tuesday: { open: false, ranges: [] },
    wednesday: { open: false, ranges: [] },
    thursday: { open: false, ranges: [] },
    friday: { open: false, ranges: [] },
    saturday: { open: false, ranges: [] },
    sunday: { open: false, ranges: [] },
  };
}

function normHm(h: number, m: number): string {
  const hh = Math.max(0, Math.min(23, h));
  const mm = Math.max(0, Math.min(59, m));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseTimeToken(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\./g, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  const ampm = (m[3] || '').replace(/\./g, '').toLowerCase();
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (ampm.startsWith('p') && h < 12) h += 12;
  if (ampm.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return normHm(h, min);
}

function expandDaySpan(a: ScheduleDayKey, b: ScheduleDayKey): ScheduleDayKey[] {
  const i = SCHEDULE_DAY_KEYS.indexOf(a);
  const j = SCHEDULE_DAY_KEYS.indexOf(b);
  if (i < 0 || j < 0) return [];
  if (i <= j) return SCHEDULE_DAY_KEYS.slice(i, j + 1) as ScheduleDayKey[];
  return [
    ...(SCHEDULE_DAY_KEYS.slice(i) as ScheduleDayKey[]),
    ...(SCHEDULE_DAY_KEYS.slice(0, j + 1) as ScheduleDayKey[]),
  ];
}

function resolveDayToken(tok: string): ScheduleDayKey | null {
  const f = tok
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return DAY_MAP[f] || null;
}

export type ParsedHours =
  | { ok: true; schedule: FlutterBusinessSchedule; summary: string }
  | { ok: false; error: string };

/**
 * Understands patterns like:
 * - "Lun-Vie 11:00-21:00"
 * - "lunes a viernes de 10 a 22"
 * - "todos los días 9:00-18:00"
 * - "sábado 12:00-23:00"
 */
export function parseBusinessHoursText(raw: string): ParsedHours {
  const text = raw.trim();
  if (!text) return { ok: false, error: 'empty' };

  const folded = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Find time range: 11:00-21:00 | 11-21 | 10 a 22 | de 11 a 21
  const rangeMatch =
    folded.match(
      /(?:de\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|a|hasta)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)/i,
    ) || null;
  if (!rangeMatch) {
    return {
      ok: false,
      error:
        'No entendí la hora. Prueba “Lun-Vie 11:00-21:00” o “todos los días 10:00-22:00”.',
    };
  }
  const start = parseTimeToken(rangeMatch[1]!);
  const end = parseTimeToken(rangeMatch[2]!);
  if (!start || !end) {
    return { ok: false, error: 'Hora inválida. Usa formato 11:00-21:00.' };
  }

  let days: ScheduleDayKey[] = [];
  if (/\b(todos\s+los\s+dias|diario|cada\s+dia)\b/.test(folded)) {
    days = [...SCHEDULE_DAY_KEYS];
  } else {
    // Span: lun-vie | lunes a viernes
    const span =
      folded.match(
        /\b(lun(?:es)?|mar(?:tes)?|mie(?:rcoles)?|jue(?:ves)?|vie(?:rnes)?|sab(?:ado)?|dom(?:ingo)?)\s*(?:-|–|—|a)\s*(lun(?:es)?|mar(?:tes)?|mie(?:rcoles)?|jue(?:ves)?|vie(?:rnes)?|sab(?:ado)?|dom(?:ingo)?)\b/,
      ) || null;
    if (span) {
      const a = resolveDayToken(span[1]!);
      const b = resolveDayToken(span[2]!);
      if (a && b) days = expandDaySpan(a, b);
    } else {
      // Listed days
      const found = new Set<ScheduleDayKey>();
      for (const key of Object.keys(DAY_MAP)) {
        const re = new RegExp(`\\b${key}\\b`, 'i');
        if (re.test(folded)) found.add(DAY_MAP[key]!);
      }
      days = SCHEDULE_DAY_KEYS.filter((k) => found.has(k));
    }
  }

  if (!days.length) {
    // Default weekdays if only times given with "horario"
    if (/\bhorario\b/.test(folded)) {
      days = expandDaySpan('monday', 'friday');
    } else {
      return {
        ok: false,
        error:
          'Indica los días, por ejemplo “Lun-Vie 11:00-21:00” o “sábado 12:00-23:00”.',
      };
    }
  }

  const dayMap = emptyDays();
  const range = { start, end };
  for (const d of days) {
    dayMap[d] = { open: true, ranges: [range] };
  }

  const schedule: FlutterBusinessSchedule = {
    timezone: 'America/Caracas',
    days: dayMap,
    updatedVia: 'business_assistant',
    updatedAt: new Date().toISOString(),
    sourceText: text.slice(0, 200),
  };

  const dayLabel =
    days.length === 7
      ? 'Todos los días'
      : days.length === 5 &&
          days[0] === 'monday' &&
          days[days.length - 1] === 'friday'
        ? 'Lun–Vie'
        : days.map((d) => LABELS[d].slice(0, 3)).join(', ');

  return {
    ok: true,
    schedule,
    summary: `${dayLabel} ${start}–${end}`,
  };
}

export function formatFlutterScheduleForChat(schedule: FlutterBusinessSchedule): string {
  const lines: string[] = [];
  for (const key of SCHEDULE_DAY_KEYS) {
    const day = schedule.days[key];
    if (!day?.open || !day.ranges?.length) {
      lines.push(`• ${LABELS[key]}: cerrado`);
      continue;
    }
    const ranges = day.ranges.map((r) => `${r.start}–${r.end}`).join(', ');
    lines.push(`• ${LABELS[key]}: ${ranges}`);
  }
  return lines.join('\n');
}
