const targets = [
  'Restaurantes',
  'Cafeterías',
  'Food trucks',
  'Dark kitchens',
  'Reposterías',
  'Emprendimientos gastronómicos',
] as const;

const benefits = [
  'Menos errores al recibir pedidos',
  'Catálogo siempre actualizado',
  'Imagen más profesional',
  'Experiencia rápida para tus clientes',
  'Ideal para delivery y pickup',
] as const;

const testimonialPlaceholders = [
  { role: 'Restaurante', quote: 'Espacio reservado para testimonio de cliente.' },
  { role: 'Cafetería', quote: 'Espacio reservado para testimonio de cliente.' },
  { role: 'Food truck', quote: 'Espacio reservado para testimonio de cliente.' },
] as const;

export function TargetSection() {
  return (
    <section className="perf-section border-y border-white/8 bg-[#0a0f1a]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-18">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
              Para quién es
            </span>
            <h2 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.03em] text-white sm:mt-5 sm:text-[2.3rem]">
              Pensado para negocios que necesitan vender mejor cada día
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
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {benefits.map((item) => (
            <article
              key={item}
              className="rounded-2xl border border-white/10 bg-[#0d1420]/72 p-5 text-base font-semibold leading-7 text-white transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/30"
            >
              {item}
            </article>
          ))}
        </div>

        <div className="mt-10">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
            Testimonios
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {testimonialPlaceholders.map((item) => (
              <article
                key={item.role}
                className="rounded-2xl border border-dashed border-white/14 bg-[#0d1420]/40 p-5 text-slate-400"
              >
                <p className="text-sm italic leading-7 text-slate-400/90">&ldquo;{item.quote}&rdquo;</p>
                <p className="mt-4 text-sm font-semibold text-slate-300">{item.role}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
