/**
 * Order status machine — mirrors Flutter OrderManagerService + _buildStatusActions.
 */

export type CanonicalOrderStatus =
  | 'pendiente'
  | 'confirmado'
  | 'en_camino'
  | 'entregado'
  | 'cancelado';

const TRANSITIONS: Record<CanonicalOrderStatus, CanonicalOrderStatus[]> = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['en_camino', 'cancelado'],
  en_camino: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
};

export function normalizeOrderStatus(estado: string | null | undefined): CanonicalOrderStatus {
  const raw = String(estado || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'pendiente';
  if (raw === 'confirmado' || raw === 'aceptado') return 'confirmado';
  if (
    raw === 'preparando' ||
    raw === 'preparacion' ||
    raw === 'preparación' ||
    raw === 'en_proceso' ||
    raw === 'en proceso' ||
    raw === 'listo'
  ) {
    return 'confirmado';
  }
  if (raw === 'en_camino' || raw === 'en camino' || raw === 'despachado') return 'en_camino';
  if (raw === 'entregado' || raw === 'completado' || raw === 'finalizado') return 'entregado';
  if (raw === 'cancelado' || raw === 'anulado' || raw === 'rechazado') return 'cancelado';
  return 'pendiente';
}

export function parseTargetOrderStatus(text: string): CanonicalOrderStatus | null {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(cancel|anul|rechaz)\w*/.test(t)) return 'cancelado';
  if (/\b(entregad|completad|finaliz)\w*/.test(t)) return 'entregado';
  if (/\b(en\s*camino|despachad\w*|envi[oó]|sali[oó])\b/.test(t)) return 'en_camino';
  if (/\b(confirm|acept|prepar|listo)\w*/.test(t)) return 'confirmado';
  if (/\bpendiente\b/.test(t)) return 'pendiente';
  return null;
}

export function canTransitionOrderStatus(
  from: CanonicalOrderStatus,
  to: CanonicalOrderStatus,
): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export function orderStatusLabel(s: CanonicalOrderStatus): string {
  switch (s) {
    case 'pendiente':
      return 'pendiente';
    case 'confirmado':
      return 'confirmado / en preparación';
    case 'en_camino':
      return 'en camino / despachado';
    case 'entregado':
      return 'entregado';
    case 'cancelado':
      return 'cancelado';
  }
}
