import { Star } from 'lucide-react';

import type { FeaturedBusiness } from '../../data/consumerBusinesses';

type FeaturedBusinessesSectionProps = {
  businesses: FeaturedBusiness[];
};

export function FeaturedBusinessesSection({ businesses }: FeaturedBusinessesSectionProps) {
  return (
    <section id="favoritos" className="px-3 pb-4 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-[1.15rem] font-black tracking-[-0.04em] text-white sm:text-[1.55rem] lg:text-[1.8rem]">
            Explora negocios destacados
          </h2>
          <button type="button" className="text-xs font-semibold text-violet-300 sm:text-sm">
            Ver todos &gt;
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 min-[1320px]:grid-cols-4 xl:gap-5">
          {businesses.map((business) => (
            <article
              key={business.id}
              className="rounded-[1.05rem] border border-white/10 bg-[#07111f]/82 p-3.5 shadow-[0_30px_90px_-55px_rgba(15,23,42,1)] backdrop-blur-xl sm:rounded-[1.15rem] sm:p-4"
            >
              <div className="flex flex-col gap-3 min-[460px]:flex-row min-[460px]:items-start min-[460px]:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 text-sm font-black text-white sm:h-12 sm:w-12"
                    style={{ backgroundColor: `${business.accent}22` }}
                  >
                    {business.name
                      .split(' ')
                      .slice(0, 2)
                      .map((chunk) => chunk[0])
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-bold leading-tight tracking-[-0.03em] text-white sm:text-[17px]">{business.name}</h3>
                    <p className="mt-1 text-[12px] leading-5 text-slate-400">{business.cuisine}</p>
                  </div>
                </div>
                <span className="self-start rounded-full border border-emerald-400/28 bg-emerald-500/12 px-2.5 py-1 text-[9px] font-black tracking-[0.14em] text-emerald-300">
                  {business.status}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-300">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                  <Star className="h-3.5 w-3.5 text-[#FACC15]" />
                  {business.rating}
                </span>
                <span className="rounded-full bg-white/5 px-2.5 py-1">{business.distance} km</span>
                <span className="rounded-full bg-white/5 px-2.5 py-1">{business.zone}</span>
                <span className="rounded-full bg-white/5 px-2.5 py-1">{business.eta}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {business.tags.map((tag) => (
                  <span
                    key={`${business.id}-${tag}`}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <button
                type="button"
                aria-label={`Ver menú de ${business.name}`}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#FACC15] text-[13px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047]"
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