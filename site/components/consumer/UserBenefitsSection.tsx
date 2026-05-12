import { Heart, MapPinned, ScanSearch, TicketPercent } from 'lucide-react';

const benefits = [
  {
    title: 'Encuentra cerca de ti',
    description: 'Ubica opciones cercanas con mapa, distancia y tiempos estimados.',
    icon: MapPinned,
  },
  {
    title: 'Compara opciones',
    description: 'Revisa categorías, rating y tipo de servicio antes de decidir.',
    icon: ScanSearch,
  },
  {
    title: 'Guarda favoritos',
    description: 'Ten a mano los negocios que más pides para volver rápido.',
    icon: Heart,
  },
  {
    title: 'Descubre promociones',
    description: 'Encuentra promos del día, combos y beneficios especiales.',
    icon: TicketPercent,
  },
] as const;

export function UserBenefitsSection() {
  return (
    <section className="px-4 pb-4 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] rounded-[1.15rem] border border-white/10 bg-[#07101d]/84 p-2 shadow-[0_36px_120px_-70px_rgba(124,58,237,0.9)] sm:p-3">
        <div className="grid gap-2.5 min-[390px]:grid-cols-2 xl:grid-cols-4">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <article
                key={benefit.title}
                className="rounded-[0.95rem] border border-white/10 bg-[#07111f]/80 px-3 py-3 backdrop-blur-xl sm:px-4"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/6 text-violet-200 sm:h-10 sm:w-10">
                    <Icon className="h-4.5 w-4.5 text-violet-300" />
                  </span>
                  <div>
                    <h3 className="text-[13px] font-bold text-white sm:text-sm">{benefit.title}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-slate-300 sm:text-xs">{benefit.description}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}