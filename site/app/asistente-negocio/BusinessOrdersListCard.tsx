'use client';

export type OrdersListRow = {
  id: string;
  shortId: string;
  estado: string;
  total: number | null;
  currency: string;
  customerName: string | null;
  customerPhone: string | null;
  whenLabel: string;
};

export type OrdersListData = {
  title: string;
  filter: 'all' | 'pending' | 'today';
  currency: string;
  orders: OrdersListRow[];
};

function money(total: number | null, currency: string): string {
  if (total == null || !Number.isFinite(total)) return '—';
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: code === 'BS' ? 'VES' : code,
      maximumFractionDigits: 2,
    }).format(total);
  } catch {
    return `${total} ${code}`;
  }
}

function statusTone(estado: string): string {
  const e = estado.toLowerCase();
  if (e === 'pendiente') return 'bg-amber-500/15 text-amber-600 dark:text-amber-300';
  if (e === 'entregado' || e === 'listo') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (e === 'cancelado') return 'bg-red-500/15 text-red-600 dark:text-red-300';
  return 'bg-[var(--chat-input)] text-[var(--chat-text-muted)]';
}

type Props = {
  data: OrdersListData;
  onAction?: (text: string) => void;
};

export function BusinessOrdersListCard({ data, onAction }: Props) {
  if (!data.orders.length) return null;

  return (
    <div
      className="mt-1.5 w-full max-w-[min(96%,24rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
      data-business-orders-card={data.filter}
    >
      <div className="border-b border-[var(--chat-card-border)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">{data.title}</p>
        <p className="text-[11px] text-[var(--chat-text-muted)]">
          {data.orders.length} pedido{data.orders.length === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="max-h-[22rem] divide-y divide-[var(--chat-card-border)] overflow-y-auto">
        {data.orders.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onAction?.(`detalle pedido ${o.shortId}`)}
              className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-input)]/60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[var(--chat-text)]">
                    {o.customerName || 'Sin nombre'}
                  </p>
                  <p className="text-[11px] text-[var(--chat-text-muted)]">{o.whenLabel}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold tabular-nums text-[var(--chat-text)]">
                    {money(o.total, o.currency || data.currency)}
                  </p>
                  <span
                    className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(
                      o.estado,
                    )}`}
                  >
                    {o.estado}
                  </span>
                </div>
              </div>
              {o.customerPhone ? (
                <p className="text-[11px] text-[var(--chat-text-muted)]">📞 {o.customerPhone}</p>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
