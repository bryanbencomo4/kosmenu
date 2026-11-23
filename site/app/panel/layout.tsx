import type { ReactNode } from 'react';

export const metadata = {
  title: 'Conversaciones | El Menú XFA',
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#EFEAE2] text-[#111B21]">
      {/* Global chrome is light; conversation detail mounts a full-screen WA shell. */}
      <div className="border-b border-black/5 bg-[#008069] px-4 py-2.5 text-white md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/75">
              El Menú XFA
            </p>
            <h1 className="text-[15px] font-semibold leading-tight">
              Conversaciones
            </h1>
          </div>
          <a
            href="https://app.elmenuxfa.com"
            className="text-[13px] font-medium text-white/90 underline-offset-2 hover:underline"
          >
            Volver al panel
          </a>
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-0 py-0 md:px-4 md:py-4">{children}</main>
    </div>
  );
}
