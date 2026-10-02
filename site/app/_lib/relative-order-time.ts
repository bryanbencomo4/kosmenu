const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

export function formatRelativeOrderTime(value: string | null | undefined, now = new Date()) {
  if (!value) return '';
  const createdAt = new Date(value);
  if (!Number.isFinite(createdAt.getTime())) return '';
  const elapsedMs = Math.max(0, now.getTime() - createdAt.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days === 1 ? '' : 's'}`;
  return `desde el ${WEEKDAYS[createdAt.getDay()]}`;
}