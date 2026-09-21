'use client';

type KioskDecorProps = {
  density?: 'full' | 'lite';
  tone?: 'brand' | 'muted';
};

export function KioskDecor({ density = 'full', tone = 'brand' }: KioskDecorProps) {
  const stroke = tone === 'muted' ? 'var(--menu-border)' : 'var(--menu-primary)';
  const showSecondary = density === 'full';

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
      @media (prefers-reduced-motion: reduce) {
        .kiosk-enter, .kiosk-card, .kiosk-footer-enter { animation: none; }
      }
    `}</style>
  );
}
