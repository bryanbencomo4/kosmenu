const targets = [
  'Restaurantes',
  'Cafeterías',
  'Food trucks',
  'Dark kitchens',
  'Reposterías',
  'Emprendimientos',
] as const;

const benefits = [
  'Menos errores al recibir pedidos',
  'Catálogo siempre actualizado',
  'Imagen más profesional',
  'Pedidos claros',
  'Experiencia rápida para clientes',
  'Ideal para delivery y pickup',
] as const;

export function TargetSection() {
  return (
    <section className="perf-section border-y border-white/8 bg-[#0a0f1a]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] lg:items-center lg:py-18">
        <div>
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            Para quién es
          </span>
          <h2 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.03em] text-white sm:mt-5 sm:text-[2.3rem]">
            Hecho para negocios de comida que necesitan vender con más orden
          </h2>
        </div>

        <div className="flex flex-wrap gap-2.5 sm:gap-3">
          {targets.map((target) => (
            <div
              key={target}
              className="rounded-full border border-white/10 bg-[#0f1522] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_60px_-35px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/30 hover:bg-[#141c2c]"
            >
              {target}
            </div>
          ))}
        </div>

        <div className="mt-1 grid gap-3 lg:col-span-2 md:grid-cols-2 xl:grid-cols-3">
          {benefits.map((item) => (
            <article
              key={item}
              className="rounded-2xl border border-white/10 bg-[#0d1420]/72 p-5 text-base font-semibold leading-7 text-white transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/30"
            >
              {item}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}