const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

export function formatRelativeOrderTime(value: string | null | undefined, now = new Date()) {
  if (!value) return '';
  const createdAt = new Date(value);
  if (!Number.isFinite(createdAt.getTime())) return '';

  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return 'ahora';
  if (elapsedMinutes < 60) return `hace ${elapsedMinutes} min`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `hace ${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `hace ${elapsedDays} día${elapsedDays === 1 ? '' : 's'}`;
  }

  return `desde el ${WEEKDAYS[createdAt.getDay()]}`;
}
