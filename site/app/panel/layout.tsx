import type { ReactNode } from 'react';

export const metadata = {
  title: 'Conversaciones | El Menú XFA',
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#f4f2ef] text-[#1c1917]">
      <header className="border-b border-black/10 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Panel restaurante
            </p>
            <h1 className="text-base font-bold">Conversaciones</h1>
          </div>
          <a
            href="https://app.elmenuxfa.com"
            className="text-sm font-medium text-stone-600 underline-offset-2 hover:underline"
          >
            Volver al panel
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </div>
  );
}
