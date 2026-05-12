import { Clock3, MapPin, Star } from 'lucide-react';

import type { NearbyBusiness } from '../../data/consumerBusinesses';
import { FoodArtwork } from './FoodArtwork';

type NearbyBusinessCardProps = {
  business: NearbyBusiness;
  className?: string;
};

export function NearbyBusinessCard({ business, className = '' }: NearbyBusinessCardProps) {
  return (
    <article className={`rounded-[1rem] border border-white/10 bg-[#09111f]/90 p-3 shadow-[0_22px_60px_-34px_rgba(15,23,42,1)] transition-all duration-300 hover:border-violet-400/25 sm:rounded-[1.15rem] sm:p-3.5 ${className}`}>
      <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-3 sm:grid-cols-[68px_minmax(0,1fr)] sm:gap-3.5">
        <FoodArtwork theme={business.artwork} title={business.name} variant="thumb" className="min-h-[58px] sm:min-h-[68px]" />

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white sm:text-[14px]">{business.name}</p>
              <p className="mt-0.5 text-[11px] text-slate-400 sm:mt-1 sm:text-[12px]">{business.category}</p>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2 py-1 text-[9px] font-black tracking-[0.16em] text-emerald-300 sm:px-2.5 sm:text-[10px]">
              {business.status}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-300 sm:mt-3 sm:gap-2 sm:text-[12px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              <Star className="h-3.5 w-3.5 text-[#FACC15]" />
              {business.rating}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              <MapPin className="h-3.5 w-3.5 text-cyan-300" />
              {business.distance}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
              <Clock3 className="h-3.5 w-3.5 text-violet-300" />
              {business.eta}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}