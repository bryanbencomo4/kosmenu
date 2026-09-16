import Image from 'next/image';
import Link from 'next/link';
import {
  Check,
  ChevronRight,
} from 'lucide-react';

import { MenuDirectorySearch } from './directory/MenuDirectorySearch';
import { MerchantHeroNote, MerchantHeroPrimary } from './merchant/MerchantAuthControls';

type HeroProps = {
  signupHref: string;
};

const heroHighlights = [
  { label: 'Sin esperar al mesero', detail: 'autoservicio desde el celular' },
  { label: 'Sin imprimir nuevos menús', detail: 'el papel ya no te detiene' },
  { label: 'Cambia precios y productos en segundos', detail: 'tu menú siempre actualizado' },
] as const;

const orbitNodes = [
  'left-[10%] top-[36%] h-2.5 w-2.5',
  'left-[24%] top-[14%] h-2 w-2',
  'left-[60%] top-[10%] h-2.5 w-2.5',
  'right-[7%] top-[28%] h-3 w-3',
  'right-[12%] bottom-[19%] h-2.5 w-2.5',
  'left-[54%] bottom-[11%] h-2 w-2',
] as const;

const orbitParticles = [
  'left-[17%] top-[24%] h-1 w-1 opacity-75',
  'left-[30%] top-[58%] h-1.5 w-1.5 opacity-60',
  'left-[72%] top-[22%] h-1 w-1 opacity-65',
  'right-[16%] top-[16%] h-1 w-1 opacity-55',
  'right-[22%] bottom-[30%] h-1.5 w-1.5 opacity-70',
  'left-[44%] bottom-[18%] h-1 w-1 opacity-50',
] as const;

function HeroProductVisual() {
  return (
    <div className="relative w-full">
      <div
        aria-hidden="true"
        className="hero-orbit-system pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 opacity-55 sm:h-[26rem] sm:w-[26rem] sm:opacity-70 lg:h-[36rem] lg:w-[36rem] lg:opacity-100"
      >
        <div className="hero-glow-violet animate-glow-pulse absolute left-1/2 top-1/2 h-[11rem] w-[11rem] -translate-x-1/2 -translate-y-1/2 lg:h-[18rem] lg:w-[18rem]" />
        <div className="hero-glow-violet hero-glow-secondary animate-glow-pulse animation-delay-200 absolute left-1/2 top-1/2 hidden h-[23rem] w-[23rem] -translate-x-1/2 -translate-y-1/2 sm:block lg:h-[27rem] lg:w-[27rem]" />
        <div className="hero-glow-cyan animate-glow-pulse animation-delay-300 absolute left-[70%] top-[66%] h-[10rem] w-[10rem] -translate-x-1/2 -translate-y-1/2 sm:h-[13rem] sm:w-[13rem] lg:h-[19rem] lg:w-[19rem]" />

        <div className="hero-orbit hero-orbit-1 absolute left-1/2 top-1/2 h-[14rem] w-[14rem] -translate-x-1/2 -translate-y-1/2 sm:h-[18rem] sm:w-[18rem] lg:h-[20rem] lg:w-[20rem]" />
        <div className="hero-orbit hero-orbit-2 absolute left-1/2 top-1/2 h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 sm:h-[24rem] sm:w-[24rem] lg:h-[28rem] lg:w-[28rem]" />
        <div className="hero-orbit hero-orbit-3 absolute left-1/2 top-1/2 hidden h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 lg:block" />
        <div className="hero-orbit hero-orbit-4 absolute left-1/2 top-1/2 hidden h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 lg:block" />

        {orbitNodes.map((className) => (
          <span key={className} className={`hero-node absolute hidden sm:block ${className}`} />
        ))}

        {orbitParticles.map((className) => (
          <span key={className} className={`hero-particle absolute hidden sm:block ${className}`} />
        ))}
      </div>

      <Image
        src="/branding/phone-and-tent.png"
        alt="Portamenú inteligente de elmenuxfa junto a un smartphone en un restaurante"
        width={1122}
        height={1402}
        priority
        unoptimized
        className="animate-float-slow relative z-10 block h-auto w-full select-none drop-shadow-[0_40px_100px_rgba(0,0,0,0.55)]"
      />
    </div>
  );
}

