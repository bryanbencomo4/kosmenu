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
    <article className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.35)] sm:rounded-[1.6rem] sm:p-5">
      <div
        className={`rounded-xl bg-[linear-gradient(145deg,var(--tw-gradient-stops))] px-3 py-3 sm:rounded-[1.25rem] sm:px-4 sm:py-4 ${toneClasses[tone]}`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:text-[11px]">
          {title}
        </p>
        <p className="mt-2 whitespace-pre-line font-[var(--font-display)] text-xl font-black leading-tight tracking-[-0.04em] text-slate-950 sm:mt-3 sm:text-[1.75rem]">
          {value}
        </p>
        <p className="mt-1.5 text-xs font-semibold sm:mt-2 sm:text-sm">{delta}</p>
      </div>
      <p className="mt-2 hidden text-sm leading-6 text-slate-600 sm:mt-4 sm:block">
        {hint}
      </p>
    </article>
  );
}