'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  CreditCard,
  MapPin,
  Play,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import { publicSiteUrl } from '../app/_lib/public-site-config';
import { DemoPhone } from './demo/DemoPhone';
import { DEMO_FLOW_STEPS } from './demo/demo-data';
import { DemoQrCard, OrderTrackingCard, PopularProductsCard } from './demo/DemoSideCards';
import { useDemoFlow } from './demo/useDemoFlow';

const STEP_ICONS = {
  menu: BookOpen,
  cart: ShoppingCart,
  payment: CreditCard,
  tracking: MapPin,
} as const;

const PROBAR_DEMO_PATH = '/probar-demo';

export function DemoSection() {
  const {
    step,
    cart,
    activeCategory,
    stepMeta,
    setActiveCategory,
    addToCart,
    removeFromCart,
    selectStep,
    playFullFlow,
  } = useDemoFlow();
  const [demoUrl, setDemoUrl] = useState(`${publicSiteUrl}${PROBAR_DEMO_PATH}`);

  useEffect(() => {
    setDemoUrl(`${window.location.origin}${PROBAR_DEMO_PATH}`);
  }, []);

  const flowCards = (
    <div className="grid grid-cols-2 gap-2.5">
      {DEMO_FLOW_STEPS.map((item) => {
        const Icon = STEP_ICONS[item.id];
        const active = step === item.id;
        const yellow = item.accent === 'yellow';

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => selectStep(item.id)}
            aria-current={active ? 'true' : undefined}
            className={`group relative rounded-[1.1rem] border p-3.5 text-left transition duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${
              active
                ? yellow
                  ? 'border-[#FACC15]/45 bg-[#FACC15]/10 shadow-[0_0_24px_rgba(250,204,21,0.12)]'
                  : 'border-violet-300/45 bg-violet-500/12 shadow-[0_0_24px_rgba(168,85,247,0.16)]'
                : 'border-white/10 bg-white/[0.03] hover:border-white/18'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.66rem] font-bold ${
                  active
                    ? yellow
                      ? 'bg-[#FACC15] text-[#0B0F1A]'
                      : 'bg-violet-300 text-[#1a102e]'
                    : 'bg-white/10 text-white/60'
                }`}
              >
                {item.number}
              </span>
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                  yellow
                    ? 'border-[#FACC15]/30 bg-[#FACC15]/12 text-[#FACC15]'
                    : 'border-violet-400/30 bg-violet-500/12 text-violet-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[0.82rem] font-semibold leading-snug text-white">{item.title}</p>
            <p className="mt-1 text-[0.7rem] leading-relaxed text-slate-400">{item.description}</p>
            <span
              className={`mt-2 block h-0.5 w-8 rounded-full ${
                yellow ? 'bg-[#FACC15]/80' : 'bg-violet-400/70'
              }`}
            />
          </button>
        );
      })}
    </div>
  );

  const ctaBlock = (
    <div className="mx-auto flex w-full max-w-[38rem] flex-col items-center gap-3.5">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href={PROBAR_DEMO_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-[0.9rem] bg-[#FACC15] px-6 text-[0.95rem] font-bold text-[#0B0F1A] shadow-[0_20px_45px_-22px_rgba(250,204,21,0.85)] transition hover:-translate-y-0.5 hover:bg-[#fde047] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FACC15] sm:w-auto sm:min-w-[12.5rem]"
          style={{ height: '3.4rem' }}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#0B0F1A]/12">
            <Play className="h-3 w-3 fill-current" />
          </span>
          Probar demo
        </Link>
        <button
          type="button"
          onClick={playFullFlow}
          style={{ height: '3.4rem' }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[0.9rem] border border-white/16 bg-white/[0.03] px-6 text-[0.92rem] font-semibold text-white transition hover:-translate-y-0.5 hover:border-violet-300/35 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 sm:w-auto sm:min-w-[12.5rem]"
        >
          Ver flujo completo
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.75rem] text-slate-400">
        <span>✓ Sin compromiso</span>
        <span className="text-white/25">·</span>
        <span>◉ Datos de prueba</span>
        <span className="text-white/25">·</span>
        <span>✓ Listo en segundos</span>
      </p>
    </div>
  );

  return (
    <section
      id="demo"
      className="perf-section relative scroll-mt-24 overflow-hidden border-y border-white/8"
      style={{
        background:
          'radial-gradient(circle at 52% 44%, rgba(116, 70, 255, 0.12), transparent 33%), radial-gradient(circle at 88% 48%, rgba(55, 183, 255, 0.05), transparent 26%), #060b18',
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {Array.from({ length: 16 }).map((_, index) => (
          <span
            key={`dot-${index}`}
            className="absolute h-1 w-1 rounded-full bg-white/25"
            style={{
              left: `${8 + ((index * 17) % 84)}%`,
              top: `${12 + ((index * 23) % 76)}%`,
              opacity: 0.16 + (index % 4) * 0.07,
            }}
          />
        ))}
        <div className="absolute -right-10 top-[24%] hidden h-60 w-60 overflow-hidden rounded-full opacity-30 xl:block">
          <Image
            src="/demo/products/hero-banner.png"
            alt=""
            fill
            sizes="240px"
            className="scale-125 object-cover blur-sm"
          />
          <div className="absolute inset-0 bg-[#060b18]/60" />
        </div>
      </div>

      <div className="relative mx-auto max-w-[1480px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8 xl:py-16">
        {/* Mobile / tablet stack */}
        <div className="xl:hidden">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-100 sm:text-[11px]">
            <Sparkles className="h-3.5 w-3.5 text-[#c4b5fd]" />
            Demo interactivo
          </span>
          <h2 className="mt-5 font-[var(--font-display)] text-[2.35rem] font-black leading-[0.95] tracking-[-0.04em] text-white sm:text-[2.9rem]">
            <span className="block whitespace-nowrap">Mira tu menú</span>
            <span className="mt-1 block whitespace-nowrap bg-[linear-gradient(180deg,#e9d5ff_0%,#c084fc_42%,#7c3aed_100%)] bg-clip-text text-transparent">
              en acción
            </span>
          </h2>
          <p className="mt-4 max-w-[28rem] text-[1rem] leading-[1.6] text-slate-300/88 sm:text-[1.08rem]">
            Tus clientes pueden explorar, pedir, pagar y seguir su orden desde el celular, sin descargar apps.
          </p>

          <div data-demo-phone className="mx-auto mt-8 w-[90%] max-w-[21rem]">
            <DemoPhone
              step={step}
              cart={cart}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              onAdd={addToCart}
              onRemove={removeFromCart}
              onGoToCart={() => selectStep('cart')}
              onGoToPayment={() => selectStep('payment')}
              onGoToTracking={() => selectStep('tracking')}
              onGoToMenu={() => selectStep('menu')}
            />
            <p className="mt-4 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/40">
              Paso {stepMeta.number}: {stepMeta.title}
            </p>
          </div>

          <div className="mt-8">{ctaBlock}</div>
          <div className="mt-8">{flowCards}</div>
          <div className="mt-6 space-y-4">
            <PopularProductsCard onAdd={addToCart} />
            <OrderTrackingCard />
            <DemoQrCard demoUrl={demoUrl} />
          </div>
        </div>

        {/* Desktop three-column composition */}
        <div className="hidden items-center gap-9 xl:grid xl:grid-cols-[minmax(0,0.86fr)_minmax(400px,1.22fr)_minmax(0,0.86fr)]">
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-100">
              <Sparkles className="h-3.5 w-3.5 text-[#c4b5fd]" />
              Demo interactivo
            </span>
            <h2 className="relative mt-5 font-[var(--font-display)] text-[3.55rem] font-black leading-[0.95] tracking-[-0.04em] text-white">
              <span className="block whitespace-nowrap">Mira tu menú</span>
              <span className="mt-1 block whitespace-nowrap bg-[linear-gradient(180deg,#e9d5ff_0%,#c084fc_42%,#7c3aed_100%)] bg-clip-text text-transparent">
                en acción
              </span>
              <span aria-hidden="true" className="absolute -right-2 top-3 h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_16px_rgba(196,181,253,1)]" />
              <span aria-hidden="true" className="absolute -right-6 top-[3.4rem] h-1.5 w-1.5 rounded-full bg-violet-200/80 shadow-[0_0_12px_rgba(196,181,253,0.9)]" />
            </h2>
            <p className="mt-4 max-w-[27rem] text-[1.02rem] leading-[1.6] text-slate-300/88">
              Tus clientes pueden explorar, pedir, pagar y seguir su orden desde el celular, sin descargar apps.
            </p>
            <div className="mt-6">{flowCards}</div>
          </div>

          <div className="flex flex-col items-center">
            <div data-demo-phone className="relative mx-auto w-full">
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute -left-14 top-[16%] hidden h-44 w-16 text-violet-300/45 2xl:block"
                viewBox="0 0 64 176"
                fill="none"
              >
                <path d="M56 8 C 14 42, 14 122, 46 168" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 6" />
                <path d="M40 160 L46 168 L54 158" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 top-[32%] hidden h-36 w-14 text-violet-300/40 2xl:block"
                viewBox="0 0 56 144"
                fill="none"
              >
                <path d="M6 16 C 42 44, 42 96, 14 132" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 6" />
                <path d="M10 124 L14 132 L24 122" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <DemoPhone
                step={step}
                cart={cart}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                onAdd={addToCart}
                onRemove={removeFromCart}
                onGoToCart={() => selectStep('cart')}
                onGoToPayment={() => selectStep('payment')}
                onGoToTracking={() => selectStep('tracking')}
                onGoToMenu={() => selectStep('menu')}
              />
              <p className="mt-4 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/40">
                Paso {stepMeta.number}: {stepMeta.title}
              </p>
            </div>
            <div className="mt-6 w-full max-w-[23.5rem]">{ctaBlock}</div>
          </div>

          <div className="relative">
            <PopularProductsCard onAdd={addToCart} />
            <div className="my-3.5">
              <OrderTrackingCard />
            </div>
            <div aria-hidden="true" className="relative flex h-4 items-center justify-center">
              <span className="absolute left-1/2 top-1/2 h-px w-full -translate-x-1/2 -translate-y-1/2 bg-white/8" />
              <span className="relative flex h-5 w-5 items-center justify-center rounded-full border border-violet-300/55 bg-[#100b1e]">
                <ArrowDown className="h-2.5 w-2.5 text-violet-300" />
              </span>
            </div>
            <div className="mt-3.5">
              <DemoQrCard demoUrl={demoUrl} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
