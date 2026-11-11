'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronRight,
  CreditCard,
  MapPin,
  Menu,
  Moon,
  Rocket,
  Star,
  Sun,
  X,
} from 'lucide-react';

import { KioskImage } from './KioskImage';
import { pickKioskGreeting } from './kiosk-greetings';
import type { MenuThemeMode } from '../../_lib/menu-theme';

const FALLBACK_GREETING = '¿Listo para pedir algo rico? 😋';

/** Bright accent yellow matching Flutter AccentRays reference. */
const ACCENT_RAY_COLOR = '#FFCC00';

/**
 * Three rounded yellow strokes — vector equivalent of Flutter CustomPainter AccentRays.
 * Zero assets, no animation, pointer-events none.
 */
export function AccentRays({
  mirrored = false,
  size = 44,
  className = '',
}: {
  mirrored?: boolean;
  size?: number;
  className?: string;
}) {
  const height = size * 1.08;
  const stroke = 12.5; // viewBox width 100 → size.width * 0.125
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 100 108"
      fill="none"
      aria-hidden
      className={`pointer-events-none select-none ${className}`.trim()}
      style={{ transform: mirrored ? 'scaleX(-1)' : undefined }}
    >
      <g stroke={ACCENT_RAY_COLOR} strokeWidth={stroke} strokeLinecap="round">
        {/* Same normalized segments as Flutter _AccentRaysPainter */}
        <line x1="10" y1="64" x2="38" y2="80" />
        <line x1="27" y1="27" x2="51" y2="52" />
        <line x1="69" y1="6" x2="76" y2="35" />
      </g>
    </svg>
  );
}

/** Split greeting for brush layout: white lead + secondary accent line (≤3 lines total). */
function splitGreetingLines(greeting: string): { lead: string; accent: string } {
  const text = greeting.trim();
  const classic = text.match(/^(.*?)\s+(algo rico\??)$/i);
  if (classic) {
    return { lead: classic[1].trim(), accent: classic[2].trim() };
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    return { lead: text, accent: '' };
  }
  // Keep accent short (1–2 words) so lead+accent stay within 3 visual lines.
  const accentCount = words.length >= 8 ? 2 : words.length >= 5 ? 2 : 1;
  return {
    lead: words.slice(0, -accentCount).join(' '),
    accent: words.slice(-accentCount).join(' '),
  };
}

export function ThemeToggle({
  themeMode,
  onToggle,
  onDarkHero = false,
}: {
  themeMode: MenuThemeMode;
  onToggle: () => void;
  /** Contrast styling when sitting on the dark hero panel. */
  onDarkHero?: boolean;
}) {
  const dark = themeMode === 'dark';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold backdrop-blur-md transition active:scale-[0.98]"
      style={
        onDarkHero
          ? {
              color: '#f8fafc',
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderColor: 'rgba(255,255,255,0.22)',
            }
          : {
              color: 'var(--menu-text)',
              backgroundColor: 'color-mix(in srgb, var(--menu-surface) 70%, transparent)',
              borderColor: 'color-mix(in srgb, var(--menu-text) 14%, transparent)',
            }
      }
    >
      {dark ? <Sun className="h-3.5 w-3.5" strokeWidth={2.2} /> : <Moon className="h-3.5 w-3.5" strokeWidth={2.2} />}
      {dark ? 'Tema claro' : 'Tema oscuro'}
    </button>
  );
}

/** Compact hamburger on the dark hero — opens the home options sheet. */
export function HomeMenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Abrir menú"
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md transition active:scale-[0.96]"
      style={{
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.62)',
        borderColor: 'rgba(255,255,255,0.4)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
      }}
    >
      <Menu className="h-5 w-5" strokeWidth={2.6} />
    </button>
  );
}

/**
 * Header seam — same N-curve as FooterWave.
 * Light fill first (covers photo under the crest), then the brand ribbon on top.
 */
