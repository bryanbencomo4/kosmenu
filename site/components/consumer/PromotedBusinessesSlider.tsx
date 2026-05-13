'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock3, Heart, MapPin, Star } from 'lucide-react';

import type { PromotedBusiness } from '../../data/consumerBusinesses';
import { FoodArtwork } from './FoodArtwork';

type PromotedBusinessesSliderProps = {
  businesses: PromotedBusiness[];
  favoriteKeys: ReadonlySet<string>;
  onToggleFavorite: (businessKey: string) => void;
  onViewAllPromotions: () => void;
};

type PromotedBusinessCardProps = {
  business: PromotedBusiness;
  favoriteKeys: ReadonlySet<string>;
  onToggleFavorite: (businessKey: string) => void;
};

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  return prefersReducedMotion;
}

function PromotionBadge({ children, tone = 'promo' }: { children: string; tone?: 'promo' | 'status' | 'spotlight' }) {
  const toneClassName =
    tone === 'status'
      ? 'border-emerald-400/26 bg-emerald-500/14 text-emerald-200'
      : tone === 'spotlight'
        ? 'border-violet-300/26 bg-violet-500/16 text-violet-100'
        : 'border-[#FACC15]/24 bg-[#151109]/86 text-[#FACC15]';

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] backdrop-blur ${toneClassName}`}
    >
      {children}
    </span>
  );
}

function PromotedSpotlightCard({ business, favoriteKeys, onToggleFavorite }: PromotedBusinessCardProps) {
  const businessKey = business.href ?? business.id;
  const isFavorite = favoriteKeys.has(businessKey);

  return (
    <article className="group min-w-[88vw] max-w-[88vw] snap-start rounded-[1.2rem] border border-[#facc15]/35 bg-[#07111f]/84 p-3 shadow-[0_34px_90px_-58px_rgba(250,204,21,0.28)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_38px_100px_-54px_rgba(250,204,21,0.32)] motion-reduce:transform-none min-[430px]:min-w-[84vw] min-[430px]:max-w-[84vw] sm:min-w-[560px] sm:max-w-[560px] sm:p-4 lg:min-w-[510px] lg:max-w-[510px] xl:min-w-[530px] xl:max-w-[530px]">
      <div className="grid grid-cols-[118px_minmax(0,1fr)] gap-3 min-[390px]:grid-cols-[126px_minmax(0,1fr)] min-[560px]:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)]">
        <div className="relative">
          <FoodArtwork
            theme={business.artwork}
            title={business.name}
            imageUrl={business.imageUrl}
            variant="showcase"
            className="min-h-[158px] min-[390px]:min-h-[166px] min-[560px]:min-h-[205px] xl:min-h-[208px]"
          />

          <div className="absolute left-3 top-3 flex max-w-[78%] flex-wrap gap-2">
            <PromotionBadge>🔥 Promo</PromotionBadge>
            <PromotionBadge tone="status">Abierto ahora</PromotionBadge>
            {business.spotlightLabel ? <PromotionBadge tone="spotlight">{business.spotlightLabel}</PromotionBadge> : null}
          </div>

          <button
            type="button"
            aria-pressed={isFavorite}
            onClick={() => onToggleFavorite(businessKey)}
            aria-label={`Guardar ${business.name} en favoritos`}
            className={`absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-[#07111f]/75 transition-all duration-300 ${
              isFavorite
                ? 'border-rose-400/45 text-rose-300'
                : 'border-white/14 text-white hover:border-rose-400/40 hover:text-rose-300'
            }`}
          >
            <Heart className={`h-4.5 w-4.5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <h3 className="text-[1.08rem] font-black tracking-[-0.04em] text-white min-[390px]:text-[1.15rem] xl:text-[1.7rem]">
              {business.name}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-300 min-[390px]:text-[12px]">{business.category} artesanales</p>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-300 min-[390px]:gap-2 min-[390px]:text-[11px]">
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

          <div className="mt-2 rounded-[0.9rem] border border-[#FACC15]/18 bg-[#120f06] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <p className="text-[0.82rem] font-black text-[#FACC15] min-[390px]:text-[0.88rem]">
              {business.promoTitle ?? 'Promo especial del día'}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-300 min-[390px]:text-[11px]">
              {business.promoWindow ?? 'Disponible por tiempo limitado'}
            </p>
          </div>

          <Link
            href={business.href ?? '#'}
            aria-label={`Ver menú y pedir en ${business.name}`}
            className="mt-2.5 inline-flex h-10 w-full items-center justify-center rounded-[0.95rem] bg-[#FACC15] text-[12px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047] min-[560px]:mt-auto min-[560px]:h-11 min-[560px]:w-[188px] min-[560px]:rounded-[1rem] min-[560px]:text-[13px]"
          >
            Ver menú y pedir
          </Link>
        </div>
      </div>
    </article>
  );
}

