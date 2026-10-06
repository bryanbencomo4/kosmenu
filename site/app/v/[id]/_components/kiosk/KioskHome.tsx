'use client';

import { Caveat, Manrope } from 'next/font/google';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronRight, CreditCard, Facebook, Instagram, MapPin, Moon, Music2, ShoppingBag, Star, Sun, Truck, Utensils, X, Youtube } from 'lucide-react';

import {
  DEFAULT_KIOSK_HOME_CONFIG,
  type KioskHomeConfig,
} from '../../../../_lib/kiosk-home-config';
import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { KioskImage } from './KioskImage';
import { pickKioskGreeting } from './kiosk-greetings';
import type { KioskFulfillment } from './kiosk-types';
import type { MenuThemeMode } from '../../_lib/menu-theme';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';

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
  ratingAverage: number;
  ratingCount: number;
  initialLetter: string;
  isOpen: boolean;
  closedCaption: string;
  openCaption: string;
  locationLabel: string | null;
  socialLinks?: Array<{ network: string; href: string }>;
  tagline?: string | null;
  supportsDelivery: boolean;
  themeMode: MenuThemeMode;
  homeConfig?: KioskHomeConfig;
  paymentGroups?: Array<{
    currency: string;
    methods: Array<{ id: string; label: string; details: string }>;
  }>;
  onToggleTheme: () => void;
  onSelect: (fulfillment: KioskFulfillment) => void;
  onBrowseMenu: () => void;
  onOpenCatalog: () => void;
};

