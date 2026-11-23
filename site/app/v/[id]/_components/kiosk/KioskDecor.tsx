'use client';

type KioskDecorProps = {
  density?: 'full' | 'lite';
  tone?: 'brand' | 'muted';
  /** Home frame: solid corner arcs and the pizza mark from the kiosk mock. */
  variant?: 'line' | 'home';
};

export function KioskDecor({ density = 'full', tone = 'brand', variant = 'line' }: KioskDecorProps) {
  const stroke = tone === 'muted' ? 'var(--menu-border)' : 'var(--menu-primary)';
  const showSecondary = density === 'full';

  if (variant === 'home') {
    // Home hero: soft brand glow only — no line-art figures over the product photo.
    return (
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
        <div
          className="absolute -left-10 top-8 h-40 w-40 rounded-full opacity-40 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--menu-primary) 36%, transparent)' }}
        />
        <div
          className="absolute -right-8 top-2 h-36 w-36 rounded-full opacity-30 blur-3xl"
          style={{ background: 'color-mix(in srgb, var(--menu-primary) 28%, transparent)' }}
        />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
      <svg
        className="absolute left-[-8px] top-10 h-28 w-20 opacity-[0.12] sm:left-6 sm:top-16 sm:h-44 sm:w-28 sm:opacity-[0.15]"
        viewBox="0 0 80 140"
        fill="none"
        stroke={stroke}
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <path d="M42 128C41 92 36 78 22 54" />
        <path d="M40 98C28 92 18 78 16 64" />
        <path d="M18 78C12 70 14 56 24 52C28 62 26 72 18 78Z" />
        <path d="M26 64C20 54 26 40 36 40C36 52 32 62 26 64Z" />
        <path d="M42 86C50 78 62 78 66 66" />
        <path d="M58 76C64 70 62 56 52 54C50 64 54 72 58 76Z" />
        <path d="M40 70C48 60 46 44 36 40C34 52 36 64 40 70Z" />
      </svg>

      <svg
        className="absolute right-[-6px] top-28 hidden h-32 w-32 opacity-[0.11] sm:block sm:right-8 sm:opacity-[0.14]"
        viewBox="0 0 120 120"
        fill="none"
        stroke={stroke}
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <circle cx="62" cy="64" r="26" />
        <circle cx="62" cy="64" r="16" />
        <path d="M24 38V92" />
        <path d="M20 48H28" />
        <path d="M20 58H28" />
        <path d="M20 68H28" />
        <path d="M96 36L104 92" />
        <path d="M92 36L108 36" />
        <path d="M100 52C104 52 108 48 108 44" />
      </svg>

      {showSecondary ? (
        <svg
          className="absolute bottom-36 left-2 hidden h-24 w-24 opacity-[0.11] md:block md:left-10"
          viewBox="0 0 80 80"
          fill="none"
          stroke={stroke}
          strokeWidth="1.3"
          strokeLinecap="round"
        >
          <path d="M28 46C28 34 36 28 40 22C44 28 52 34 52 46C52 56 46 62 40 62C34 62 28 56 28 46Z" />
          <path d="M52 42C60 42 64 48 60 54" />
          <path d="M34 18C36 14 40 12 44 16" />
          <path d="M40 16C42 12 46 12 48 16" />
        </svg>
      ) : null}

      <svg
        className={`absolute right-3 h-14 w-14 opacity-[0.1] sm:right-12 sm:h-16 sm:w-16 sm:opacity-[0.12] ${
          showSecondary ? 'bottom-40 sm:bottom-44' : 'bottom-28'
        }`}
        viewBox="0 0 72 72"
        fill="none"
        stroke={stroke}
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <path d="M22 30C22 20 36 16 36 8C36 16 50 20 50 30C50 42 44 48 36 48C28 48 22 42 22 30Z" />
        <path d="M20 30H52" />
        <path d="M36 48V54" />
        <circle cx="36" cy="58" r="3" />
      </svg>
    </div>
  );
}

export function KioskMotionStyles() {
  return (
    <style>{`
      .kiosk-enter, .kiosk-card {
        animation: kiosk-in 350ms ease both;
      }
      .kiosk-footer-enter {
        animation: kiosk-footer-in 560ms cubic-bezier(0.22, 1, 0.36, 1) 160ms both;
      }
      .kiosk-brush-enter {
        animation: kiosk-brush-in 520ms cubic-bezier(0.22, 1, 0.36, 1) 60ms both;
        transform-origin: center;
      }
      .kiosk-card .kiosk-chevron {
        transition: transform 200ms ease;
      }
      .kiosk-card:hover:not(:disabled) .kiosk-chevron {
        transform: translateX(3px);
      }
      @keyframes kiosk-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes kiosk-footer-in {
        from { opacity: 0; transform: translateY(18px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes kiosk-brush-in {
        from { opacity: 0; transform: scaleX(0.78) scaleY(0.92); }
        to { opacity: 1; transform: scaleX(1) scaleY(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .kiosk-enter, .kiosk-card, .kiosk-footer-enter, .kiosk-brush-enter { animation: none; }
      }
      /* First paint after skeleton: color reveal only — no entrance motion */
      [data-kiosk-boot-reveal] .kiosk-enter,
      [data-kiosk-boot-reveal] .kiosk-card,
      [data-kiosk-boot-reveal] .kiosk-footer-enter,
      [data-kiosk-boot-reveal] .kiosk-brush-enter {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }

      /*
       * Short phones: keep the hero readable, trim only extra gaps, and pin
       * Ver menú above the footer so empty space does not sit under the CTAs.
       */
      @media (max-height: 780px) and (max-width: 480px) {
        .kiosk-home-shell .kiosk-home-hero {
          min-height: min(32vh, 260px) !important;
          padding-top: 0.75rem !important;
          padding-bottom: 3.75rem !important;
        }
        .kiosk-home-shell .kiosk-home-headline {
          margin-top: 0.85rem !important;
          margin-bottom: 0.15rem !important;
        }
        .kiosk-home-shell .kiosk-home-brush {
          min-height: 4.85rem !important;
        }
        .kiosk-home-shell .kiosk-home-logo-media {
          height: min(34cqw, 128px) !important;
          width: min(34cqw, 128px) !important;
        }
        .kiosk-home-shell .kiosk-home-panel {
          padding-top: 4.5rem !important;
          padding-bottom: 0.75rem !important;
        }
        .kiosk-home-shell .kiosk-home-stack {
          justify-content: flex-start !important;
        }
        .kiosk-home-shell .kiosk-home-title {
          margin-top: 0.45rem !important;
          font-size: clamp(28px, 7.4cqw, 40px) !important;
        }
        .kiosk-home-shell .kiosk-home-rating {
          margin-top: 0.4rem !important;
        }
        .kiosk-home-shell .kiosk-home-badge {
          margin-top: 0.55rem !important;
        }
        /* Absorb leftover height between badge and CTAs — not under the buttons. */
        .kiosk-home-shell .kiosk-home-cta-wrap {
          margin-top: auto !important;
          padding-top: 0.85rem !important;
          padding-bottom: 0.15rem !important;
        }
        .kiosk-home-shell .kiosk-home-cta {
          height: 3.45rem !important;
          font-size: 17px !important;
        }
        .kiosk-home-shell .kiosk-home-actions-wrap {
          margin-top: 0.65rem !important;
        }
        .kiosk-home-shell .kiosk-home-action-pill {
          height: 2.85rem !important;
        }
        .kiosk-home-shell .kiosk-footer-enter svg {
          height: 2.5rem !important;
        }
        .kiosk-home-shell .kiosk-home-footer-body {
          padding-bottom: max(0.55rem, env(safe-area-inset-bottom)) !important;
        }
        .kiosk-home-shell .kiosk-home-footer-body a {
          margin-top: 0.4rem !important;
        }
      }

      @media (max-height: 680px) and (max-width: 480px) {
        .kiosk-home-shell .kiosk-home-hero {
          min-height: min(30vh, 230px) !important;
          padding-bottom: 3.35rem !important;
        }
        .kiosk-home-shell .kiosk-home-logo-media {
          height: min(32cqw, 116px) !important;
          width: min(32cqw, 116px) !important;
        }
        .kiosk-home-shell .kiosk-home-panel {
          padding-top: 4.1rem !important;
        }
        .kiosk-home-shell .kiosk-home-title {
          font-size: clamp(26px, 7cqw, 36px) !important;
        }
        .kiosk-home-shell .kiosk-home-cta-wrap {
          padding-top: 0.65rem !important;
        }
      }
    `}</style>
  );
}
