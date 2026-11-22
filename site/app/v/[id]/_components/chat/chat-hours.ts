import {
  listBusinessScheduleDayRows,
  resolveBusinessScheduleStatus,
  type BusinessScheduleDayRow,
  type BusinessScheduleStatus,
} from '../../../../api/_lib/business-hours';

export type ChatHoursSnapshot = {
  status: BusinessScheduleStatus;
  days: BusinessScheduleDayRow[];
};

/** "horario", "a qué hora abren", "están abiertos", "cierran"… */
export const HOURS_INTENT_RE =
  /\b(horario|horarios|estan abiertos?|esta abierto|abren|cierran|a que hora|que hora(s)? (abren|cierran|atienden)|cuando abren|cuando cierran|abierto (hoy|ahora)|cerrado (hoy|ahora))\b/i;

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchHoursIntent(text: string | null | undefined): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return false;
  const norm = fold(raw);
  if (!norm) return false;
  if (norm.split(' ').length > 14) return false;
  return HOURS_INTENT_RE.test(norm);
}

export function buildChatHoursSnapshot(
  raw: unknown,
  now = new Date(),
): ChatHoursSnapshot | null {
  const status = resolveBusinessScheduleStatus(raw, now);
  if (!status.configured) return null;
  return {
    status,
    days: listBusinessScheduleDayRows(raw, now),
  };
}

/** Plain-text fallback for Gemini / accessibility. */
export function formatHoursPlainText(snapshot: ChatHoursSnapshot): string {
  const lines = [
    snapshot.status.caption.replace(/^[🟢🔴]\s*/, ''),
    ...snapshot.days.map((d) => {
      const mark = d.isToday ? ' (hoy)' : '';
      return `• ${d.label}${mark}: ${d.hoursLabel}`;
    }),
  ];
  return lines.join('\n');
}
