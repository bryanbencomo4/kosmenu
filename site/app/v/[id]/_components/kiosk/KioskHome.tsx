'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  Banknote,
  Bitcoin,
  Building2,
  CreditCard,
  Facebook,
  Instagram,
  Moon,
  Music2,
  Smartphone,
  Sun,
  Wallet,
  X,
  Youtube,
} from 'lucide-react';

import {
  DEFAULT_KIOSK_HOME_CONFIG,
  type KioskHomeConfig,
} from '../../../../_lib/kiosk-home-config';
import type { PaymentDisplayField } from '../../../../_lib/payment-method-display';
import {
  isCashPaymentMethodLabel,
  paymentMethodIconKindFromText,
} from '../../../../_lib/payment-method-display';
import { PaymentCopyFields } from '../PaymentCopyFields';
import { KioskDecor, KioskMotionStyles } from './KioskDecor';
import { KioskImage } from './KioskImage';
import {
  ActionCards,
  FooterWave,
  HeaderSeamWave,
  HeroHeadline,
  HomeMenuButton,
  PrimaryCTA,
  RestaurantLogo,
  RestaurantMeta,
  StatusBadge,
} from './KioskHomeFrame';
import { OperatingCoverage } from './OperatingCoverage';
import type { KioskFulfillment } from './kiosk-types';
import type { MenuThemeMode } from '../../_lib/menu-theme';
import { useLockBodyScroll } from '../../../../_lib/use-lock-body-scroll';

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
  /** Resolved Venezuela state labels for virtual businesses (e.g. "Miranda"). */
  operatingStateLabels?: string[];
  socialLinks?: Array<{ network: string; href: string }>;
  tagline?: string | null;
  supportsDelivery: boolean;
  themeMode: MenuThemeMode;
  homeConfig?: KioskHomeConfig;
  paymentGroups?: Array<{
    currency: string;
    methods: Array<{
      id: string;
      label: string;
      details: string;
      fields?: PaymentDisplayField[];
      note?: string | null;
    }>;
  }>;
  onToggleTheme: () => void;
  onSelect: (fulfillment: KioskFulfillment) => void;
  onBrowseMenu: () => void;
  onOpenCatalog: () => void;
  /** Opens turn-by-turn directions to the restaurant (device GPS as origin). */
  directionsUrl?: string | null;
  /** Mesa QR (?catalogo=1): only catalog (+ payments), no dine-in / takeaway / delivery. */
  catalogOnlySession?: boolean;
  /** Product photos for the home hero crossfade (empty → logo fallback). */
  heroImages?: Array<{ imageUrl: string; imageSourceUrl: string }>;
};

const HERO_DWELL_MS = 5200;
const HERO_FADE_MS = 680;

type HeroSlide = { imageUrl: string; imageSourceUrl: string };

/**
 * Dual-buffer hero crossfade:
 * - first slide loads eagerly (priority)
 * - next slide mounts only after dwell, once the front is ready
 * - fade starts only after the next cascade reports ready
 * - after fade, the old buffer unmounts (frees decode memory)
 */
