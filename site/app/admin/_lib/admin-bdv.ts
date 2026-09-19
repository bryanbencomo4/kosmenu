export const BDV_PAYMENT_STATUSES = ['RECEIVED', 'MATCHED', 'CONFIRMED', 'REJECTED', 'ERROR'] as const;

export type BdvPaymentStatus = (typeof BDV_PAYMENT_STATUSES)[number];

export const BDV_EVENT_LABELS: Record<string, string> = {
  hmac_validated: 'Validación HMAC',
  hmac_rejected: 'HMAC rechazado',
  payment_received: 'Recepción del pago',
  matching_found: 'Matching encontrado',
  matching_missed: 'Sin matching',
  activation_completed: 'Activación realizada',
  activation_failed: 'Error de activación',
  admin_reprocess: 'Reproceso administrativo',
  admin_assign: 'Asociación manual',
  admin_reject: 'Rechazo administrativo',
  error: 'Error',
};

export function bdvStatusClassName(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'bg-emerald-100 text-emerald-800';
    case 'MATCHED':
      return 'bg-sky-100 text-sky-800';
    case 'RECEIVED':
      return 'bg-amber-100 text-amber-800';
    case 'REJECTED':
      return 'bg-rose-100 text-rose-800';
    case 'ERROR':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function formatBdvAmount(value: number | string | null | undefined) {
  if (value == null || value === '') return '—';
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
