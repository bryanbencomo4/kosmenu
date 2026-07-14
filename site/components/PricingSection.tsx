import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Gift,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Wrench,
} from 'lucide-react';

import { marketingWhatsappHref } from '../app/_lib/public-site-config';

type PricingSectionProps = {
  whatsappHref: string;
};

const freeIncludes = [
  '1 Table Tent acrílico 4x6 incluido',
  'Menú digital para tu restaurante',
  'Código QR único',
  'Soporte inicial de configuración',
] as const;

const leftHighlights = [
  { label: 'Sin instalación paga', icon: Wrench },
  { label: 'QR personalizado', icon: QrCode },
  { label: 'Actualización fácil del menú', icon: RefreshCw },
] as const;

const trustItems = [
  { label: 'Instalación gratis', icon: ShieldCheck, highlight: null },
  { label: '1 Table Tent incluido', icon: Gift, highlight: null },
  { label: 'QR personalizado', icon: QrCode, highlight: null },
  { labelPrefix: 'Adicionales desde ', highlight: '$3.99', icon: Sparkles },
] as const;

function AcrylicLStandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 8.5h12.5c1.4 0 2.5 1.1 2.5 2.5v20.5" />
      <path d="M16 8.5v23" />
      <path d="M13.5 31.5h24c1.4 0 2.5 1.1 2.5 2.5v2.2c0 1.1-.9 2-2 2H15.5c-1.1 0-2-.9-2-2v-2.2c0-1.4 1.1-2.5 2.5-2.5Z" />
      <path d="M28.5 12.5v16.5" opacity="0.55" />
      <path d="M16 12.5h10.5" opacity="0.35" />
      <path d="M16 17h10.5" opacity="0.35" />
    </svg>
  );
}

