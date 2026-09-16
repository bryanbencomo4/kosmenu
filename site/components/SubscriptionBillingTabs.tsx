'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, QrCode, Settings2, Sparkles, UtensilsCrossed } from 'lucide-react';

type BillingCycle = 'monthly' | 'annual';

type SubscriptionBillingTabsProps = {
  signupHref: string;
};

const kitIncludes = [
  { label: '4 portamenús físicos premium', icon: UtensilsCrossed },
  { label: 'QR personalizado de tu restaurante', icon: QrCode },
  { label: 'Diseño inicial de tu menú', icon: Sparkles },
  { label: 'Configuración completa del restaurante', icon: Settings2 },
] as const;

const platformIncludes = [
  'Actualización ilimitada del menú',
  'Cambios de precios y productos',
  'Promociones',
  'Gestión digital del restaurante',
  'Soporte',
] as const;

function StackedCoins({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <ellipse cx="12" cy="17.2" rx="7.2" ry="2.6" fill="#FACC15" opacity="0.35" />
      <ellipse cx="12" cy="14.4" rx="7.2" ry="2.6" fill="#FACC15" opacity="0.55" />
      <ellipse cx="12" cy="11.4" rx="7.2" ry="2.6" fill="#FDE68A" />
      <ellipse cx="12" cy="10.4" rx="7.2" ry="2.6" fill="#FACC15" />
      <path d="M8.2 10.4c.7.7 2.1 1.2 3.8 1.2s3.1-.5 3.8-1.2" stroke="#CA8A04" strokeWidth="1.1" />
    </svg>
  );
}

