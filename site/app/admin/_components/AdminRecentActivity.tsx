type ActivityEntry = {
  title: string;
  description: string;
  time: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
};

const toneClasses: Record<ActivityEntry['tone'], string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
};

export function AdminRecentActivity({ entries }: { entries: readonly ActivityEntry[] }) {
  return (
    <aside className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Actividad reciente</p>
          <h2 className="mt-2 font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
            Bitacora operativa y seguridad
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
          Ultimas 24h
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {entries.map((entry) => (
          <div key={`${entry.title}-${entry.time}`} className="flex gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className={`mt-1 h-3 w-3 shrink-0 rounded-full ${toneClasses[entry.tone]}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">{entry.title}</p>
                <span className="whitespace-nowrap text-xs font-medium text-slate-400">{entry.time}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{entry.description}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}