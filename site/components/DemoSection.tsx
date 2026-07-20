'use client';

import { useEffect, useState } from 'react';
import { Link2, QrCode, Sparkles, UtensilsCrossed } from 'lucide-react';
import { publicSiteUrl } from '../app/_lib/public-site-config';
import { DemoTableTent } from './demo/DemoTableTent';
import { ClientViewCard, NoCameraCard } from './demo/DemoSideCards';

const DEMO_PATH = '/v/demo';
const DEMO_DISPLAY_URL = 'elmenuxfa.com/v/demo';

const DEMO_STEPS = [
  {
    number: 1,
    icon: QrCode,
    title: 'Escanea el QR',
    description: 'Usa la cámara del celular para abrir el demo al instante.',
  },
  {
    number: 2,
    icon: UtensilsCrossed,
    title: 'Explora el menú',
    description: 'Ve categorías, productos, precios y el flujo de pedido.',
  },
  {
    number: 3,
    icon: Link2,
    title: 'Si no puedes escanear',
    description: 'Usa el botón directo para abrir el enlace manualmente.',
  },
] as const;

function StepsList() {
  return (
    <div className="space-y-3">
      {DEMO_STEPS.map((step) => {
        const Icon = step.icon;
        return (
          <div
            key={step.number}
            className="flex items-start gap-3.5 rounded-[1.1rem] border border-white/10 bg-white/[0.03] p-3.5"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-300 text-[0.78rem] font-bold text-[#1a102e]">
              {step.number}
            </span>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/12 text-violet-200">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.88rem] font-semibold leading-snug text-white">{step.title}</p>
              <p className="mt-0.5 text-[0.76rem] leading-relaxed text-slate-400">{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DemoSection() {
  const [demoUrl, setDemoUrl] = useState(`${publicSiteUrl}${DEMO_PATH}`);

  useEffect(() => {
    setDemoUrl(`${window.location.origin}${DEMO_PATH}`);
  }, []);

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
      </div>

      <div className="relative mx-auto max-w-[1480px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8 xl:py-16">
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(330px,0.85fr)_minmax(500px,1.35fr)_minmax(330px,0.85fr)] xl:items-center xl:gap-9">
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-100">
              <Sparkles className="h-3.5 w-3.5 text-[#c4b5fd]" />
              Demo real
            </span>
            <h2 className="relative mt-5 font-[var(--font-display)] text-[2.35rem] font-black leading-[0.95] tracking-[-0.04em] text-white sm:text-[2.9rem] xl:text-[3.2rem]">
              <span className="block whitespace-nowrap">Escanea y vive</span>
              <span className="mt-1 block whitespace-nowrap bg-[linear-gradient(180deg,#e9d5ff_0%,#c084fc_42%,#7c3aed_100%)] bg-clip-text text-transparent">
                la experiencia
              </span>
            </h2>
            <p className="mt-4 max-w-[27rem] text-[1rem] leading-[1.6] text-slate-300/88 sm:text-[1.05rem]">
              Muestra a tus clientes cómo funciona tu menú digital: escanean el Table Tent, abren el demo al instante y
              exploran la experiencia real desde su celular.
            </p>

            <div className="mt-6 hidden xl:block">
              <StepsList />
            </div>
          </div>

          <div className="w-full">
            <DemoTableTent demoPath={DEMO_PATH} />
          </div>

          <div className="relative space-y-3.5">
            <div className="xl:hidden">
              <StepsList />
            </div>
            <div className="mt-6 space-y-4 xl:mt-0 xl:space-y-3.5">
              <ClientViewCard />
              <NoCameraCard demoUrl={demoUrl} demoPath={DEMO_PATH} displayUrl={DEMO_DISPLAY_URL} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
