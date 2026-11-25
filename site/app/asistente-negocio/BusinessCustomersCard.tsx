'use client';

export type CustomersCardData = {
  title: string;
  scopeLabel: string;
  customers: Array<{ name: string; orders: number; lastTotal: number | null }>;
};

type Props = {
  data: CustomersCardData;
  onAction?: (text: string) => void;
};

export function BusinessCustomersCard({ data, onAction }: Props) {
  if (!data.customers.length) return null;

  return (
    <div
      className="mt-1.5 w-full max-w-[min(96%,24rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] shadow-sm"
      data-business-customers-card="1"
    >
      <div className="border-b border-[var(--chat-card-border)] px-3 py-2">
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">{data.title}</p>
        <p className="text-[11px] text-[var(--chat-text-muted)]">
          {data.customers.length} nombre{data.customers.length === 1 ? '' : 's'} · {data.scopeLabel}
        </p>
      </div>
      <ul className="max-h-[18rem] divide-y divide-[var(--chat-card-border)] overflow-y-auto">
        {data.customers.map((c) => (
          <li key={c.name}>
            <button
              type="button"
              onClick={() => onAction?.(`detalle pedido ${c.name}`)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-input)]/60"
            >
              <span className="min-w-0 truncate text-[13px] font-medium text-[var(--chat-text)]">
                {c.name}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--chat-text-muted)]">
                {c.orders} ped.
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
