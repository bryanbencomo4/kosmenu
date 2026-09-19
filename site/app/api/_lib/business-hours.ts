export type BusinessHoursRange = {
  start: string;
  end: string;
};

export type BusinessDaySchedule = {
  open: boolean;
  ranges: BusinessHoursRange[];
};

export type BusinessSchedule = {
  timezone: string;
  days: Record<string, BusinessDaySchedule>;
};

export type BusinessScheduleStatus = {
  configured: boolean;
  isOpen: boolean;
  nextOpenLabel: string | null;
  closesAtLabel: string | null;
  caption: string;
};

const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  monday: 'lunes',
  tuesday: 'martes',
  wednesday: 'miércoles',
  thursday: 'jueves',
  friday: 'viernes',
  saturday: 'sábado',
  sunday: 'domingo',
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return 0;
  const hour = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const minute = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return hour * 60 + minute;
}

function formatHour(hm: string) {
  const minutes = parseMinutes(hm);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${hour12}:00 ${suffix}` : `${hour12}:${pad(minute)} ${suffix}`;
}

function caracasParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, (typeof DAY_KEYS)[number]> = {
    Mon: 'monday',
    Tue: 'tuesday',
    Wed: 'wednesday',
    Thu: 'thursday',
    Fri: 'friday',
    Sat: 'saturday',
    Sun: 'sunday',
  };
  return {
    key: weekdayMap[map.weekday ?? 'Mon'] ?? 'monday',
    hour: Number(map.hour ?? 0),
    minute: Number(map.minute ?? 0),
  };
}

function parseDay(raw: unknown): BusinessDaySchedule {
  if (!raw || typeof raw !== 'object') {
    return { open: false, ranges: [] };
  }
  const row = raw as Record<string, unknown>;
  const ranges = Array.isArray(row.ranges)
    ? row.ranges
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const range = item as Record<string, unknown>;
          return {
            start: String(range.start ?? '08:00'),
            end: String(range.end ?? '22:00'),
          };
        })
        .filter((item): item is BusinessHoursRange => Boolean(item))
    : [];
  return { open: row.open === true && ranges.length > 0, ranges };
}

export function parseBusinessSchedule(raw: unknown): BusinessSchedule {
  const map = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const daysRaw = map.days && typeof map.days === 'object' ? (map.days as Record<string, unknown>) : {};
  const days = Object.fromEntries(
    DAY_KEYS.map((key) => [key, parseDay(daysRaw[key])]),
  ) as Record<string, BusinessDaySchedule>;
  return {
    timezone: String(map.timezone ?? 'America/Caracas'),
    days,
  };
}

export function isScheduleConfigured(schedule: BusinessSchedule) {
  return DAY_KEYS.some((key) => schedule.days[key]?.open && schedule.days[key].ranges.length > 0);
}

function nextOpenLabel(schedule: BusinessSchedule, now = new Date()): string | null {
  const current = caracasParts(now);
  const startIndex = DAY_KEYS.indexOf(current.key);
  for (let offset = 0; offset < 7; offset += 1) {
    const key = DAY_KEYS[(startIndex + offset) % 7];
    const day = schedule.days[key];
    if (!day?.open || day.ranges.length === 0) continue;
    const ranges = [...day.ranges].sort((a, b) => parseMinutes(a.start) - parseMinutes(b.start));
    const nowMinutes = current.hour * 60 + current.minute;
    for (const range of ranges) {
      if (offset === 0 && parseMinutes(range.start) <= nowMinutes) continue;
      const when = formatHour(range.start);
      if (offset === 0) return `hoy a las ${when}`;
      if (offset === 1) return `mañana a las ${when}`;
      return `${DAY_LABELS[key]} a las ${when}`;
    }
  }
  return null;
}

export function resolveBusinessScheduleStatus(
  raw: unknown,
  now = new Date(),
): BusinessScheduleStatus {
  const schedule = parseBusinessSchedule(raw);
  if (!isScheduleConfigured(schedule)) {
    return {
      configured: false,
      isOpen: false,
      nextOpenLabel: null,
      closesAtLabel: null,
      caption: 'Horario no configurado',
    };
  }
  const current = caracasParts(now);
  const today = schedule.days[current.key];
  const minutes = current.hour * 60 + current.minute;
  if (today?.open) {
    for (const range of today.ranges) {
      const start = parseMinutes(range.start);
      const end = parseMinutes(range.end);
      const inside = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
      if (inside) {
        const allDay = start === 0 && end >= 23 * 60 + 59;
        return {
          configured: true,
          isOpen: true,
          nextOpenLabel: null,
          closesAtLabel: allDay ? '24 horas' : formatHour(range.end),
          caption: allDay
            ? '🟢 Abierto las 24 horas'
            : `🟢 Abierto hasta las ${formatHour(range.end)}`,
        };
      }
    }
  }
  const next = nextOpenLabel(schedule, now);
  return {
    configured: true,
    isOpen: false,
    nextOpenLabel: next,
    closesAtLabel: null,
    caption: next ? `🔴 Cerrado. Abrimos ${next}` : '🔴 Cerrado',
  };
}

export const BUSINESS_CLOSED_ERROR = 'BUSINESS_CLOSED';
export const BUSINESS_CLOSED_MESSAGE =
  'El restaurante está cerrado actualmente';

export type BusinessOrderingDecision =
  | { allowed: true }
  | { allowed: false; error: typeof BUSINESS_CLOSED_ERROR; message: string };

export function evaluateBusinessOrdering(input: {
  enLinea?: boolean | null;
  horarios?: unknown;
  now?: Date;
}): BusinessOrderingDecision {
  if (input.enLinea === false) {
    return {
      allowed: false,
      error: BUSINESS_CLOSED_ERROR,
      message: BUSINESS_CLOSED_MESSAGE,
    };
  }
  const status = resolveBusinessScheduleStatus(input.horarios, input.now);
  if (status.configured && !status.isOpen) {
    return {
      allowed: false,
      error: BUSINESS_CLOSED_ERROR,
      message: BUSINESS_CLOSED_MESSAGE,
    };
  }
  return { allowed: true };
}

export function detectMenuDevice(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

export function detectMenuOrigin(search: string, referrer: string) {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const src = (params.get('src') || params.get('utm_source') || '').trim().toLowerCase();
  if (src === 'qr' || src === 'qr_code') return 'qr';
  if (referrer.trim()) {
    try {
      return new URL(referrer).host || 'referral';
    } catch {
      return 'referral';
    }
  }
  return 'direct';
}
