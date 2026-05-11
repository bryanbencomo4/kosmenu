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

  const scrollByAmount = (amount: number) => {
    sliderRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <section id="promociones" className="px-4 pb-3 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-[1.2rem] font-black tracking-[-0.04em] text-white sm:text-[1.4rem] lg:text-[1.55rem]">
              Negocios promocionados del día 🔥
            </h2>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label="Ver promociones anteriores"
              onClick={() => scrollByAmount(-360)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition-all duration-300 hover:border-violet-400/35 hover:bg-white/10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Ver promociones siguientes"
              onClick={() => scrollByAmount(360)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-white transition-all duration-300 hover:border-violet-400/35 hover:bg-white/10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          ref={sliderRef}
          className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] sm:gap-3"
        >
          {businesses.map((business) => (
            <article
              key={business.id}
              className="min-w-[82vw] max-w-[82vw] flex-1 snap-start rounded-[1.1rem] border border-white/10 bg-[#07111f]/80 p-2.5 shadow-[0_28px_80px_-50px_rgba(124,58,237,0.85)] backdrop-blur-xl sm:min-w-[240px] sm:max-w-[255px] sm:rounded-[1.2rem]"
            >
              <div className="relative">
                <FoodArtwork theme={business.artwork} title={business.name} className="min-h-[120px] sm:min-h-[126px]" />

                <span className="absolute left-3 top-3 rounded-full border border-[#FACC15]/24 bg-[#151109]/92 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#FACC15] shadow-[0_10px_20px_-12px_rgba(0,0,0,0.9)] backdrop-blur">
                  {business.promoLabel}
                </span>

                <button
                  type="button"
                  aria-label={`Guardar ${business.name} en favoritos`}
                  className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-[#07111f]/75 text-white transition-all duration-300 hover:border-rose-400/40 hover:text-rose-300 sm:h-10 sm:w-10"
                >
                  <Heart className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="mt-2.5">
                <h3 className="text-base font-black tracking-[-0.04em] text-white">{business.name}</h3>
                <p className="mt-0.5 text-[11px] text-slate-400">{business.category} artesanales</p>

                <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] text-slate-300">
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
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-[0.85rem] bg-[#FACC15] text-[11px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047] sm:w-[102px]"
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