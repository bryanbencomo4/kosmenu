type AdminKpiCardTone = 'violet' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';

const toneClasses: Record<AdminKpiCardTone, string> = {
  violet: 'from-violet-500/12 via-violet-500/5 to-white text-violet-700',
  indigo: 'from-indigo-500/12 via-indigo-500/5 to-white text-indigo-700',
  emerald: 'from-emerald-500/12 via-emerald-500/5 to-white text-emerald-700',
  amber: 'from-amber-500/14 via-amber-500/6 to-white text-amber-700',
  rose: 'from-rose-500/12 via-rose-500/5 to-white text-rose-700',
  slate: 'from-slate-500/12 via-slate-500/5 to-white text-slate-700',
};

export function AdminKpiCard({
  title,
  value,
  delta,
  hint,
  tone,
}: {
  title: string;
  value: string;
  delta: string;
  hint: string;
  tone: AdminKpiCardTone;
}) {
  return (
    <article className="rounded-[1.6rem] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.35)]">
      <div className={`rounded-[1.25rem] bg-[linear-gradient(145deg,var(--tw-gradient-stops))] px-4 py-4 ${toneClasses[tone]}`}>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
        <p className="mt-3 font-[var(--font-display)] text-[2rem] font-black tracking-[-0.05em] text-slate-950">
          {value}
        </p>
        <p className="mt-2 text-sm font-semibold">{delta}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{hint}</p>
    </article>
  );
}