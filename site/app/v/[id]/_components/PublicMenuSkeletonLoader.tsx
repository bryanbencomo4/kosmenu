'use client';

import { KioskDecor } from './kiosk/KioskDecor';

type PublicMenuSkeletonLoaderProps = {
  businessName: string;
};

function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-full bg-neutral-200 ${className}`} aria-hidden />;
}

export function PublicMenuSkeletonLoader({ businessName }: PublicMenuSkeletonLoaderProps) {
  const knownName = Boolean(businessName) && businessName.toLowerCase() !== 'elmenuxfa.com';

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#F6F7F9] text-[#111827]"
      aria-busy="true"
      aria-label={knownName ? `Cargando menú de ${businessName}` : 'Cargando menú'}
    >
      <KioskDecor tone="muted" />

      <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-5 pb-3 pt-7 sm:pt-8">
        <div className="flex flex-col items-center text-center">
          <Pulse className="h-7 w-56 sm:w-72" />

          <Pulse className="mt-3 h-[96px] w-[96px] rounded-[22px] sm:h-[118px] sm:w-[118px]" />

          <p className="mt-3.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
            <span className="hidden h-px w-8 bg-slate-300 sm:block" />
            Menú inteligente
            <span className="hidden h-px w-8 bg-slate-300 sm:block" />
          </p>

          {knownName ? (
            <h1 className="mt-1.5 line-clamp-2 max-w-[16ch] text-[32px] font-extrabold leading-[1.05] tracking-[-0.04em] text-[#111827] sm:text-[46px]">
              {businessName}
            </h1>
          ) : (
            <Pulse className="mt-1.5 h-10 w-52 rounded-xl sm:h-12 sm:w-64" />
          )}

          <Pulse className="mt-3 h-4 w-64 max-w-full rounded-lg" />
          <Pulse className="mt-3 h-8 w-36" />
        </div>

        <div className="mt-6 grid w-full gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex min-h-[4.5rem] items-center gap-3.5 rounded-[22px] bg-white px-3.5 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
            >
              <Pulse className="h-11 w-11 shrink-0 rounded-[14px] sm:h-12 sm:w-12" />
              <div className="min-w-0 flex-1">
                <Pulse className="h-4 w-28 rounded-lg" />
                <Pulse className="mt-2 h-3 w-40 max-w-full rounded-lg" />
              </div>
              <Pulse className="h-5 w-5 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