function PromotedCompactCard({ business, favoriteKeys, onToggleFavorite }: PromotedBusinessCardProps) {
  const businessKey = business.href ?? business.id;
  const isFavorite = favoriteKeys.has(businessKey);

  return (
    <article className="group min-w-[61vw] max-w-[61vw] snap-start rounded-[1.05rem] border border-white/10 bg-[#07111f]/82 p-2.5 shadow-[0_28px_80px_-52px_rgba(124,58,237,0.78)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 hover:border-violet-300/28 hover:shadow-[0_30px_84px_-48px_rgba(124,58,237,0.86)] motion-reduce:transform-none min-[390px]:min-w-[56vw] min-[390px]:max-w-[56vw] min-[430px]:min-w-[50vw] min-[430px]:max-w-[50vw] sm:min-w-[222px] sm:max-w-[222px] lg:min-w-[218px] lg:max-w-[218px] xl:min-w-[224px] xl:max-w-[224px]">
      <div className="relative">
        <FoodArtwork
          theme={business.artwork}
          title={business.name}
          imageUrl={business.imageUrl}
          variant="showcase"
          className="min-h-[98px] min-[390px]:min-h-[108px] sm:min-h-[118px]"
        />

        <div className="absolute left-2.5 top-2.5 flex max-w-[74%] flex-wrap gap-1.5">
          <PromotionBadge>🔥 Promo</PromotionBadge>
          <PromotionBadge tone="status">Abierto ahora</PromotionBadge>
        </div>

        <button
          type="button"
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(businessKey)}
          aria-label={`Guardar ${business.name} en favoritos`}
          className={`absolute right-2.5 top-2.5 inline-flex h-8.5 w-8.5 items-center justify-center rounded-full border bg-[#07111f]/75 transition-all duration-300 ${
            isFavorite
              ? 'border-rose-400/45 text-rose-300'
              : 'border-white/14 text-white hover:border-rose-400/40 hover:text-rose-300'
          }`}
        >
          <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
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

        <Link
          href={business.href ?? '#'}
          aria-label={`Ver menú y pedir en ${business.name}`}
          className="mt-3 inline-flex h-9.5 w-full items-center justify-center rounded-[0.9rem] bg-[#FACC15] text-[11px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047]"
        >
          Ver menú y pedir
        </Link>
      </div>
    </article>
  );
}

