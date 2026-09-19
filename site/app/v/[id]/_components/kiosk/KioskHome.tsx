'use client';

import { Caveat, Manrope } from 'next/font/google';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, MapPin, ShoppingBag, Truck, Utensils } from 'lucide-react';

import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { KioskImage } from './KioskImage';
import { pickKioskGreeting } from './kiosk-greetings';
import type { KioskFulfillment } from './kiosk-types';

const greetingFont = Caveat({
  subsets: ['latin'],
  weight: ['500', '600'],
});

const nameFont = Manrope({
  subsets: ['latin'],
  weight: ['700', '800'],
});

type KioskHomeProps = {
  businessName: string;
  logoUrl: string | null;
  initialLetter: string;
  isOpen: boolean;
  closedCaption: string;
  openCaption: string;
  locationLabel: string | null;
  tagline?: string | null;
  supportsDelivery: boolean;
  onSelect: (fulfillment: KioskFulfillment) => void;
};

export function KioskHome({
  businessName,
  logoUrl,
  initialLetter,
  isOpen,
  closedCaption,
  openCaption,
  locationLabel,
  supportsDelivery,
  onSelect,
}: KioskHomeProps) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(pickKioskGreeting());
  }, []);

  return (
    <section className="relative flex min-h-[100dvh] flex-col overflow-x-hidden overflow-y-auto bg-[var(--menu-background)] text-[var(--menu-text)]">
      <KioskDecor />
      <KioskMotionStyles />

      <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-5 pb-3 pt-7 sm:pt-8">
        <div className="flex flex-col items-center text-center">
          <p
            aria-live="polite"
            className={`${greetingFont.className} min-h-[2.4rem] max-w-[20rem] px-2 text-[24px] font-semibold leading-7 sm:min-h-[2.8rem] sm:max-w-[26rem] sm:text-[32px] sm:leading-8`}
            style={{ color: 'color-mix(in srgb, var(--menu-primary) 78%, #3f2f22)' }}
          >
            {greeting ? (
              <span className="kiosk-enter inline-block" style={{ animationDelay: '40ms' }}>
                {greeting}
              </span>
            ) : null}
          </p>

          {logoUrl ? (
            <KioskImage
              src={logoUrl}
              alt={`Logo de ${businessName}`}
              className="kiosk-enter mt-3 h-[96px] w-[96px] rounded-[22px] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] sm:h-[118px] sm:w-[118px]"
            />
          ) : (
            <div
              className="kiosk-enter mt-3 grid h-[96px] w-[96px] place-items-center rounded-[22px] text-3xl font-black text-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] sm:h-[118px] sm:w-[118px] sm:text-4xl"
              style={{ backgroundColor: 'var(--menu-primary)' }}
            >
              {initialLetter}
            </div>
          )}

          <p className="kiosk-enter mt-3.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
            <span className="hidden h-px w-8 bg-slate-300 sm:block" />
            Menú inteligente
            <span className="hidden h-px w-8 bg-slate-300 sm:block" />
          </p>

          <h1
            className={`${nameFont.className} kiosk-enter mt-1.5 line-clamp-2 max-w-[16ch] text-[32px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#111827] sm:text-[46px]`}
            style={{ animationDelay: '80ms' }}
          >
            {businessName}
          </h1>

          {locationLabel ? (
            <p className="mt-2 flex max-w-sm items-start justify-center gap-1.5 text-[13px] font-medium leading-5 text-slate-500">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--menu-primary)' }} />
              <span className="line-clamp-2">{locationLabel}</span>
            </p>
          ) : null}

          <div
            className="mt-3 inline-flex max-w-[20rem] items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold leading-5"
            style={
              isOpen
                ? { backgroundColor: '#ECFDF5', color: '#047857' }
                : { backgroundColor: '#FEF2F2', color: '#B91C1C' }
            }
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>{isOpen ? openCaption || 'Abierto ahora' : closedCaption || 'Cerrado'}</span>
          </div>
        </div>

        <div className="mt-6 grid w-full gap-3">
          <HomeAction
            delayMs={100}
            icon={<Utensils className="h-5 w-5" strokeWidth={2.1} />}
            title="Comer aquí"
            subtitle="Te preparamos el pedido para mesa"
            onClick={() => onSelect('dine_in')}
            disabled={!isOpen}
          />
          <HomeAction
            delayMs={160}
            icon={<ShoppingBag className="h-5 w-5" strokeWidth={2.1} />}
            title="Para llevar"
            subtitle="Retiras en el local cuando esté listo"
            onClick={() => onSelect('takeaway')}
            disabled={!isOpen}
          />
          <HomeAction
            delayMs={220}
            icon={<Truck className="h-5 w-5" strokeWidth={2.1} />}
            title="Delivery"
            subtitle={supportsDelivery ? 'Lo enviamos a tu dirección' : 'Este negocio no tiene delivery'}
            onClick={() => onSelect('delivery')}
            disabled={!isOpen || !supportsDelivery}
          />
        </div>
      </div>

      <footer className="kiosk-footer-enter relative z-10 mt-4">
        <svg className="block h-6 w-full" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
          <path d="M0 28C240 6 480 2 720 10C960 18 1200 32 1440 14V48H0V28Z" fill="var(--menu-primary)" />
        </svg>
        <div
          className="px-5 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-1 text-center"
          style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] opacity-80">Pide a tu manera</p>
          <a
            href="https://elmenuxfa.com"
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[10px] font-medium tracking-[0.02em] opacity-65"
          >
            Powered by elmenuxfa.com
          </a>
        </div>
      </footer>

    </section>
  );
}

function HomeAction({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
  delayMs,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
  delayMs: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="kiosk-card group flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-[22px] bg-white px-3.5 py-3 text-left shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_34px_rgba(15,23,42,0.09)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-white sm:h-12 sm:w-12"
        style={{ backgroundColor: 'var(--menu-primary)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.02rem] font-bold tracking-[-0.02em] text-[#111827]">{title}</span>
        <span className="mt-0.5 block text-sm font-medium text-slate-500">{subtitle}</span>
      </span>
      <ChevronRight className="kiosk-chevron h-5 w-5 shrink-0" style={{ color: 'var(--menu-primary)' }} />
    </button>
  );
}

