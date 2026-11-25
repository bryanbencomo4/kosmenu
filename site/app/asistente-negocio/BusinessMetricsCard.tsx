'use client';

export type MetricsCardData = {
  title: string;
  currency: string;
  ordersToday: number;
  salesToday: number;
  customersToday: number;
  avgTicket: number | null;
  focus: 'all' | 'sales' | 'customers' | 'orders';
};

function money(amount: number | null, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: code === 'BS' ? 'VES' : code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

type Props = {
  data: MetricsCardData;
  onAction?: (text: string) => void;
};

export function BusinessMetricsCard({ data, onAction }: Props) {
  const cells = [
    {
      id: 'orders',
      label: 'Pedidos',
      value: String(data.ordersToday),
      emphasize: data.focus === 'orders' || data.focus === 'all',
      action: 'pedidos de hoy',
    },
    {
      id: 'sales',
      label: 'Ventas',
      value: money(data.salesToday, data.currency),
      emphasize: data.focus === 'sales' || data.focus === 'all',
      action: 'ventas de hoy',
    },
    {
      id: 'customers',
      label: 'Clientes',
      value: String(data.customersToday),
      emphasize: data.focus === 'customers' || data.focus === 'all',
      action: 'nombres de clientes',
    },
    {
      id: 'ticket',
      label: 'Ticket',
      value: money(data.avgTicket, data.currency),
      emphasize: data.focus === 'all',
      action: 'resumen de hoy',
    },
  ];

  return (
    <div
      className="mt-1.5 w-full max-w-[min(96%,24rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
      data-business-metrics-card={data.focus}
    >
      <div className="border-b border-[var(--chat-card-border)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">{data.title}</p>
        <p className="text-[11px] text-[var(--chat-text-muted)]">Día de negocio (Caracas)</p>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--chat-card-border)]">
        {cells.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onAction?.(c.action)}
            className={`bg-[var(--chat-card)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-input)]/50 ${
              c.emphasize ? '' : 'opacity-80'
            }`}
          >
            <p className="text-[11px] text-[var(--chat-text-muted)]">{c.label}</p>
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--chat-text)]">
              {c.value}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