export function PromotedBusinessesSlider({
  businesses,
  favoriteKeys,
  onToggleFavorite,
  onViewAllPromotions,
}: PromotedBusinessesSliderProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const wrapPointRef = useRef(0);
  const pauseTimeoutRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);
  const [isPaused, setIsPaused] = useState(false);

  const featuredBusiness = businesses[0];
  const shouldLoop = businesses.length > 1 && !prefersReducedMotion;
  const renderedBusinesses = useMemo(() => (shouldLoop ? [...businesses, ...businesses] : businesses), [businesses, shouldLoop]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    return () => {
      if (pauseTimeoutRef.current !== null) {
        window.clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = sliderRef.current;
    if (!container) {
      return;
    }

    const updateWrapPoint = () => {
      if (!shouldLoop) {
        wrapPointRef.current = 0;
        return;
      }

      const firstItem = container.children.item(0) as HTMLElement | null;
      const firstDuplicatedItem = container.children.item(businesses.length) as HTMLElement | null;
      if (!firstItem || !firstDuplicatedItem) {
        wrapPointRef.current = 0;
        return;
      }

      wrapPointRef.current = firstDuplicatedItem.offsetLeft - firstItem.offsetLeft;
    };

    updateWrapPoint();

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateWrapPoint) : null;
    resizeObserver?.observe(container);
    Array.from(container.children).forEach((child) => resizeObserver?.observe(child));
    window.addEventListener('resize', updateWrapPoint);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateWrapPoint);
    };
  }, [businesses.length, renderedBusinesses, shouldLoop]);

  useEffect(() => {
    if (!shouldLoop) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const container = sliderRef.current;
      const wrapPoint = wrapPointRef.current;
      const documentIsVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';

      if (container && wrapPoint > 0 && !isPausedRef.current && documentIsVisible) {
        container.scrollLeft += 1;
        if (container.scrollLeft >= wrapPoint) {
          container.scrollLeft -= wrapPoint;
        }
      }
    }, 30);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldLoop]);

  const pauseAutoScroll = useCallback(() => {
    if (!shouldLoop) {
      return;
    }

    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    isPausedRef.current = true;
    setIsPaused(true);
  }, [shouldLoop]);

  const resumeAutoScroll = useCallback((delay = 180) => {
    if (!shouldLoop) {
      return;
    }

    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
    }

    pauseTimeoutRef.current = window.setTimeout(() => {
      isPausedRef.current = false;
      setIsPaused(false);
      pauseTimeoutRef.current = null;
    }, delay);
  }, [shouldLoop]);

  useEffect(() => {
    const container = sliderRef.current;
    if (!container || !shouldLoop) {
      return;
    }

    const handleMouseEnter = () => {
      pauseAutoScroll();
    };
    const handleMouseLeave = () => {
      resumeAutoScroll();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        pauseAutoScroll();
      }
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        resumeAutoScroll(1400);
      }
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [pauseAutoScroll, resumeAutoScroll, shouldLoop]);

  const scrollByAmount = (amount: number) => {
    if (!sliderRef.current) {
      return;
    }

    pauseAutoScroll();

    if (shouldLoop && amount < 0 && sliderRef.current.scrollLeft <= 8 && wrapPointRef.current > 0) {
      sliderRef.current.scrollLeft += wrapPointRef.current;
    }

    sliderRef.current.scrollTo({
      left: sliderRef.current.scrollLeft + amount,
      behavior: 'smooth',
    });

    resumeAutoScroll(1800);
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
              Descubre las promos activas con mejor visibilidad del directorio y pide en segundos.
            </p>
          </div>

          <button
            type="button"
            onClick={onViewAllPromotions}
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
          onFocusCapture={pauseAutoScroll}
          onBlurCapture={(event) => {
            const nextFocusedElement = event.relatedTarget;
            if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
              return;
            }

            resumeAutoScroll();
          }}
          className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-2 pr-1 [scroll-snap-type:x_mandatory] sm:gap-4 lg:[scroll-snap-type:none]"
        >
          {renderedBusinesses.map((business, index) => {
            const isSpotlightCard = index % businesses.length === 0;
            const renderKey = `${business.id}-${Math.floor(index / businesses.length)}`;

            return isSpotlightCard ? (
              <PromotedSpotlightCard
                key={renderKey}
                business={business}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={onToggleFavorite}
              />
            ) : (
              <PromotedCompactCard
                key={renderKey}
                business={business}
                favoriteKeys={favoriteKeys}
                onToggleFavorite={onToggleFavorite}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}