export function Hero({ signupHref }: HeroProps) {
  return (
    <section id="inicio" className="hero-shell relative isolate overflow-hidden px-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-80" />
        <div className="hero-glow-violet absolute left-[58%] top-[10%] hidden h-[34rem] w-[34rem] -translate-x-1/2 opacity-90 lg:block xl:h-[40rem] xl:w-[40rem]" />
        <div className="hero-glow-violet hero-glow-secondary absolute left-[72%] top-[22%] hidden h-[28rem] w-[28rem] -translate-x-1/2 opacity-70 lg:block" />
      </div>

      <div className="hero-inner relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-14 lg:pt-10">
        <div className="hero-layout grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-6 xl:gap-8">
          <div className="hero-copy mx-auto min-w-0 max-w-[36rem] text-center lg:mx-0 lg:max-w-[36.5rem] lg:text-left xl:max-w-[38rem]">
            <div className="hero-badge animate-fade-up inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-[#221743]/45 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_16px_34px_-24px_rgba(124,58,237,0.95)] backdrop-blur-xl sm:px-4 sm:py-2 sm:text-[13px]">
              <span className="text-violet-200">#</span>
              Menú Inteligente para restaurantes{' '}
              <span className="rounded-full bg-[#FACC15] px-1.5 py-0.5 text-[10px] font-bold text-[#0B0F1A] sm:px-2 sm:text-[11px]">
                kit $10
              </span>
            </div>

            <h1 className="hero-mobile-title mx-auto mt-4 max-w-[21rem] font-[var(--font-display)] text-[1.85rem] font-black leading-[1.05] tracking-[-0.04em] text-white sm:max-w-[32rem] sm:text-[2.45rem] lg:mx-0 lg:max-w-none lg:text-[2.85rem] xl:text-[3.15rem]">
              <span className="hero-title-desktop">
                Convierte cada mesa de tu restaurante en un{' '}
                <span className="text-[#FACC15]">vendedor inteligente.</span>
              </span>
              <span className="hero-title-mobile">
                Tu menú ahora
                <span className="hero-title-mobile-accent">vende por ti</span>
              </span>
            </h1>

            <p className="hero-lead animate-fade-up animation-delay-300 mx-auto mt-5 max-w-[31rem] text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7 lg:mx-0 lg:max-w-[33rem] lg:text-[0.98rem] lg:leading-7">
              <span className="hero-lead-desktop">
                Permite que tus clientes escaneen, exploren tu menú y disfruten una experiencia de autoservicio desde su celular.
              </span>
              <span className="hero-lead-mobile">Tus clientes escanean el QR y piden desde el celular.</span>
            </p>

            <div className="hero-benefits mt-6 grid gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-1 xl:grid-cols-3">
              {heroHighlights.map((item, index) => {
                return (
                  <div
                    key={item.label}
                    className={`animate-fade-up flex min-h-[5.75rem] min-w-0 items-start gap-3 rounded-[1.15rem] border border-white/7 bg-[#0b101d]/78 px-3.5 py-3.5 text-left text-[0.86rem] font-medium text-slate-100 sm:min-h-[7.25rem] sm:px-4 sm:py-4 sm:text-[0.9rem] ${
                      index === 0 ? 'animation-delay-300' : index === 1 ? 'animation-delay-500' : 'animation-delay-700'
                    }`}
                  >
                    <span className="hero-benefit-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#FACC15]/30 bg-[#FACC15]/12 text-[#FACC15] sm:h-10 sm:w-10">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                    <span className="hero-benefit-copy min-w-0 flex-1 leading-tight">
                      <span className="block text-[1em] font-semibold text-white">{item.label}</span>
                      <span className="hero-benefit-detail mt-1 block text-[0.95em] leading-[1.25] text-slate-300/90">
                        {item.detail}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="hero-cta-row mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap lg:items-start lg:justify-start">
              <MerchantHeroPrimary signupHref={signupHref} />
              <div className="hero-secondary-actions animate-fade-up animation-delay-500 scroll-mt-28">
                <MenuDirectorySearch />
              </div>
              <Link
                href="#demo"
                className="hero-secondary-actions animate-fade-up animation-delay-500 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-6 py-4 text-base font-semibold text-white/92 transition-all duration-300 hover:text-white sm:w-auto"
              >
                Ver la experiencia
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="hero-note">
              <MerchantHeroNote />
            </div>
          </div>

          <div className="hero-product animate-fade-up animation-delay-300 relative mx-auto flex w-full min-w-0 justify-center lg:mx-0 lg:justify-end">
            <div className="hero-mobile-product w-full max-w-[20rem] sm:max-w-[24rem] lg:max-w-[30rem] xl:max-w-[33rem]">
              <HeroProductVisual />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