export function HeaderSeamWave() {
  // Same crest as FooterWave (N-curve)
  const crest = 'M0 36C220 8 440 4 720 28C1000 52 1220 64 1440 26';
  return (
    <div className="relative">
      <svg
        className="pointer-events-none block h-12 w-full sm:h-[3.35rem]"
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* White panel from crest down — photo shows only above the curve */}
        <path d={`${crest}V80H0V36Z`} fill="var(--menu-background)" />
        {/* Brand ribbon — footer palette, same N shape */}
        <path
          d="M0 36C220 8 440 4 720 28C1000 52 1220 64 1440 26V44C1220 70 1000 62 720 42C440 22 220 26 0 48Z"
          fill="color-mix(in srgb, var(--menu-primary) 55%, white)"
        />
        <path
          d="M0 40C240 12 480 8 760 32C1040 54 1240 64 1440 34V50C1240 68 1040 62 760 44C480 24 240 28 0 54Z"
          fill="color-mix(in srgb, var(--menu-primary) 78%, var(--menu-accent))"
        />
        <path
          d="M0 44C260 16 520 12 800 36C1080 56 1280 66 1440 40V54C1280 68 1080 62 800 46C520 28 260 32 0 58Z"
          fill="var(--menu-primary)"
        />
        <path
          d={crest}
          fill="none"
          stroke="color-mix(in srgb, var(--menu-accent) 70%, white)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {/* Kill desktop subpixel hairline where SVG meets the panel (hero bg bleed). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] translate-y-[1px]"
        style={{ backgroundColor: 'var(--menu-background)' }}
      />
    </div>
  );
}

