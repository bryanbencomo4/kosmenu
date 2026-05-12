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
    <section id="promociones" className="px-3 pb-3 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-[1.15rem] font-black tracking-[-0.04em] text-white sm:text-[1.55rem] lg:text-[1.8rem]">
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
          className="hide-scrollbar flex gap-3 overflow-x-auto pb-2 [scroll-snap-type:x_mandatory] sm:gap-4 lg:gap-3"
        >
          {businesses.map((business) => (
            <article
              key={business.id}
              className="min-w-[88vw] max-w-[88vw] flex-1 snap-start rounded-[1.15rem] border border-white/10 bg-[#07111f]/80 p-3 shadow-[0_28px_80px_-50px_rgba(124,58,237,0.85)] backdrop-blur-xl min-[430px]:min-w-[82vw] min-[430px]:max-w-[82vw] sm:min-w-[290px] sm:max-w-[300px] sm:rounded-[1.25rem] sm:p-3.5 lg:min-w-[272px] lg:max-w-[272px]"
            >
              <div className="relative">
                <FoodArtwork theme={business.artwork} title={business.name} variant="promo" className="min-h-[168px] min-[430px]:min-h-[178px] sm:min-h-[188px] lg:min-h-[196px]" />

                <span className="absolute left-2.5 top-2.5 rounded-full border border-[#FACC15]/24 bg-[#151109]/82 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#FACC15] shadow-[0_10px_20px_-12px_rgba(0,0,0,0.9)] backdrop-blur sm:left-3 sm:top-3 sm:px-3 sm:py-1.5 sm:text-[10px]">
                  {business.promoLabel}
                </span>

                <button
                  type="button"
                  aria-label={`Guardar ${business.name} en favoritos`}
                  className="absolute right-2.5 top-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-[#07111f]/75 text-white transition-all duration-300 hover:border-rose-400/40 hover:text-rose-300 sm:right-3 sm:top-3 sm:h-10 sm:w-10"
                >
                  <Heart className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="mt-3.5">
                <h3 className="text-[17px] font-black tracking-[-0.04em] text-white sm:text-lg">{business.name}</h3>
                <p className="mt-1 text-[12px] text-slate-300">{business.category} artesanales</p>

                <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-slate-300">
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
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-[1rem] bg-[#FACC15] text-[13px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047]"
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