export function SubscriptionBillingTabs({ signupHref }: SubscriptionBillingTabsProps) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const isMonthly = cycle === 'monthly';

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,20,36,0.98),rgba(8,13,24,0.98))] px-5 py-6 shadow-[0_40px_110px_-54px_rgba(0,0,0,1)] sm:px-7 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[12%] top-0 h-px w-24 bg-[linear-gradient(90deg,transparent,#c084fc,transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-8%] top-[-20%] h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.22)_0%,transparent_70%)] blur-2xl"
      />

      <div
        role="tablist"
        aria-label="Frecuencia de la plataforma"
        className="relative mx-auto grid max-w-[18rem] grid-cols-2 rounded-full border border-white/12 bg-white/[0.04] p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isMonthly}
          onClick={() => setCycle('monthly')}
          className={`rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-300 ${
            isMonthly
              ? 'bg-[#FACC15] text-[#0B0F1A] shadow-[0_12px_30px_-16px_rgba(250,204,21,0.95)]'
              : 'bg-transparent text-slate-400 hover:text-white'
          }`}
        >
          Mensual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isMonthly}
          onClick={() => setCycle('annual')}
          className={`rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-300 ${
            !isMonthly
              ? 'bg-[#FACC15] text-[#0B0F1A] shadow-[0_12px_30px_-16px_rgba(250,204,21,0.95)]'
              : 'bg-transparent text-slate-400 hover:text-white'
          }`}
        >
          Anual
        </button>
      </div>

      <div className="relative mt-6 text-center" role="tabpanel">
        {isMonthly ? (
          <>
            <p className="font-[var(--font-display)] text-[3.6rem] font-black leading-none tracking-[-0.07em] text-white sm:text-[4.4rem]">
              $10
              <span className="ml-1 align-middle text-[1.05rem] font-semibold tracking-normal text-slate-300">
                / mes
              </span>
            </p>
            <p className="mt-3 text-[0.98rem] font-medium text-slate-200">
              Plataforma + kit de 4 portamenús para empezar.
            </p>
            <div className="mx-auto mt-5 flex max-w-lg items-start gap-3 rounded-[1.15rem] border border-[#FACC15]/35 bg-[#FACC15]/8 px-4 py-3.5 text-left shadow-[0_0_28px_-12px_rgba(250,204,21,0.7)]">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FACC15]/15 text-[#FACC15]">
                <StackedCoins className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[1.02rem] font-bold text-[#FACC15]">Solo $0.33 al día</p>
                <p className="mt-0.5 text-sm leading-5 text-slate-300/90">
                  Menos de 35 centavos al día para modernizar tu restaurante.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="font-[var(--font-display)] text-[3.6rem] font-black leading-none tracking-[-0.07em] text-white sm:text-[4.4rem]">
              $90
              <span className="ml-1 align-middle text-[1.05rem] font-semibold tracking-normal text-slate-300">
                / año
              </span>
            </p>
            <p className="mt-3 text-[0.98rem] font-semibold text-[#FACC15]">
              Ahorras $30 frente al pago mensual.
            </p>
            <div className="mx-auto mt-4 grid max-w-md grid-cols-3 gap-2 text-center text-[0.78rem] sm:text-[0.82rem]">
              <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-2 py-3">
                <p className="text-slate-400">Mensual</p>
                <p className="mt-1 font-bold text-white">$120/año</p>
              </div>
              <div className="rounded-[1rem] border border-[#FACC15]/30 bg-[#FACC15]/10 px-2 py-3">
                <p className="text-[#FDE68A]">Anual</p>
                <p className="mt-1 font-bold text-white">$90/año</p>
              </div>
              <div className="rounded-[1rem] border border-violet-400/20 bg-violet-500/10 px-2 py-3">
                <p className="text-violet-200">Ahorro</p>
                <p className="mt-1 font-bold text-[#FACC15]">$30</p>
              </div>
            </div>
            <div className="mx-auto mt-5 flex max-w-lg items-start gap-3 rounded-[1.15rem] border border-[#FACC15]/35 bg-[#FACC15]/8 px-4 py-3.5 text-left shadow-[0_0_28px_-12px_rgba(250,204,21,0.7)]">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FACC15]/15 text-[#FACC15]">
                <StackedCoins className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[1.02rem] font-bold text-[#FACC15]">≈ $0.25 al día</p>
                <p className="mt-0.5 text-sm leading-5 text-slate-300/90">
                  Tu menú inteligente por aproximadamente 25 centavos al día.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mx-auto mt-7 max-w-lg rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-4 py-4 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FDE68A]">
          Incluye tu Kit Portamenú Inteligente
        </p>
        <ul className="mt-3 space-y-2.5">
          {kitIncludes.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label} className="flex items-center gap-3 text-[0.92rem] text-slate-100">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-400/25 bg-violet-500/12 text-violet-200">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="font-medium">{item.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="mx-auto mt-5 max-w-lg space-y-3">
        {platformIncludes.map((item) => (
          <li key={item} className="flex items-center gap-3 text-[0.95rem] leading-5 text-slate-100">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C3AED] text-white shadow-[0_0_16px_rgba(124,58,237,0.45)]">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Link
        href={signupHref}
        className="mt-7 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-full bg-[#FACC15] px-4 py-3 text-center text-[0.98rem] font-bold leading-tight text-[#0B0F1A] shadow-[0_22px_50px_-24px_rgba(250,204,21,0.9)] transition-all duration-300 hover:bg-[#fde047]"
      >
        Quiero mi Kit Menú Inteligente
        <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="relative mt-7 pt-6">
        <div className="absolute inset-x-0 top-0 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/12" />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Formas de pago
          </span>
          <span className="h-px flex-1 bg-white/12" />
        </div>

        <div className="flex items-center gap-4 pt-4 sm:gap-5">
          <div className="relative h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-full bg-black ring-1 ring-white/15 sm:h-[4.75rem] sm:w-[4.75rem]">
            <Image
              src="/branding/bcv-seal.jpg"
              alt="Sello del Banco Central de Venezuela"
              width={1024}
              height={1024}
              quality={100}
              unoptimized
              className="h-full w-full object-cover"
            />
          </div>
          <span aria-hidden="true" className="h-12 w-px bg-white/20" />
          <div className="min-w-0">
            <div className="flex items-start gap-2.5">
              <span
                role="img"
                aria-label="Bandera de Venezuela"
                className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-[1.75rem] leading-none"
              >
                <img
                  src="/branding/flag-ve-emoji.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="h-7 w-7"
                />
              </span>
              <p className="text-[0.92rem] font-semibold leading-5 text-white sm:text-[0.98rem]">
                Pagos disponibles en bolívares
                <span className="mt-0.5 block text-[#FACC15]">a tasa BCV oficial</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