export function KioskHome({
  businessName,
  logoUrl,
  ratingAverage,
  ratingCount,
  initialLetter,
  isOpen,
  closedCaption,
  openCaption,
  locationLabel,
  socialLinks = [],
  supportsDelivery,
  themeMode,
  homeConfig = DEFAULT_KIOSK_HOME_CONFIG,
  paymentGroups = [],
  onToggleTheme,
  onSelect,
  onBrowseMenu,
  onOpenCatalog,
}: KioskHomeProps) {
  const [greeting, setGreeting] = useState<string | null>(null);
  const homeRef = useRef<HTMLElement>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [sheetTheme, setSheetTheme] = useState<CSSProperties>({});
  const payableGroups = paymentGroups.filter((group) => group.methods.length > 0);
  const showComerAqui = homeConfig.comerAqui;
  const showParaLlevar = homeConfig.paraLlevar;
  const showDelivery = homeConfig.delivery;
  const fulfillmentCount = Number(showComerAqui) + Number(showParaLlevar) + Number(showDelivery);
  const showBrowse = !isOpen || homeConfig.verMenu || (fulfillmentCount === 0 && !homeConfig.catalogo);
  const mobileCols = fulfillmentCount <= 1 ? 1 : fulfillmentCount === 2 ? 2 : 3;

  useEffect(() => {
    setGreeting(pickKioskGreeting());
  }, []);

  useEffect(() => {
    if (!paymentSheetOpen || !homeRef.current) return;
    const computed = getComputedStyle(homeRef.current);
    const names = [
      '--menu-background',
      '--menu-surface',
      '--menu-surface-alt',
      '--menu-text',
      '--menu-text-muted',
      '--menu-primary',
      '--menu-on-primary',
      '--menu-border',
      '--menu-shadow',
    ];
    const next: Record<string, string> = {};
    for (const name of names) {
      const value = computed.getPropertyValue(name).trim();
      if (value) next[name] = value;
    }
    setSheetTheme(next);
  }, [paymentSheetOpen]);

  return (
    <section ref={homeRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--menu-background)] text-[var(--menu-text)] overscroll-none">
      <KioskDecor />
      <KioskMotionStyles />

      <div className="absolute right-3 top-2 z-20 sm:right-5 sm:top-3">
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--menu-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--menu-text)] shadow-[var(--menu-shadow)]"
          aria-label={themeMode === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          {themeMode === 'dark' ? <Sun className="h-3.5 w-3.5" strokeWidth={2.2} /> : <Moon className="h-3.5 w-3.5" strokeWidth={2.2} />}
          {themeMode === 'dark' ? 'Tema claro' : 'Tema oscuro'}
        </button>
      </div>

      <div className="kiosk-scrollbar relative z-10 mx-auto flex min-h-0 w-full max-w-[560px] flex-1 flex-col overflow-y-auto overscroll-none px-4 py-2 sm:px-5 sm:py-4">
        <div className="my-auto flex w-full flex-col">
          <div className="flex flex-col items-center text-center">
          <p
            aria-live="polite"
            className={`${greetingFont.className} min-h-[1.9rem] max-w-[18rem] px-8 text-[22px] font-semibold leading-6 sm:min-h-[2.6rem] sm:max-w-[26rem] sm:px-2 sm:text-[32px] sm:leading-8`}
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
              className="kiosk-enter mt-1.5 h-[76px] w-[76px] rounded-[20px] bg-[var(--menu-surface)] shadow-[var(--menu-shadow)] sm:mt-3 sm:h-[118px] sm:w-[118px] sm:rounded-[22px]"
            />
          ) : (
            <div
              className="kiosk-enter mt-1.5 grid h-[76px] w-[76px] place-items-center rounded-[20px] text-3xl font-black shadow-[var(--menu-shadow)] sm:mt-3 sm:h-[118px] sm:w-[118px] sm:rounded-[22px] sm:text-4xl"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
            >
              {initialLetter}
            </div>
          )}

          <p className="kiosk-enter mt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--menu-text-muted)] sm:mt-3.5 sm:text-[11px]">
            Menú inteligente
          </p>

          <h1
            className={`${nameFont.className} kiosk-enter mt-0.5 max-w-[min(92vw,28ch)] break-words text-[clamp(24px,7vw,46px)] font-extrabold leading-[1.08] tracking-[-0.04em] text-[var(--menu-text)]`}
            style={{ animationDelay: '80ms' }}
          >
            {businessName}
          </h1>

          {homeConfig.calificacion ? (
          <p
            className="mt-1.5 flex items-center justify-center gap-1 text-[12px] font-semibold text-[var(--menu-text-muted)] sm:mt-2 sm:gap-1.5 sm:text-[13px]"
            aria-label={
              ratingCount > 0
                ? `Calificación ${ratingAverage.toFixed(1)} de 5, ${ratingCount} calificaciones`
                : 'Este comercio aún no tiene calificaciones'
            }
          >
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            {ratingCount > 0 ? (
              <>
                <span className="text-[var(--menu-text)]">{ratingAverage.toFixed(1)}</span>
                <span aria-hidden="true">·</span>
                {ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}
              </>
            ) : (
              'Aún sin calificaciones'
            )}
          </p>
          ) : null}

          {homeConfig.ubicacion && locationLabel ? (
            <p className="mt-1.5 flex max-w-sm items-start justify-center gap-1 text-[12px] font-medium leading-4 text-[var(--menu-text-muted)] sm:mt-2 sm:gap-1.5 sm:text-[13px] sm:leading-5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--menu-primary)' }} />
              <span className="line-clamp-2">{locationLabel}</span>
            </p>
          ) : null}

          {homeConfig.redes && socialLinks.length > 0 ? (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:mt-3 sm:gap-2">
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
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--menu-border)] bg-[var(--menu-surface)] text-[var(--menu-text-muted)] shadow-[var(--menu-shadow)] transition hover:-translate-y-0.5 hover:text-[var(--menu-primary)] sm:h-9 sm:w-9"
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  </a>
                );
              })}
            </div>
          ) : null}

          <div
            className="mt-2 inline-flex max-w-[22rem] items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold leading-4 sm:mt-3 sm:px-3.5 sm:py-1.5 sm:text-sm sm:leading-5"
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

        <div className="mt-4 w-full space-y-2.5 sm:mt-6 sm:space-y-3">
          {showBrowse ? (
            <button
              type="button"
              onClick={onBrowseMenu}
              className="kiosk-card flex min-h-14 w-full items-center gap-3 rounded-[20px] px-3.5 py-3 text-left shadow-[var(--menu-shadow)] sm:min-h-[4.5rem] sm:rounded-[22px]"
              style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)', animationDelay: '80ms' }}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[color-mix(in_srgb,var(--menu-on-primary)_16%,transparent)] sm:h-11 sm:w-11">
                <BookOpen className="h-5 w-5" strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.02rem] font-bold tracking-[-0.02em]">Ver menú</span>
                <span className="mt-0.5 block text-[12px] font-medium opacity-80 sm:text-sm">Consulta los productos, sin pedir</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </button>
          ) : null}

          {homeConfig.catalogo ? (
            <button
              type="button"
              onClick={onOpenCatalog}
              className="kiosk-card flex min-h-14 w-full items-center gap-3 rounded-[20px] bg-[var(--menu-surface)] px-3.5 py-3 text-left text-[var(--menu-text)] shadow-[var(--menu-shadow)] sm:min-h-[4.5rem] sm:rounded-[22px]"
              style={{ animationDelay: '90ms' }}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] sm:h-11 sm:w-11" style={{ backgroundColor: 'color-mix(in srgb, var(--menu-primary) 14%, var(--menu-surface-alt))', color: 'var(--menu-primary)' }}>
                <BookOpen className="h-5 w-5" strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.02rem] font-bold tracking-[-0.02em]">Ver catálogo</span>
                <span className="mt-0.5 block text-[12px] font-medium text-[var(--menu-text-muted)] sm:text-sm">Suma productos y mira cómo pagar.</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </button>
          ) : null}

          {fulfillmentCount > 0 ? (
          <div className={`grid gap-2 sm:hidden ${mobileCols === 1 ? 'grid-cols-1' : mobileCols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {showComerAqui ? (
            <CompactAction
              delayMs={100}
              icon={<Utensils className="h-5 w-5" strokeWidth={2.1} />}
              title="Comer aquí"
              subtitle={isOpen ? 'Pedido para mesa' : 'Disponible cuando abra'}
              onClick={() => onSelect('dine_in')}
              disabled={!isOpen}
            />
            ) : null}
            {showParaLlevar ? (
            <CompactAction
              delayMs={140}
              icon={<ShoppingBag className="h-5 w-5" strokeWidth={2.1} />}
              title="Para llevar"
              subtitle={isOpen ? 'Retiras en el local' : 'Disponible cuando abra'}
              onClick={() => onSelect('takeaway')}
              disabled={!isOpen}
            />
            ) : null}
            {showDelivery ? (
            <CompactAction
              delayMs={180}
              icon={<Truck className="h-5 w-5" strokeWidth={2.1} />}
              title="Delivery"
              subtitle={
                !supportsDelivery
                  ? 'No disponible'
                  : isOpen
                    ? 'A tu dirección'
                    : 'Disponible cuando abra'
              }
              onClick={() => onSelect('delivery')}
              disabled={!isOpen || !supportsDelivery}
            />
            ) : null}
          </div>
          ) : null}

          {fulfillmentCount > 0 ? (
          <div className="hidden grid-cols-1 gap-3 sm:grid">
            {showComerAqui ? (
            <HomeAction
              delayMs={100}
              icon={<Utensils className="h-5 w-5" strokeWidth={2.1} />}
              title="Comer aquí"
              subtitle={isOpen ? 'Te preparamos el pedido para mesa' : 'Disponible cuando el negocio abra'}
              onClick={() => onSelect('dine_in')}
              disabled={!isOpen}
            />
            ) : null}
            {showParaLlevar ? (
            <HomeAction
              delayMs={160}
              icon={<ShoppingBag className="h-5 w-5" strokeWidth={2.1} />}
              title="Para llevar"
              subtitle={isOpen ? 'Retiras en el local cuando esté listo' : 'Disponible cuando el negocio abra'}
              onClick={() => onSelect('takeaway')}
              disabled={!isOpen}
            />
            ) : null}
            {showDelivery ? (
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
            ) : null}
          </div>
          ) : null}

          {homeConfig.verMetodosPago ? (
            <button
              type="button"
              onClick={() => setPaymentSheetOpen(true)}
              className="kiosk-card flex min-h-14 w-full items-center gap-3 rounded-[20px] bg-[var(--menu-surface)] px-3.5 py-3 text-left text-[var(--menu-text)] shadow-[var(--menu-shadow)] sm:min-h-[4.5rem] sm:rounded-[22px]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] sm:h-11 sm:w-11" style={{ backgroundColor: 'color-mix(in srgb, var(--menu-primary) 14%, var(--menu-surface-alt))', color: 'var(--menu-primary)' }}>
                <CreditCard className="h-5 w-5" strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.02rem] font-bold tracking-[-0.02em]">Ver métodos de pago</span>
                <span className="mt-0.5 block text-[12px] font-medium text-[var(--menu-text-muted)] sm:text-sm">Agrupados por moneda</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" />
            </button>
          ) : null}
        </div>
        </div>
      </div>

      <footer className="kiosk-footer-enter relative z-10 mt-0 shrink-0">
        <svg className="block h-5 w-full sm:h-6" viewBox="0 0 1440 48" preserveAspectRatio="none" aria-hidden>
          <path d="M0 28C240 6 480 2 720 10C960 18 1200 32 1440 14V48H0V28Z" fill="var(--menu-primary)" />
        </svg>
        <div
          className="px-5 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-1 text-center"
          style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] opacity-80">Pide a tu manera</p>
          <a
            href="https://elmenuxfa.com"
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-block text-[10px] font-medium tracking-[0.02em] opacity-65"
          >
            Powered by elmenuxfa.com
          </a>
        </div>
      </footer>
      {paymentSheetOpen
        ? createPortal(
            <PaymentMethodsSheet
              groups={payableGroups}
              themeStyle={sheetTheme}
              onClose={() => setPaymentSheetOpen(false)}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

function PaymentMethodsSheet({
  groups,
  themeStyle,
  onClose,
}: {
  groups: Array<{
    currency: string;
    methods: Array<{ id: string; label: string; details: string }>;
  }>;
  themeStyle: CSSProperties;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  const [currency, setCurrency] = useState<string | null>(null);
  const activeCurrency = groups.find((group) => group.currency === currency)?.currency ?? groups[0]?.currency ?? '';
  const methods = groups.find((group) => group.currency === activeCurrency)?.methods ?? [];

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4"
      style={{ ...themeStyle, paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-payment-methods-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-[24px] text-[var(--menu-text,#111111)] shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:max-h-[min(88vh,760px)]"
        style={{ backgroundColor: 'var(--menu-surface, #ffffff)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4 sm:px-6">
          <div className="min-w-0 pr-2">
            <h2 id="home-payment-methods-title" className="text-xl font-extrabold leading-tight sm:text-2xl">
              Métodos de pago
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--menu-text-muted, #6b7280)' }}>
              Agrupados por moneda
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 [touch-action:pan-y]">
          {groups.length === 0 ? (
            <p className="rounded-[18px] px-4 py-6 text-center text-sm" style={{ backgroundColor: 'var(--menu-surface-alt, #f3f4f6)', color: 'var(--menu-text-muted, #6b7280)' }}>
              Este comercio no publicó métodos de pago.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.length > 1 ? (
                <div className="flex gap-2" role="group" aria-label="Moneda de pago">
                  {groups.map((group) => {
                    const isSelected = group.currency === activeCurrency;
                    return (
                      <button
                        key={group.currency}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setCurrency(group.currency)}
                        className="min-h-11 flex-1 rounded-2xl px-2 text-sm font-bold"
                        style={
                          isSelected
                            ? { backgroundColor: 'var(--menu-primary, #111111)', color: 'var(--menu-on-primary, #ffffff)' }
                            : { backgroundColor: 'var(--menu-surface-alt, #f3f4f6)', color: 'var(--menu-text-muted, #6b7280)' }
                        }
                      >
                        {group.currency === 'VES' ? 'Bs (VES)' : group.currency}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {methods.map((method) => (
                <div
                  key={method.id}
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    backgroundColor: 'var(--menu-surface-alt, #f3f4f6)',
                    borderColor: 'var(--menu-border, #e5e7eb)',
                  }}
                >
                  <p className="text-[15px] font-bold">{method.label}</p>
                  {method.details ? (
                    <p className="mt-1 text-sm leading-6" style={{ color: 'var(--menu-text-muted, #6b7280)' }}>
                      {method.details}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactAction({
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
      className={`kiosk-card flex min-h-[6.6rem] flex-col items-center justify-center rounded-[18px] bg-[var(--menu-surface)] px-1.5 py-2.5 text-center shadow-[var(--menu-shadow)] ${
        disabled ? 'cursor-not-allowed opacity-70' : 'transition duration-200 ease-out active:scale-[0.98]'
      }`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-[12px]"
        style={
          disabled
            ? { backgroundColor: 'var(--menu-surface-alt)', color: 'var(--menu-text-muted)' }
            : { backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }
        }
      >
        {icon}
      </span>
      <span
        className={`mt-1.5 text-[12px] font-bold leading-4 tracking-[-0.02em] ${
          disabled ? 'text-[var(--menu-text-muted)]' : 'text-[var(--menu-text)]'
        }`}
      >
        {title}
      </span>
      <span className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-3 text-[var(--menu-text-muted)]">
        {subtitle}
      </span>
    </button>
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
