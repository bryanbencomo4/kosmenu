type ChartPoint = {
  label: string;
  orders: number;
  revenue: number;
};

const compactCurrency = new Intl.NumberFormat('es-CO', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function AdminDashboardChart({ data }: { data: readonly ChartPoint[] }) {
  const width = 560;
  const height = 240;
  const innerHeight = 138;
  const left = 28;
  const right = 18;
  const top = 22;
  const innerWidth = width - left - right;
  const maxOrders = Math.max(...data.map((entry) => entry.orders), 1);
  const maxRevenue = Math.max(...data.map((entry) => entry.revenue), 1);
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;
  const barWidth = Math.max(20, innerWidth / Math.max(data.length * 1.8, 1));

  const linePoints = data
    .map((entry, index) => {
      const x = left + stepX * index;
      const y = top + innerHeight - (entry.revenue / maxRevenue) * innerHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <article className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Pedidos + ingresos</p>
          <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
            Comportamiento semanal del marketplace
          </h2>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="h-3 w-3 rounded-full bg-violet-500" />
            Ingresos
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <span className="h-3 w-3 rounded-full bg-violet-200" />
            Pedidos
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          {[0, 1, 2, 3].map((index) => {
            const y = top + (innerHeight / 3) * index;

            return (
              <line
                key={index}
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.28)"
                strokeDasharray="4 6"
              />
            );
          })}

          <polyline
            fill="none"
            stroke="#7c3aed"
            strokeWidth="4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePoints}
          />

          {data.map((entry, index) => {
            const x = left + stepX * index;
            const barHeight = (entry.orders / maxOrders) * innerHeight;
            const y = top + innerHeight - barHeight;
            const lineY = top + innerHeight - (entry.revenue / maxRevenue) * innerHeight;

            return (
              <g key={entry.label}>
                <rect
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="10"
                  fill="rgba(167,139,250,0.35)"
                />
                <circle cx={x} cy={lineY} r="5" fill="#7c3aed" />
                <text
                  x={x}
                  y={height - 14}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px] font-bold"
                >
                  {entry.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Revenue peak</p>
          <p className="mt-2 text-xl font-black text-slate-950">{compactCurrency.format(maxRevenue)}</p>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Order peak</p>
          <p className="mt-2 text-xl font-black text-slate-950">{maxOrders}</p>
        </div>
        <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Cadencia</p>
          <p className="mt-2 text-xl font-black text-slate-950">7 dias</p>
        </div>
      </div>
    </article>
  );
}