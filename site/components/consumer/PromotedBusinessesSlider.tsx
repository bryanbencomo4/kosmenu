'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Heart, MapPin, Star } from 'lucide-react';

import type { PromotedBusiness } from '../../data/consumerBusinesses';
import { FoodArtwork } from './FoodArtwork';

type PromotedBusinessesSliderProps = {
  businesses: PromotedBusiness[];
};

export function PromotedBusinessesSlider({ businesses }: PromotedBusinessesSliderProps) {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [featuredBusiness, ...secondaryBusinesses] = businesses;

  const scrollByAmount = (amount: number) => {
    if (!sliderRef.current) {
      return;
    }

    sliderRef.current.scrollTo({
      left: sliderRef.current.scrollLeft + amount,
      behavior: 'smooth',
    });
  };

  if (!featuredBusiness) {
    return null;
  }

  return (
    <section id="promociones" className="px-3 pb-3 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-[1.15rem] font-black tracking-[-0.04em] text-white sm:text-[1.55rem] lg:text-[1.8rem]">
              Negocios promocionados del día 🔥
            </h2>
            <p className="mt-1 text-[13px] text-slate-400 sm:text-sm">
              Descubre las promos activas con mejor visibilidad del directorio.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-300 transition-colors duration-300 hover:text-violet-200 sm:text-sm"
          >
            Ver todas las promociones
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              aria-label="Ver promociones anteriores"
              onClick={() => scrollByAmount(-420)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-violet-400/30 hover:bg-white/10"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              aria-label="Ver promociones siguientes"
              onClick={() => scrollByAmount(420)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-all duration-300 hover:border-violet-400/30 hover:bg-white/10"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div
          ref={sliderRef}
          className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-2 pr-1 [scroll-snap-type:x_mandatory] sm:gap-4 lg:[scroll-snap-type:none]"
        >
          <article className="min-w-[88vw] max-w-[88vw] snap-start rounded-[1.2rem] border border-[#facc15]/35 bg-[#07111f]/84 p-3 shadow-[0_34px_90px_-58px_rgba(250,204,21,0.28)] backdrop-blur-xl min-[430px]:min-w-[84vw] min-[430px]:max-w-[84vw] sm:min-w-[560px] sm:max-w-[560px] sm:p-4 lg:min-w-[510px] lg:max-w-[510px] xl:min-w-[530px] xl:max-w-[530px]">
            <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3 min-[390px]:grid-cols-[126px_minmax(0,1fr)] min-[560px]:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)]">
              <div className="relative">
                <FoodArtwork
                  theme={featuredBusiness.artwork}
                  title={featuredBusiness.name}
                  variant="showcase"
                  className="min-h-[158px] min-[390px]:min-h-[166px] min-[560px]:min-h-[205px] xl:min-h-[208px]"
                />

                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#FACC15]/24 bg-[#151109]/86 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-[#FACC15] backdrop-blur min-[390px]:px-2.5 min-[390px]:text-[9px]">
                    {featuredBusiness.promoLabel}
                  </span>
                  {featuredBusiness.spotlightLabel ? (
                    <span className="hidden rounded-full border border-violet-300/26 bg-violet-500/16 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-200 backdrop-blur min-[390px]:inline-flex">
                      {featuredBusiness.spotlightLabel}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  aria-label={`Guardar ${featuredBusiness.name} en favoritos`}
                  className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-[#07111f]/75 text-white transition-all duration-300 hover:border-rose-400/40 hover:text-rose-300"
                >
                  <Heart className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="flex min-w-0 flex-col justify-between">
                <div>
                  <h3 className="text-[1.08rem] font-black tracking-[-0.04em] text-white min-[390px]:text-[1.15rem] xl:text-[1.7rem]">
                    {featuredBusiness.name}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-300 min-[390px]:text-[12px]">{featuredBusiness.category} artesanales</p>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-300 min-[390px]:gap-2 min-[390px]:text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <Star className="h-3.5 w-3.5 text-[#FACC15]" />
                    {featuredBusiness.rating}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                    {featuredBusiness.distance}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <Clock3 className="h-3.5 w-3.5 text-violet-300" />
                    {featuredBusiness.eta}
                  </span>
                </div>

                <div className="mt-2 rounded-[0.9rem] border border-[#FACC15]/18 bg-[#120f06] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <p className="text-[0.82rem] font-black text-[#FACC15] min-[390px]:text-[0.88rem]">
                    {featuredBusiness.promoTitle ?? 'Promo especial del día'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-300 min-[390px]:text-[11px]">
                    {featuredBusiness.promoWindow ?? 'Disponible por tiempo limitado'}
                  </p>
                </div>

                <button
                  type="button"
                  aria-label={`Ver catálogo de ${featuredBusiness.name}`}
                  className="mt-2.5 inline-flex h-10 w-full items-center justify-center rounded-[0.95rem] bg-[#FACC15] text-[12px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047] min-[560px]:mt-auto min-[560px]:h-11 min-[560px]:w-[160px] min-[560px]:rounded-[1rem] min-[560px]:text-[13px]"
                >
                  Ver catálogo
                </button>
              </div>
            </div>
          </article>

          {secondaryBusinesses.slice(0, 4).map((business) => (
            <article
              key={business.id}
              className="min-w-[61vw] max-w-[61vw] snap-start rounded-[1.05rem] border border-white/10 bg-[#07111f]/82 p-2.5 shadow-[0_28px_80px_-52px_rgba(124,58,237,0.78)] backdrop-blur-xl min-[390px]:min-w-[56vw] min-[390px]:max-w-[56vw] min-[430px]:min-w-[50vw] min-[430px]:max-w-[50vw] sm:min-w-[222px] sm:max-w-[222px] lg:min-w-[218px] lg:max-w-[218px] xl:min-w-[224px] xl:max-w-[224px]"
            >
              <div className="relative">
                <FoodArtwork
                  theme={business.artwork}
                  title={business.name}
                  variant="showcase"
                  className="min-h-[98px] min-[390px]:min-h-[108px] sm:min-h-[118px]"
                />

                <span className="absolute left-2.5 top-2.5 rounded-full border border-[#FACC15]/24 bg-[#151109]/82 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-[#FACC15] backdrop-blur">
                  {business.promoLabel}
                </span>

                <button
                  type="button"
                  aria-label={`Guardar ${business.name} en favoritos`}
                  className="absolute right-2.5 top-2.5 inline-flex h-8.5 w-8.5 items-center justify-center rounded-full border border-white/14 bg-[#07111f]/75 text-white transition-all duration-300 hover:border-rose-400/40 hover:text-rose-300"
                >
                  <Heart className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5">
                <h3 className="text-[13px] font-black tracking-[-0.03em] text-white min-[390px]:text-[14px]">{business.name}</h3>
                <p className="mt-0.5 text-[10px] text-slate-300">{business.category} artesanales</p>

                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-[#FACC15]" />
                    {business.rating}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                    {business.distance}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5 text-violet-300" />
                    {business.eta}
                  </span>
                </div>

                <button
                  type="button"
                  aria-label={`Ver catálogo de ${business.name}`}
                  className="mt-3 inline-flex h-9.5 w-full items-center justify-center rounded-[0.9rem] bg-[#FACC15] text-[11px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047]"
                >
                  Ver catálogo
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}