export function PricingSection({ whatsappHref }: PricingSectionProps) {
  const resolvedWhatsappHref =
    whatsappHref && whatsappHref !== '#' && whatsappHref !== '#cta' && whatsappHref !== 'javascript:void(0)'
      ? whatsappHref
      : marketingWhatsappHref;

  return (
    <section id="pricing" className="perf-section relative overflow-hidden border-b border-white/8 bg-[#050916]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-12%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.16)_0%,transparent_70%)] blur-3xl" />
        <div className="absolute right-[-10%] bottom-[8%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.08)_0%,transparent_70%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-[56rem] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-200">
            <Star className="h-3.5 w-3.5 fill-violet-300/40" />
            Precio simple
          </span>

          <h2 className="mx-auto mt-5 max-w-[56rem] font-[var(--font-display)] text-[1.9rem] font-black leading-[1.05] tracking-[-0.045em] text-white sm:text-[2.7rem] lg:text-[3.4rem]">
            <span className="block">Todo lo que necesitas</span>
            <span className="block">
              para empezar por solo <span className="text-[#FACC15]">$10</span>
              <span className="text-white">/mes</span>
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7">
            Instalación gratis, 1 Table Tent acrílico 4x6 de regalo y sin complicaciones para tus clientes.
          </p>
        </div>

        <div className="relative mx-auto mt-10 overflow-hidden rounded-[1.5rem] border border-violet-400/18 bg-[linear-gradient(180deg,rgba(14,20,36,0.98),rgba(8,13,24,0.98))] shadow-[0_40px_110px_-54px_rgba(0,0,0,1)] lg:mt-12">
          <div className="grid lg:grid-cols-[minmax(0,0.47fr)_minmax(0,0.53fr)]">
            <div className="flex flex-col px-5 py-6 sm:px-7 sm:py-8 lg:px-8 lg:py-9">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-400/22 bg-violet-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">
                <Star className="h-3.5 w-3.5 fill-violet-300/35" />
                Plan único
              </span>

              <div className="mt-5 flex items-end gap-2">
                <span className="font-[var(--font-display)] text-[5.2rem] font-black leading-none tracking-[-0.07em] text-white sm:text-[6.5rem] lg:text-[7rem]">
                  $10
                </span>
                <span className="mb-3 text-[1.15rem] font-semibold text-slate-300 sm:mb-4 sm:text-[1.35rem]">/mes</span>
              </div>

              <p className="mt-2 inline-flex items-center gap-2 text-[0.98rem] font-semibold text-[#FACC15]">
                <Gift className="h-4 w-4" />
                Instalación 100% gratis
              </p>

              <p className="mt-4 max-w-[22rem] text-[0.92rem] leading-6 text-slate-300/90 sm:text-[0.98rem] sm:leading-7">
                Empieza a vender con tu menú digital, QR personalizado y soporte inicial sin costo de instalación.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href={resolvedWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-[0.9rem] bg-[#FACC15] px-5 text-[0.98rem] font-bold text-[#0B0F1A] shadow-[0_22px_50px_-24px_rgba(250,204,21,0.9)] transition-all duration-300 hover:bg-[#fde047]"
                >
                  Solicitar activación
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={resolvedWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-[0.9rem] border border-white/14 bg-transparent px-5 text-[0.98rem] font-semibold text-white transition-all duration-300 hover:border-violet-300/30 hover:bg-white/[0.04]"
                >
                  <MessageCircle className="h-4 w-4" />
                  Hablar por WhatsApp
                </Link>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-2 border-t border-white/8 pt-5">
                {leftHighlights.map(({ label, icon: Icon }, index) => (
                  <div
                    key={label}
                    className={`flex flex-col items-center gap-2 px-1 text-center ${
                      index < leftHighlights.length - 1 ? 'border-r border-white/8' : ''
                    }`}
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/12 text-violet-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[0.72rem] font-medium leading-4 text-slate-300 sm:text-[0.78rem]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative border-t border-white/8 px-5 py-6 sm:px-7 sm:py-8 lg:border-l lg:border-t-0 lg:px-8 lg:py-9">
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 z-20 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-violet-300/35 bg-[#15102b] text-lg font-bold text-violet-200 shadow-[0_0_24px_rgba(139,92,246,0.45)] lg:left-0 lg:flex"
              >
                +
              </div>

              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] sm:items-start">
                <div>
                  <p className="text-[1.05rem] font-semibold text-white">Incluye gratis</p>
                  <ul className="mt-4 space-y-3">
                    {freeIncludes.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[0.9rem] leading-5 text-slate-200/92">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/25">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="relative mx-auto w-full max-w-[13.5rem] sm:mx-0 sm:max-w-none">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-2 bottom-2 h-20 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.45)_0%,transparent_70%)] blur-2xl"
                  />
                  <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.15rem]">
                    <Image
                      src="/branding/table-tent.png"
                      alt="Table Tent acrílico tipo L con diseño Escanea y Ordena de elmenuxfa"
                      fill
                      sizes="(max-width: 640px) 220px, 240px"
                      className="object-contain object-center drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-3.5 rounded-[1.15rem] border border-violet-400/28 bg-[linear-gradient(180deg,rgba(42,24,84,0.72),rgba(22,14,46,0.88))] px-4 py-4 sm:gap-4 sm:px-5">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.95rem] border border-violet-300/30 bg-violet-500/10 text-violet-200 shadow-[0_0_22px_rgba(139,92,246,0.28)]">
                  <AcrylicLStandIcon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
                    <p className="text-[0.98rem] font-semibold text-white">Carteles adicionales</p>
                    <p className="font-[var(--font-display)] text-[1.55rem] font-black leading-none tracking-[-0.04em] text-[#FACC15]">
                      $3.99
                      <span className="ml-1 text-[0.85rem] font-semibold tracking-normal text-white">c/u</span>
                    </p>
                  </div>
                  <p className="mt-2 text-[0.82rem] leading-5 text-slate-300/90 sm:text-[0.88rem] sm:leading-6">
                    Cada cartel acrílico adicional impreso por ambas caras tiene un costo de $3.99.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-5 grid max-w-[1240px] grid-cols-2 overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,20,36,0.94),rgba(10,15,28,0.96))] sm:mt-6 lg:flex lg:rounded-[1.15rem]">
          {trustItems.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={'label' in item ? item.label : `${item.labelPrefix}${item.highlight}`}
                className={`flex items-center gap-3 px-4 py-3.5 text-[0.84rem] text-slate-200/92 sm:px-5 sm:text-sm lg:flex-1 lg:justify-center ${
                  index % 2 === 0 ? 'border-r border-white/8' : ''
                } ${index < 2 ? 'border-b border-white/8 lg:border-b-0' : ''} ${
                  index < trustItems.length - 1 ? 'lg:border-r' : ''
                } border-white/8`}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-400/22 bg-violet-500/12 text-violet-200">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-medium leading-5">
                  {'label' in item ? (
                    item.label
                  ) : (
                    <>
                      {item.labelPrefix}
                      <span className="text-[#FACC15]">{item.highlight}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
