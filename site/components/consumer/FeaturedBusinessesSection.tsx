'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Heart, MapPin, SlidersHorizontal, Star } from 'lucide-react';

import type { FeaturedBusiness } from '../../data/consumerBusinesses';
import { FoodArtwork } from './FoodArtwork';

type FeaturedBusinessesSectionProps = {
  businesses: FeaturedBusiness[];
  totalBusinesses: number;
  totalPages: number;
};

type PaginationItem = number | 'ellipsis';

const itemsPerPage = 10;

function buildPagination(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export function FeaturedBusinessesSection({ businesses, totalBusinesses, totalPages }: FeaturedBusinessesSectionProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(4);
  const resolvedTotalPages = Math.max(1, totalPages);
  const pageOffset = ((currentPage - 1) * 2) % businesses.length;
  const visibleBusinesses = Array.from({ length: Math.min(itemsPerPage, businesses.length) }, (_, index) => {
    return businesses[(pageOffset + index) % businesses.length];
  });
  const mobileBusinesses = businesses.slice(0, mobileVisibleCount);
  const paginationItems = buildPagination(currentPage, resolvedTotalPages);

  return (
    <section id="favoritos" className="px-3 pb-4 pt-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-4 flex flex-col items-start gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-5">
          <div>
            <h2 className="text-[1.15rem] font-black tracking-[-0.04em] text-white sm:text-[1.55rem] lg:text-[1.8rem]">
              Explora todos los menús
            </h2>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto lg:flex-nowrap">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 sm:text-[11px]">
              {totalBusinesses} negocios encontrados
            </p>

            <button
              type="button"
              aria-label="Ordenar por relevancia"
              className="inline-flex h-10 items-center justify-between gap-2 rounded-full border border-white/10 bg-[#07111f]/72 px-4 text-[12px] font-semibold text-slate-200 transition-all duration-300 hover:border-violet-400/25 hover:bg-[#0c1729]"
            >
              <span className="sm:hidden">Ordenar</span>
              <span className="hidden sm:inline">Ordenar por: Relevancia</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            <button
              type="button"
              aria-label="Abrir filtros"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[#07111f]/72 px-4 text-[12px] font-semibold text-slate-200 transition-all duration-300 hover:border-violet-400/25 hover:bg-[#0c1729]"
            >
              <SlidersHorizontal className="h-4 w-4 text-violet-300" />
              Filtros
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:hidden">
          {mobileBusinesses.map((business) => (
            <article
              key={`mobile-${business.id}`}
              className="overflow-hidden rounded-[1rem] border border-white/10 bg-[#07111f]/84 shadow-[0_24px_80px_-52px_rgba(15,23,42,1)] backdrop-blur-xl"
            >
              <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3 p-3 min-[390px]:grid-cols-[118px_minmax(0,1fr)] min-[390px]:p-3.5">
                <div className="relative">
                  <FoodArtwork theme={business.artwork} title={business.name} variant="showcase" className="min-h-[118px] rounded-[0.95rem]" />
                  <button
                    type="button"
                    aria-label={`Guardar ${business.name} en favoritos`}
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-[#07111f]/72 text-white transition-all duration-300 hover:border-rose-400/40 hover:text-rose-300"
                  >
                    <Heart className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-bold leading-tight tracking-[-0.03em] text-white min-[390px]:text-[15px]">{business.name}</h3>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{business.cuisine}</p>
                    </div>
                    <span className="rounded-full border border-emerald-400/28 bg-emerald-500/12 px-2 py-0.5 text-[8px] font-black tracking-[0.14em] text-emerald-300">
                      {business.status}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-300">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                      <Star className="h-3.5 w-3.5 text-[#FACC15]" />
                      {business.rating}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                      <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                      {business.distance} km
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                      <Clock3 className="h-3.5 w-3.5 text-violet-300" />
                      {business.eta}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                    <span className="rounded-full bg-white/5 px-2 py-1">{business.zone}</span>
                    {business.tags.map((tag) => (
                      <span
                        key={`mobile-${business.id}-${tag}`}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-semibold text-slate-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={business.href ?? '#'}
                    aria-label={`Ver catálogo de ${business.name}`}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[0.95rem] bg-[#FACC15] text-[12px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047]"
                  >
                    Ver catálogo
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 xl:gap-4">
          {visibleBusinesses.map((business) => (
            <article
              key={`${currentPage}-${business.id}`}
              className="overflow-hidden rounded-[1.05rem] border border-white/10 bg-[#07111f]/82 shadow-[0_30px_90px_-55px_rgba(15,23,42,1)] backdrop-blur-xl"
            >
              <div className="relative">
                <FoodArtwork theme={business.artwork} title={business.name} variant="showcase" className="min-h-[118px] rounded-none border-0" />

                <button
                  type="button"
                  aria-label={`Guardar ${business.name} en favoritos`}
                  className="absolute right-2.5 top-2.5 inline-flex h-8.5 w-8.5 items-center justify-center rounded-full border border-white/14 bg-[#07111f]/72 text-white transition-all duration-300 hover:border-rose-400/40 hover:text-rose-300"
                >
                  <Heart className="h-4 w-4" />
                </button>
              </div>

              <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold leading-tight tracking-[-0.03em] text-white">{business.name}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">{business.cuisine}</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/28 bg-emerald-500/12 px-2 py-0.5 text-[8px] font-black tracking-[0.14em] text-emerald-300">
                    {business.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <Star className="h-3.5 w-3.5 text-[#FACC15]" />
                    {business.rating}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                    {business.distance} km
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    <Clock3 className="h-3.5 w-3.5 text-violet-300" />
                    {business.eta}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span className="rounded-full bg-white/5 px-2 py-1">{business.zone}</span>
                  {business.tags.map((tag) => (
                    <span
                      key={`${currentPage}-${business.id}-${tag}`}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-semibold text-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <Link
                  href={business.href ?? '#'}
                  aria-label={`Ver catálogo de ${business.name}`}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-[0.9rem] bg-[#FACC15] text-[12px] font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047]"
                >
                  Ver catálogo
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 md:hidden">
          {mobileVisibleCount < businesses.length ? (
            <button
              type="button"
              aria-label="Cargar más catálogos"
              onClick={() => setMobileVisibleCount((count) => Math.min(businesses.length, count + 3))}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-violet-400/28 bg-violet-500/10 px-5 text-sm font-bold text-white transition-all duration-300 hover:border-violet-300/45 hover:bg-violet-500/16"
            >
              Cargar más catálogos
            </button>
          ) : (
            <p className="text-center text-[12px] text-slate-500">Mostrando todos los catálogos destacados por ahora.</p>
          )}
        </div>

        {resolvedTotalPages > 1 ? (
          <div className="mt-5 hidden flex-wrap items-center justify-center gap-2 sm:gap-2.5 md:flex">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[#07111f]/78 px-4 text-sm font-semibold text-slate-200 transition-all duration-300 hover:border-violet-400/25 hover:bg-[#0c1729] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>

          {paginationItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-1 text-sm text-slate-500">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Ir a la página ${item}`}
                onClick={() => setCurrentPage(item)}
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-bold transition-all duration-300 ${
                  currentPage === item
                    ? 'border-violet-400/55 bg-violet-500/20 text-white shadow-[0_0_24px_rgba(167,139,250,0.22)]'
                    : 'border-white/10 bg-[#07111f]/78 text-slate-300 hover:border-violet-400/25 hover:bg-[#0c1729]'
                }`}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            aria-label="Página siguiente"
            disabled={currentPage === resolvedTotalPages}
            onClick={() => setCurrentPage((page) => Math.min(resolvedTotalPages, page + 1))}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-[#07111f]/78 px-4 text-sm font-semibold text-slate-200 transition-all duration-300 hover:border-violet-400/25 hover:bg-[#0c1729] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}