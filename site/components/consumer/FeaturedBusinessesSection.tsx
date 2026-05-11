import { Star } from 'lucide-react';

import type { FeaturedBusiness } from '../../data/consumerBusinesses';

type FeaturedBusinessesSectionProps = {
  businesses: FeaturedBusiness[];
};

export function FeaturedBusinessesSection({ businesses }: FeaturedBusinessesSectionProps) {
  return (
    <section id="favoritos" className="px-4 pb-4 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-[1.2rem] font-black tracking-[-0.04em] text-white sm:text-[1.4rem] lg:text-[1.55rem]">
            Explora negocios destacados
          </h2>
          <button type="button" className="text-xs font-semibold text-violet-300 sm:text-sm">
            Ver todos &gt;
          </button>
        </div>

        <div className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3 xl:grid-cols-5">
          {businesses.map((business) => (
            <article
              key={business.id}
              className="min-w-[82vw] rounded-[1rem] border border-white/10 bg-[#07111f]/82 p-3 shadow-[0_30px_90px_-55px_rgba(15,23,42,1)] backdrop-blur-xl sm:min-w-[260px] md:min-w-0"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/12 text-sm font-black text-white"
                    style={{ backgroundColor: `${business.accent}22` }}
                  >
                    {business.name
                      .split(' ')
                      .slice(0, 2)
                      .map((chunk) => chunk[0])
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold tracking-[-0.03em] text-white">{business.name}</h3>
                    <p className="truncate text-[11px] text-slate-400">{business.cuisine}</p>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-400/28 bg-emerald-500/12 px-2 py-0.5 text-[8px] font-black tracking-[0.14em] text-emerald-300">
                  {business.status}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-[#FACC15]" />{business.rating}</span>
                <span>• {business.distance} km</span>
                <span>• {business.tags[0]}</span>
                <span>• {business.zone.split(' ')[0]}</span>
              </div>

              <button
                type="button"
                aria-label={`Ver menú de ${business.name}`}
                className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[0.85rem] bg-[#FACC15] text-[11px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047] sm:w-[92px]"
              >
                Ver menú
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}