function HeroProductBackdrop({
  slides,
  logoUrl,
  businessName,
  initialLetter,
}: {
  slides: HeroSlide[];
  logoUrl: string | null;
  businessName: string;
  initialLetter: string;
}) {
  type Buf = { index: number };
  const [slotA, setSlotA] = useState<Buf | null>(() => (slides[0] ? { index: 0 } : null));
  const [slotB, setSlotB] = useState<Buf | null>(null);
  const [front, setFront] = useState<'a' | 'b'>('a');
  const [aReady, setAReady] = useState(false);
  const [bReady, setBReady] = useState(false);
  const [fading, setFading] = useState(false);
  const skipRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const slidesKey = slides.map((s) => s.imageUrl).join('|');

  const slideCount = slides.length;
  const canRotate = slideCount > 1;
  const frontBuf = front === 'a' ? slotA : slotB;
  const backBuf = front === 'a' ? slotB : slotA;
  const frontReady = front === 'a' ? aReady : bReady;
  const preparing = backBuf != null;

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    setSlotA(slides[0] ? { index: 0 } : null);
    setSlotB(null);
    setFront('a');
    setAReady(false);
    setBReady(false);
    setFading(false);
    skipRef.current = 0;
  }, [slidesKey]); // eslint-disable-line react-hooks/exhaustive-deps -- identity via urls

  useEffect(() => {
    if (!canRotate || !frontReady || preparing || fading) return;
    if (reducedMotionRef.current) return;
    const timer = window.setTimeout(() => {
      const next = ((frontBuf?.index ?? 0) + 1) % slideCount;
      skipRef.current = 0;
      if (front === 'a') {
        setBReady(false);
        setSlotB({ index: next });
      } else {
        setAReady(false);
        setSlotA({ index: next });
      }
    }, HERO_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [canRotate, frontReady, preparing, fading, front, frontBuf?.index, slideCount]);

  useEffect(() => {
    if (!fading) return;
    const timer = window.setTimeout(() => {
      if (front === 'a') {
        setSlotA(null);
        setFront('b');
      } else {
        setSlotB(null);
        setFront('a');
      }
      setFading(false);
      skipRef.current = 0;
    }, HERO_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [fading, front]);

  function onBackReady(ok: boolean, backIndex: number) {
    if (ok) {
      requestAnimationFrame(() => setFading(true));
      return;
    }
    skipRef.current += 1;
    if (skipRef.current >= slideCount) {
      if (front === 'a') setSlotB(null);
      else setSlotA(null);
      return;
    }
    const next = (backIndex + 1) % slideCount;
    if (front === 'a') {
      setBReady(false);
      setSlotB({ index: next });
    } else {
      setAReady(false);
      setSlotA({ index: next });
    }
  }

  if (!slides[0]) {
    return (
      <div className="absolute inset-0 z-0 grid place-items-center" aria-hidden>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            loading="eager"
            decoding="async"
            className="h-[42%] w-[42%] max-h-[148px] max-w-[148px] object-contain opacity-[0.22]"
          />
        ) : (
          <span
            className="grid h-[42%] w-[42%] max-h-[148px] max-w-[148px] place-items-center rounded-[28px] text-5xl font-black opacity-25"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            {initialLetter}
          </span>
        )}
        <span className="sr-only">{businessName}</span>
      </div>
    );
  }

  function renderSlot(
    buf: Buf | null,
    isFront: boolean,
    onReady: (ok: boolean) => void,
    eager: boolean,
  ) {
    if (!buf) return null;
    const slide = slides[buf.index];
    if (!slide) return null;
    const show = isFront ? !fading : fading;
    return (
      <div
        className="absolute inset-0 transition-opacity ease-out"
        style={{
          opacity: show ? 1 : 0,
          transitionDuration: `${HERO_FADE_MS}ms`,
          willChange: fading ? 'opacity' : undefined,
        }}
      >
        <KioskImage
          key={`hero-${buf.index}-${slide.imageUrl}`}
          src={slide.imageUrl}
          sourceUrl={slide.imageSourceUrl}
          displayWidth={560}
          alt=""
          priority={eager}
          fit="cover"
          showBlurFill={false}
          className="absolute inset-0 h-full w-full bg-transparent"
          imgClassName="h-full w-full object-cover"
          onReady={onReady}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      {renderSlot(
        slotA,
        front === 'a',
        (ok) => {
          if (front === 'a') {
            if (ok) setAReady(true);
            return;
          }
          onBackReady(ok, slotA!.index);
        },
        front === 'a',
      )}
      {renderSlot(
        slotB,
        front === 'b',
        (ok) => {
          if (front === 'b') {
            if (ok) setBReady(true);
            return;
          }
          onBackReady(ok, slotB!.index);
        },
        front === 'b',
      )}
    </div>
  );
}

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
  operatingStateLabels = [],
  socialLinks = [],
  themeMode,
  homeConfig = DEFAULT_KIOSK_HOME_CONFIG,
  paymentGroups = [],
  onToggleTheme,
  onBrowseMenu,
  onOpenCatalog,
  directionsUrl = null,
  catalogOnlySession = false,
  heroImages = [],
}: KioskHomeProps) {
  const homeRef = useRef<HTMLElement>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);
  const [sheetTheme, setSheetTheme] = useState<CSSProperties>({});
  const payableGroups = paymentGroups.filter((group) => group.methods.length > 0);
  const coverageLabels = operatingStateLabels
    .map((label) => label.trim())
    .filter(Boolean);
  const mapsHref = (directionsUrl ?? '').trim();
  const hasHeroPhotos = heroImages.length > 0;
  const showSocials = homeConfig.redes && socialLinks.length > 0;

  useEffect(() => {
    if (!homeRef.current) return;
    if (!paymentSheetOpen && !homeMenuOpen && coverageLabels.length === 0) return;
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
  }, [paymentSheetOpen, homeMenuOpen, coverageLabels.length]);

  return (
    <section
      ref={homeRef}
      data-kiosk-home-rev="1c"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden text-[var(--menu-text)] overscroll-none"
      style={{ backgroundColor: 'var(--menu-background)' }}
    >
      <KioskMotionStyles />

      {/* Desktop: brand stage behind a phone-width home panel (avoids sparse full-bleed white). */}
      <div
        className="pointer-events-none absolute inset-0 hidden lg:block"
        style={{
          background: `
            radial-gradient(90% 70% at 50% 0%, color-mix(in srgb, var(--menu-primary) 70%, white), transparent 58%),
            radial-gradient(70% 55% at 12% 88%, color-mix(in srgb, var(--menu-accent) 35%, transparent), transparent 60%),
            linear-gradient(160deg,
              color-mix(in srgb, var(--menu-primary) 88%, #0b1210) 0%,
              var(--menu-primary) 48%,
              color-mix(in srgb, var(--menu-primary) 78%, var(--menu-accent)) 100%)
          `,
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-0 w-full flex-1 flex-col lg:items-center lg:justify-center lg:px-8 lg:py-6">
        <div
          className="kiosk-home-shell kiosk-scrollbar relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-hidden overscroll-none lg:max-h-[min(52rem,calc(100dvh-3rem))] lg:flex-none lg:rounded-[2rem] lg:shadow-[0_32px_90px_rgba(0,0,0,0.32)]"
          style={{ backgroundColor: 'var(--menu-background)' }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none">
            {/* Dark hero: photo fills under the N-seam (reference composition) */}
            <div className="relative shrink-0">
              <div
                className="relative min-h-[min(36vh,300px)] overflow-hidden px-5 pb-16 pt-3.5 sm:min-h-[300px] sm:px-6 sm:pb-[4.5rem] sm:pt-5 lg:min-h-[280px]"
                style={{
                  background:
                    'linear-gradient(165deg, #050607 0%, #101218 42%, color-mix(in srgb, var(--menu-primary) 24%, #0a0b0e) 100%)',
                }}
              >
                <HeroProductBackdrop
                  slides={heroImages}
                  logoUrl={logoUrl}
                  businessName={businessName}
                  initialLetter={initialLetter}
                />
                <div
                  className="absolute inset-0 z-[1]"
                  style={{
                    background: hasHeroPhotos
                      ? 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 40%, rgba(0,0,0,0.14) 72%, color-mix(in srgb, var(--menu-primary) 8%, rgba(0,0,0,0.22)) 100%)'
                      : 'radial-gradient(110% 90% at 82% 12%, color-mix(in srgb, var(--menu-primary) 42%, transparent), transparent 52%), radial-gradient(80% 70% at 8% 78%, color-mix(in srgb, var(--menu-primary) 28%, transparent), transparent 58%)',
                  }}
                  aria-hidden
                />
                <div className="absolute inset-0 z-[2]">
                  <KioskDecor variant="home" />
                </div>
                <div className="relative z-30 flex items-center justify-start">
                  <HomeMenuButton onOpen={() => setHomeMenuOpen(true)} />
                </div>
                <div className="relative z-10 mt-5 mb-2 flex items-center justify-center px-2 sm:mt-6">
                  <HeroHeadline />
                </div>
                {/* Seam inside hero — crest cuts the photo, no white gap */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15]">
                  <HeaderSeamWave />
                </div>
              </div>

              {/* Logo mid sits on the seam crest */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-[42%] justify-center">
                <div className="pointer-events-auto">
                  <RestaurantLogo logoUrl={logoUrl} businessName={businessName} initialLetter={initialLetter} />
                </div>
              </div>
            </div>

            {/* Light commercial panel — compact stack like the reference */}
            <div
              className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-5 pt-[5.25rem] sm:px-6 sm:pb-6 sm:pt-[5.75rem]"
              style={{ backgroundColor: 'var(--menu-background)' }}
            >
              <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center gap-0">
                <RestaurantMeta
                  businessName={businessName}
                  nameFontClassName=""
                  showRating={homeConfig.calificacion}
                  ratingAverage={ratingAverage}
                  ratingCount={ratingCount}
                />
                <div className="mt-2.5">
                  <StatusBadge isOpen={isOpen} openCaption={openCaption} closedCaption={closedCaption} />
                </div>
                {coverageLabels.length > 0 ? (
                  <div className="mt-3">
                    <OperatingCoverage stateLabels={coverageLabels} themeStyle={sheetTheme} />
                  </div>
                ) : null}

                <div className="mt-5 w-full sm:mt-6">
                  <PrimaryCTA
                    onClick={() => {
                      if (catalogOnlySession) onOpenCatalog();
                      else onBrowseMenu();
                    }}
                  />
                </div>
                <div className="mt-3 w-full">
                  <ActionCards
                    mapsHref={mapsHref}
                    locationFallback={locationLabel?.trim() || 'Sin ubicación'}
                    onOpenPayments={() => setPaymentSheetOpen(true)}
                  />
                </div>
              </div>
            </div>
          </div>

          <FooterWave />
        </div>
      </div>
      {homeMenuOpen
        ? createPortal(
            <HomeOptionsSheet
              themeMode={themeMode}
              onToggleTheme={onToggleTheme}
              socialLinks={showSocials ? socialLinks : []}
              themeStyle={sheetTheme}
              onClose={() => setHomeMenuOpen(false)}
            />,
            document.body,
          )
        : null}
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

function HomeOptionsSheet({
  themeMode,
  onToggleTheme,
  socialLinks,
  themeStyle,
  onClose,
}: {
  themeMode: MenuThemeMode;
  onToggleTheme: () => void;
  socialLinks: Array<{ network: string; href: string }>;
  themeStyle: CSSProperties;
  onClose: () => void;
}) {
  useLockBodyScroll(true);
  const dark = themeMode === 'dark';

  const rowClass =
    'flex min-h-12 w-full items-center gap-3 rounded-2xl px-3.5 text-left text-[15px] font-semibold transition active:scale-[0.99]';
  const rowStyle = {
    backgroundColor: 'var(--menu-surface-alt, #f3f4f6)',
    color: 'var(--menu-text, #111111)',
  } as const;

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
        aria-labelledby="home-options-title"
        className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-[24px] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        style={{ backgroundColor: 'var(--menu-surface, #ffffff)', color: 'var(--menu-text, #111111)' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-6">
          <h2 id="home-options-title" className="text-lg font-extrabold">
            Opciones
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/55 text-white"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 px-5 pb-5 pt-3 sm:px-6">
          <button type="button" onClick={onToggleTheme} className={rowClass} style={rowStyle}>
            {dark ? <Sun className="h-4 w-4 shrink-0" strokeWidth={2.2} /> : <Moon className="h-4 w-4 shrink-0" strokeWidth={2.2} />}
            <span className="min-w-0 flex-1">{dark ? 'Tema claro' : 'Tema oscuro'}</span>
          </button>

          {socialLinks.length > 0 ? (
            <div className="pt-2">
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--menu-text-muted)]">
                Redes
              </p>
              <div className="flex flex-wrap gap-2">
                {socialLinks.map(({ network, href }) => {
                  const Icon =
                    network === 'instagram'
                      ? Instagram
                      : network === 'facebook'
                        ? Facebook
                        : network === 'youtube'
                          ? Youtube
                          : Music2;
                  const label =
                    network === 'instagram'
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
                      onClick={onClose}
                      className="inline-flex h-11 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--menu-text) 12%, transparent)',
                        backgroundColor: 'color-mix(in srgb, var(--menu-surface-alt) 90%, transparent)',
                        color: 'var(--menu-text)',
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                      {label}
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type PaymentMethodSheetItem = {
  id: string;
  label: string;
  details: string;
  fields?: PaymentDisplayField[];
  note?: string | null;
};

function PaymentMethodsSheet({
  groups,
  themeStyle,
  onClose,
}: {
  groups: Array<{
    currency: string;
    methods: PaymentMethodSheetItem[];
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
              {methods.map((method) => {
                const cash = isCashPaymentMethodLabel(method.label);
                const kind = paymentMethodIconKindFromText(method.label, method.details);
                const Icon =
                  kind === 'cash'
                    ? Banknote
                    : kind === 'pago_movil'
                      ? Smartphone
                      : kind === 'binance'
                        ? Bitcoin
                        : kind === 'transfer'
                          ? Building2
                          : kind === 'card'
                            ? CreditCard
                            : Wallet;
                return (
                  <div
                    key={method.id}
                    className="rounded-2xl border px-4 py-3"
                    style={{
                      backgroundColor: 'var(--menu-surface-alt, #f3f4f6)',
                      borderColor: 'var(--menu-border, #e5e7eb)',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--menu-text) 8%, transparent)',
                          color: 'var(--menu-text-muted, #6b7280)',
                        }}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <p className="min-w-0 text-[15px] font-bold">{method.label}</p>
                    </div>
                    {method.fields && method.fields.length > 0 ? (
                      <PaymentCopyFields
                        fields={method.fields}
                        note={method.note}
                        dense
                        mode={cash ? 'info' : 'copy'}
                      />
                    ) : method.details ? (
                      cash ? (
                        <PaymentCopyFields
                          fields={[{ label: '', value: method.details }]}
                          dense
                          mode="info"
                        />
                      ) : (
                        <p
                          className="mt-1 text-sm leading-6"
                          style={{ color: 'var(--menu-text-muted, #6b7280)' }}
                        >
                          {method.details}
                        </p>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
