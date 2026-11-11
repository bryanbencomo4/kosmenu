'use client';

import type { CSSProperties } from 'react';

import { FooterWave, HeaderSeamWave } from './kiosk/KioskHomeFrame';
import { KioskDecor } from './kiosk/KioskDecor';

type PublicMenuSkeletonLoaderProps = {
  businessName: string;
};

/** Skeleton brand tokens — same wave shapes, grayscale only (no merchant black/primary). */
const SKELETON_THEME = {
  '--menu-primary': '#9CA3AF',
  '--menu-accent': '#D1D5DB',
  '--menu-on-primary': '#FFFFFF',
  '--menu-background': '#F6F7F9',
  '--menu-surface': '#FFFFFF',
  '--menu-surface-alt': '#E5E7EB',
  '--menu-text': '#374151',
  '--menu-text-muted': '#9CA3AF',
  '--menu-border': '#E5E7EB',
} as CSSProperties;

function Pulse({
  className = '',
  style,
  rounded = 'full',
}: {
  className?: string;
  style?: CSSProperties;
  /** Avoid `rounded-full` on the logo — it must stay square. */
  rounded?: 'full' | 'none';
}) {
  return (
    <div
      className={`animate-pulse ${rounded === 'full' ? 'rounded-full' : ''} ${className}`}
      style={{ backgroundColor: 'var(--menu-surface-alt, #E5E7EB)', ...style }}
      aria-hidden
    />
  );
}

export function PublicMenuSkeletonLoader({ businessName }: PublicMenuSkeletonLoaderProps) {
  const knownName = Boolean(businessName) && businessName.toLowerCase() !== 'elmenuxfa.com';

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col overflow-hidden text-[var(--menu-text)]"
      style={{
        ...SKELETON_THEME,
        backgroundColor: 'var(--menu-background)',
        color: 'var(--menu-text)',
      }}
      aria-busy="true"
      aria-label={knownName ? `Cargando menú de ${businessName}` : 'Cargando menú'}
    >
      {/* Match desktop home stage so boot reveal does not jump layout. */}
      <div
        className="pointer-events-none absolute inset-0 hidden lg:block"
        style={{
          background:
            'radial-gradient(90% 70% at 50% 0%, #D1D5DB, transparent 58%), linear-gradient(160deg, #9CA3AF 0%, #B0B7C1 48%, #9CA3AF 100%)',
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-0 w-full flex-1 flex-col lg:items-center lg:justify-center lg:px-8 lg:py-6">
        <div
          className="relative mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-hidden @container lg:max-h-[min(52rem,calc(100dvh-3rem))] lg:flex-none lg:rounded-[2rem] lg:shadow-[0_32px_90px_rgba(0,0,0,0.22)]"
          style={{ backgroundColor: 'var(--menu-background)' }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Gray hero — same composition as home, skeleton palette */}
            <div className="relative shrink-0">
              <div
                className="relative min-h-[min(36vh,300px)] overflow-hidden px-5 pb-16 pt-3.5 sm:min-h-[300px] sm:px-6 sm:pb-[4.5rem] sm:pt-5 lg:min-h-[280px]"
                style={{
                  background: 'linear-gradient(165deg, #E5E7EB 0%, #F3F4F6 45%, #E5E7EB 100%)',
                }}
              >
                <div className="absolute inset-0 z-[2]">
                  <KioskDecor variant="home" tone="muted" />
                </div>

                <div className="relative z-30 flex items-center justify-start">
                  <Pulse className="h-10 w-10 rounded-full" style={{ backgroundColor: '#D1D5DB' }} />
                </div>

                <div className="relative z-10 mt-5 mb-2 flex items-center justify-center px-2 sm:mt-6">
                  {/* Brush placeholder — matches HeroHeadline width/height (≤3 lines). */}
                  <Pulse
                    className="h-[5.4rem] w-[min(90cqw,23rem)] -rotate-[3deg] rounded-[1.6rem]"
                    style={{ backgroundColor: '#D1D5DB' }}
                  />
                </div>

                {/* Same N-wave as home, forced to grayscale via SKELETON_THEME */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15]">
                  <HeaderSeamWave />
                </div>
              </div>

              {/* Opaque square logo — covers the seam midsection (pulse opacity would show the wave through). */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-[42%] justify-center">
                <div
                  className="relative grid h-[min(38cqw,148px)] w-[min(38cqw,148px)] place-items-center rounded-[30px] p-[5px]"
                  style={{
                    backgroundColor: '#ffffff',
                    boxShadow: '0 22px 48px rgba(15, 23, 42, 0.14)',
                  }}
                  aria-hidden
                >
                  <Pulse
                    rounded="none"
                    className="h-full w-full rounded-[25px]"
                    style={{ backgroundColor: '#E5E7EB' }}
                  />
                </div>
              </div>
            </div>

            <div
              className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-5 pt-[5.25rem] sm:px-6 sm:pb-6 sm:pt-[5.75rem]"
              style={{ backgroundColor: 'var(--menu-background)' }}
            >
              <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center gap-0">
                <p className="text-[12px] font-bold uppercase tracking-[0.3em] text-[var(--menu-text-muted)]">
                  — Menú inteligente —
                </p>

                {knownName ? (
                  <h1 className="mt-2 max-w-[min(94cqw,16ch)] break-words text-center text-[clamp(34px,8.5cqw,48px)] font-extrabold leading-[1.02] tracking-[-0.05em] text-[var(--menu-text)]">
                    {businessName}
                  </h1>
                ) : (
                  <Pulse className="mt-2 h-10 w-48 rounded-xl" />
                )}

                <Pulse className="mt-2 h-4 w-40 rounded-lg" />
                <Pulse className="mt-2.5 h-8 w-52" />

                {/* Inset gutters match PrimaryCTA + AccentRays spacing. */}
                <div className="relative mx-auto mt-6 w-[calc(100%-1.75rem)] max-w-[22.5rem] overflow-visible pt-4 sm:mt-7 sm:w-[calc(100%-2.25rem)]">
                  <Pulse
                    className="h-[3.85rem] w-full"
                    style={{
                      backgroundColor: '#9CA3AF',
                      boxShadow: '0 10px 24px rgba(148, 163, 184, 0.28)',
                    }}
                  />

                  <div className="mt-3 grid w-full grid-cols-2 gap-[0.85rem]">
                    <Pulse className="h-[3.15rem]" style={{ backgroundColor: '#ffffff' }} />
                    <Pulse className="h-[3.15rem]" style={{ backgroundColor: '#ffffff' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <FooterWave />
        </div>
      </div>
    </main>
  );
}