export function HeroHeadline({ fontClassName = '' }: { fontClassName?: string } = {}) {
  const [greeting, setGreeting] = useState(FALLBACK_GREETING);
  useEffect(() => {
    setGreeting(pickKioskGreeting());
  }, []);

  const { lead, accent } = splitGreetingLines(greeting);
  // PNG silhouette masked + filled with merchant primary (darkened for white-text contrast).
  const brushFill = 'color-mix(in srgb, var(--menu-primary) 72%, #140606)';
  // Client secondary / accent (color_secundario → --menu-accent)
  const secondary = 'var(--menu-accent)';
  const brushMask = {
    WebkitMaskImage: 'url(/kiosk/brush-stroke-wine.png)',
    maskImage: 'url(/kiosk/brush-stroke-wine.png)',
    WebkitMaskSize: '100% auto',
    maskSize: '100% auto',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  } as const;

  return (
    <div
      className="kiosk-enter relative mx-auto w-[min(90cqw,23rem)] -rotate-[3deg]"
      style={{ animationDelay: '40ms' }}
    >
      {/* Stack: masked brush + greeting + AccentRays (left of title, like Flutter banner). */}
      <div className="relative flex min-h-[5.4rem] items-center justify-center overflow-visible">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 w-full -translate-y-1/2 drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
        >
          <div
            className="kiosk-brush-enter aspect-[1209/442] w-full"
            style={{
              ...brushMask,
              background: `linear-gradient(180deg, color-mix(in srgb, var(--menu-primary) 88%, white) 0%, ${brushFill} 42%, color-mix(in srgb, var(--menu-primary) 55%, #0a0404) 100%)`,
            }}
          />
        </div>
        {/* Rays sit on the brush, left of the centered title — not Unicode dashes. */}
        <div
          className="pointer-events-none absolute left-[2%] top-[8%] z-[2]"
          aria-hidden
        >
          <AccentRays size={42} />
        </div>
        <p
          className={`${fontClassName} relative z-[1] max-w-[86%] px-5 text-center text-[clamp(24px,6.6cqw,34px)] font-extrabold italic leading-[1.02] tracking-[-0.015em]`.trim()}
          style={{
            textShadow: '0 2px 0 rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Cap at 3 lines total so the greeting never slips behind the logo. */}
          <span className={`block text-white ${accent ? 'line-clamp-2' : 'line-clamp-3'}`}>
            {lead}
          </span>
          {accent ? (
            <span className="block line-clamp-1" style={{ color: secondary }}>
              {accent}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function RestaurantLogo({
  logoUrl,
  businessName,
  initialLetter,
}: {
  logoUrl: string | null;
  businessName: string;
  initialLetter: string;
}) {
  return (
    <div className="kiosk-enter relative grid place-items-center" style={{ animationDelay: '90ms' }}>
      <div
        className="relative rounded-[30px] p-[5px]"
        style={{
          backgroundColor: '#ffffff',
          boxShadow:
            '0 22px 48px rgba(0,0,0,0.28), 0 0 0 1px color-mix(in srgb, var(--menu-primary) 28%, transparent)',
        }}
      >
        {logoUrl ? (
          <KioskImage
            src={logoUrl}
            sourceUrl={logoUrl}
            displayWidth={320}
            alt={`Logo de ${businessName}`}
            priority
            fit="contain"
            showBlurFill={false}
            className="relative h-[min(38cqw,148px)] w-[min(38cqw,148px)] rounded-[25px] bg-[var(--menu-surface)]"
          />
        ) : (
          <div
            className="relative grid h-[min(38cqw,148px)] w-[min(38cqw,148px)] place-items-center rounded-[25px] text-5xl font-black"
            style={{ backgroundColor: 'var(--menu-primary)', color: 'var(--menu-on-primary)' }}
          >
            {initialLetter}
          </div>
        )}
      </div>
    </div>
  );
}

export function RestaurantMeta({
  businessName,
  nameFontClassName,
  showRating,
  ratingAverage,
  ratingCount,
}: {
  businessName: string;
  nameFontClassName: string;
  showRating: boolean;
  ratingAverage: number;
  ratingCount: number;
}) {
  return (
    <div className="kiosk-enter flex flex-col items-center text-center" style={{ animationDelay: '130ms' }}>
      <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[var(--menu-text-muted)]">
        — Menú inteligente —
      </p>
      <h1
        className={`${nameFontClassName} mt-2 max-w-[min(94cqw,16ch)] break-words text-[clamp(34px,8.5cqw,48px)] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--menu-text)]`.trim()}
      >
        {businessName}
      </h1>
      {showRating ? (
        <p
          className="mt-2 flex items-center justify-center gap-1 text-[13px] font-medium text-[var(--menu-text-muted)]"
          aria-label={
            ratingCount > 0
              ? `Calificación ${ratingAverage.toFixed(1)} de 5, ${ratingCount} calificaciones`
              : 'Este comercio aún no tiene calificaciones'
          }
        >
          <Star className="h-3.5 w-3.5" style={{ color: 'var(--menu-primary)', fill: 'var(--menu-primary)' }} />
          {ratingCount > 0 ? (
            <>
              <span className="font-semibold text-[var(--menu-text)]">{ratingAverage.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              {ratingCount} {ratingCount === 1 ? 'calificación' : 'calificaciones'}
            </>
          ) : (
            'Aún sin calificaciones'
          )}
        </p>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  isOpen,
  openCaption,
  closedCaption,
  onClick,
}: {
  isOpen: boolean;
  openCaption: string;
  closedCaption: string;
  /** When set, badge opens the weekly hours sheet. */
  onClick?: () => void;
}) {
  const label = isOpen ? openCaption || 'Abierto ahora' : closedCaption || 'Cerrado';
  const className =
    'kiosk-enter inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold';
  const style = {
    animationDelay: '160ms',
    ...(isOpen
      ? { backgroundColor: '#14532d', color: '#86efac' }
      : { backgroundColor: '#4c0519', color: '#fda4af' }),
  } as const;

  const content = (
    <>
      <span className={`h-2 w-2 rounded-full ${isOpen ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} transition active:scale-[0.98]`}
        style={style}
        aria-label={`${label}. Ver horarios de la semana.`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

export function PrimaryCTA({ onClick, children }: { onClick: () => void; children?: ReactNode }) {
  return (
    <div className="kiosk-enter relative overflow-visible" style={{ animationDelay: '200ms' }}>
      {/* Rays in the side gutters — farther from the pill than Flutter’s -15/-22 so they don’t hug the curve. */}
      <div className="pointer-events-none absolute left-[-26px] top-[-28px] z-[1]" aria-hidden>
        <AccentRays size={46} />
      </div>
      <div className="pointer-events-none absolute right-[-26px] top-[-28px] z-[1]" aria-hidden>
        <AccentRays size={46} mirrored />
      </div>
      <button
        type="button"
        onClick={onClick}
        className="relative z-0 flex h-[3.85rem] w-full items-center rounded-full px-5 text-[18px] font-extrabold tracking-[-0.01em] transition active:scale-[0.985]"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--menu-primary) 72%, white) 0%, var(--menu-primary) 48%, color-mix(in srgb, var(--menu-primary) 92%, #0a0a0a) 100%)',
          color: '#ffffff',
          boxShadow: '0 14px 32px color-mix(in srgb, var(--menu-primary) 38%, transparent)',
          fontWeight: 800,
        }}
      >
        {/* Equal side rails keep the label optically centered */}
        <span className="inline-flex w-[3.25rem] shrink-0 items-center gap-2.5">
          <BookOpen className="h-5 w-5" strokeWidth={2.05} aria-hidden />
          <span className="h-[1.35rem] w-px bg-white/50" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-center leading-none" style={{ fontWeight: 800 }}>
          {children ?? 'Ver menú'}
        </span>
        <span className="inline-flex w-[3.25rem] shrink-0 items-center justify-end">
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} aria-hidden />
        </span>
      </button>
    </div>
  );
}

/** Compact pill pair under the primary CTA (reference layout). */
export function ActionCards({
  mapsHref,
  locationFallback,
  onOpenPayments,
}: {
  mapsHref: string;
  locationFallback: string;
  onOpenPayments: () => void;
}) {
  const pillStyle = {
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.08)',
    borderColor: 'rgba(15, 23, 42, 0.06)',
    color: '#0f172a',
  } as const;

  const pillClass =
    'flex h-[3.15rem] items-center justify-center gap-2 rounded-full border px-3 text-[13px] font-bold tracking-[-0.01em] transition active:scale-[0.985]';

  const iconStyle = { color: 'var(--menu-primary)' } as const;

  return (
    <div className="kiosk-enter grid grid-cols-2 gap-[0.85rem]" style={{ animationDelay: '240ms' }}>
      {mapsHref ? (
        <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={pillClass} style={pillStyle}>
          <MapPin
            className="h-[1.2rem] w-[1.2rem] shrink-0"
            strokeWidth={2.05}
            style={iconStyle}
            aria-hidden
          />
          <span className="leading-none">Ubicación</span>
        </a>
      ) : (
        <div className={`${pillClass} opacity-80`} style={pillStyle}>
          <MapPin
            className="h-[1.2rem] w-[1.2rem] shrink-0"
            strokeWidth={2.05}
            style={iconStyle}
            aria-hidden
          />
          <span className="truncate text-[12px] leading-none">{locationFallback}</span>
        </div>
      )}
      <button type="button" onClick={onOpenPayments} className={pillClass} style={pillStyle}>
        <CreditCard className="h-[1.2rem] w-[1.2rem] shrink-0" strokeWidth={2.05} style={iconStyle} aria-hidden />
        <span className="leading-none">Métodos de pago</span>
      </button>
    </div>
  );
}

/** @deprecated Prefer ActionCards — kept for any residual imports. */
export function SecondaryLinks(props: {
  mapsHref: string;
  locationFallback: string;
  onOpenPayments: () => void;
}) {
  return <ActionCards {...props} />;
}

export function FooterWave() {
  return (
    <footer className="kiosk-footer-enter relative z-10 shrink-0">
      <div className="relative">
        {/* Cover subpixel hairline where footer meets the panel above. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] -translate-y-[1px]"
          style={{ backgroundColor: 'var(--menu-background)' }}
        />
        <svg className="relative block h-11 w-full sm:h-12" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden>
          {/* Lighter primary nuance */}
          <path
            d="M0 36C220 8 440 4 720 28C1000 52 1220 64 1440 26V80H0V36Z"
            fill="color-mix(in srgb, var(--menu-primary) 55%, white)"
          />
          {/* Primary + accent blend */}
          <path
            d="M0 46C260 16 500 12 780 34C1060 56 1260 66 1440 38V80H0V46Z"
            fill="color-mix(in srgb, var(--menu-primary) 78%, var(--menu-accent))"
          />
          {/* Solid primary body */}
          <path
            d="M0 54C300 26 560 22 840 42C1100 58 1300 66 1440 46V80H0V54Z"
            fill="var(--menu-primary)"
          />
          {/* Accent highlight edge */}
          <path
            d="M0 46C260 16 500 12 780 34C1060 56 1260 66 1440 38"
            fill="none"
            stroke="color-mix(in srgb, var(--menu-accent) 65%, white)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        {/* Cover subpixel hairline between wave SVG and solid footer body. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] translate-y-[1px]"
          style={{ backgroundColor: 'var(--menu-primary)' }}
        />
      </div>
      <div
        className="px-5 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-1 text-center"
        style={{
          background:
            'linear-gradient(180deg, var(--menu-primary) 0%, color-mix(in srgb, var(--menu-primary) 82%, var(--menu-accent)) 100%)',
          color: 'var(--menu-on-primary)',
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <span
            className="h-px w-10"
            style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 70%, var(--menu-on-primary))' }}
            aria-hidden
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em]">Pide a tu manera</p>
          <span
            className="h-px w-10"
            style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 70%, var(--menu-on-primary))' }}
            aria-hidden
          />
        </div>
        <a
          href="https://elmenuxfa.com"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium opacity-85"
          style={{ color: 'var(--menu-on-primary)' }}
        >
          <Rocket
            className="h-3 w-3"
            strokeWidth={2.2}
            style={{ color: 'color-mix(in srgb, var(--menu-accent) 75%, var(--menu-on-primary))' }}
          />
          Powered by elmenuxfa.com
        </a>
      </div>
    </footer>
  );
}
