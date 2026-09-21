'use client';

import { Caveat, Manrope } from 'next/font/google';
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, ChevronRight, Facebook, Instagram, MapPin, Moon, Music2, ShoppingBag, Sun, Truck, Utensils, Youtube } from 'lucide-react';

import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { KioskImage } from './KioskImage';
import { pickKioskGreeting } from './kiosk-greetings';
import type { KioskFulfillment } from './kiosk-types';
import type { MenuThemeMode } from '../../_lib/menu-theme';

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
  socialLinks?: Array<{ network: string; href: string }>;
  tagline?: string | null;
  supportsDelivery: boolean;
  themeMode: MenuThemeMode;
  onToggleTheme: () => void;
  onSelect: (fulfillment: KioskFulfillment) => void;
  onBrowseMenu: () => void;
};

export function KioskHome({
  businessName,
  logoUrl,
  initialLetter,
  isOpen,
  closedCaption,
  openCaption,
  locationLabel,
  socialLinks = [],
  supportsDelivery,
  themeMode,
  onToggleTheme,
  onSelect,
  onBrowseMenu,
}: KioskHomeProps) {
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    setGreeting(pickKioskGreeting());
  }, []);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[var(--menu-background)] text-[var(--menu-text)]">
      <KioskDecor />
      <KioskMotionStyles />

      <div className="absolute right-4 top-3 z-20 sm:right-5">
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--menu-surface)] px-3 py-1.5 text-xs font-bold text-[var(--menu-text)] shadow-[var(--menu-shadow)]"
          aria-label={themeMode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          {themeMode === 'dark' ? <Sun className="h-3.5 w-3.5" strokeWidth={2.2} /> : <Moon className="h-3.5 w-3.5" strokeWidth={2.2} />}
          {themeMode === 'dark' ? 'Tema claro' : 'Tema oscuro'}
        </button>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-5 pb-3 pt-14 sm:pt-10">
        <div className="flex flex-col items-center text-center">
          <p
            aria-live="polite"
            className={`${greetingFont.className} min-h-[2.4rem] max-w-[20rem] px-2 text-[24px] font-semibold leading-7 sm:min-h-[2.8rem] sm:max-w-[26rem] sm:text-[32px] sm:leading-8`}
            style={{ color: 'color-mix(in srgb, var(--menu-primary) 72%, var(--menu-text))' }}
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
              className="kiosk-enter mt-3 h-[96px] w-[96px] rounded-[22px] bg-[var(--menu-surface)] shadow-[var(--menu-shadow)] sm:h-[118px] sm:w-[118px]"
            />
          ) : (
            <div
            className="kiosk-enter mt-3 grid h-[96px] w-[96px] place-items-center rounded-[22px] text-3xl font-black shadow-[var(--menu-shadow)] sm:h-[118px] sm:w-[118px] sm:text-4xl"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {initialLetter}
            </div>
          )}

          <p className="kiosk-enter mt-3.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--menu-text-muted)]">
            <span className="hidden h-px w-8 bg-[var(--menu-border)] sm:block" />
            Menú inteligente
            <span className="hidden h-px w-8 bg-[var(--menu-border)] sm:block" />
          </p>

          <h1
            className={`${nameFont.className} kiosk-enter mt-1.5 max-w-[min(92vw,28ch)] break-words text-[clamp(28px,8vw,46px)] font-extrabold leading-[1.08] tracking-[-0.04em] text-[var(--menu-text)]`}
            style={{ animationDelay: '80ms' }}
          >
            {businessName}
          </h1>

          {locationLabel ? (
            <p className="mt-2 flex max-w-sm items-start justify-center gap-1.5 text-[13px] font-medium leading-5 text-[var(--menu-text-muted)]">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--menu-primary)' }} />
              <span className="line-clamp-2">{locationLabel}</span>
            </p>
          ) : null}

          {socialLinks.length > 0 ? (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {socialLinks.map(({ network, href }) => {
                const Icon = network === 'instagram'
                  ? Instagram
                  : network === 'facebook'
                    ? Facebook
                    : network === 'youtube'
                      ? Youtube
                      : Music2;
                const label = network === 'instagram'
                  ? 'Instagram'
                  : network === 'facebook'
                    ? 'Facebook'
                    : network === 'youtube'
                      ? 'YouTube'
                      : 'TikTok';
                return (
                  <a
                    key={`${network}-${href}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface)] text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)] transition hover:-translate-y-0.5 hover:text-[var(--menu-primary)]"
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  </a>
                );
              })}
            </div>
          ) : null}

          <div
            className="mt-3 inline-flex max-w-[20rem] items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold leading-5"
            style={
              isOpen
                ? {
                    backgroundColor: 'color-mix(in srgb, #10B981 16%, var(--menu-surface))',
                    color: 'color-mix(in srgb, #059669 70%, var(--menu-text))',
                  }
                : {
                    backgroundColor: 'color-mix(in srgb, #F43F5E 16%, var(--menu-surface))',
                    color: 'color-mix(in srgb, #E11D48 72%, var(--menu-text))',
                  }
            }
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>{isOpen ? openCaption || 'Abierto ahora' : closedCaption || 'Cerrado'}</span>
          </div>
        </div>

        <div className="mt-6 grid w-full gap-3">
          {!isOpen ? (
            <HomeAction
              delayMs={80}
              icon={<BookOpen className="h-5 w-5" strokeWidth={2.1} />}
              title="Ver menú"
              subtitle="Consulta los productos. Los pedidos se habilitan al abrir"
              onClick={onBrowseMenu}
            />
          ) : null}
          <HomeAction
            delayMs={100}
            icon={<Utensils className="h-5 w-5" strokeWidth={2.1} />}
            title="Comer aquí"
            subtitle={isOpen ? 'Te preparamos el pedido para mesa' : 'Disponible cuando el negocio abra'}
            onClick={() => onSelect('dine_in')}
            disabled={!isOpen}
          />
          <HomeAction
            delayMs={160}
            icon={<ShoppingBag className="h-5 w-5" strokeWidth={2.1} />}
            title="Para llevar"
            subtitle={isOpen ? 'Retiras en el local cuando esté listo' : 'Disponible cuando el negocio abra'}
            onClick={() => onSelect('takeaway')}
            disabled={!isOpen}
          />
          <HomeAction
            delayMs={220}
            icon={<Truck className="h-5 w-5" strokeWidth={2.1} />}
            title="Delivery"
            subtitle={
              !supportsDelivery
                ? 'Este negocio no tiene delivery'
                : isOpen
                  ? 'Lo enviamos a tu dirección'
                  : 'Disponible cuando el negocio abra'
            }
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
      aria-disabled={disabled}
      className={`kiosk-card group flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-[22px] bg-[var(--menu-surface)] px-3.5 py-3 text-left shadow-[var(--menu-shadow)] ${
        disabled ? 'cursor-not-allowed' : 'transition duration-200 ease-out hover:-translate-y-0.5'
      }`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] sm:h-12 sm:w-12"
        style={
          disabled
            ? { backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }
            : { backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[1.02rem] font-bold tracking-[-0.02em] ${
            disabled ? 'text-[var(--menu-text-muted)]' : 'text-[var(--menu-text)]'
          }`}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-sm font-medium text-[var(--menu-text-muted)]">{subtitle}</span>
      </span>
      {disabled ? null : (
        <ChevronRight className="kiosk-chevron h-5 w-5 shrink-0" style={{ color: 'var(--menu-primary)' }} />
      )}
    </button>
  );
}

