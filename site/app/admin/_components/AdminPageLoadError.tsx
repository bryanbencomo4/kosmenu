import Link from 'next/link';

export function AdminPageLoadError({
  title = 'No se pudo cargar esta pagina',
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <section className="rounded-[1.8rem] border border-rose-200 bg-rose-50 px-6 py-8 text-rose-900 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-500">
        Error controlado
      </p>
      <h1 className="mt-2 font-[var(--font-display)] text-2xl font-black tracking-[-0.03em]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-rose-800/90">{message}</p>
      <Link
        href="/admin"
        className="mt-5 inline-flex rounded-[1rem] bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
      >
        Volver al dashboard
      </Link>
    </section>
  );
}
