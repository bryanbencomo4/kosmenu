import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { businessBenefitsHref, businessSiteUrl } from '../_lib/public-site-config';
import { KitCheckoutForm } from './_components/KitCheckoutForm';

const canonicalUrl = `${businessSiteUrl.replace(/\/$/, '')}/kit`;

export const metadata: Metadata = {
  title: 'Pedir Kit Portamenú | elmenuxfa',
  description:
    'Solicita tu Kit Portamenú Inteligente: 4 de obsequio, extras a $2.50 y envío por Zoom en Venezuela (flete a cargo del cliente).',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function KitCheckoutPage() {
  return (
    <main className="min-h-screen bg-[#040814] px-4 py-8 text-white sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href={businessBenefitsHref}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
        </div>

        <header className="mb-8 max-w-2xl">
          <span className="inline-flex rounded-full border border-[#FACC15]/25 bg-[#FACC15]/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#FDE68A]">
            Kit Portamenú
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[1.05] tracking-[-0.045em] text-white sm:text-[2.75rem]">
            Pedido y envío Zoom
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-300 sm:text-[15px]">
            4 portamenús de obsequio, extras a $2.50 c/u. Despacho a la oficina Zoom que elijas;
            el flete lo pagas al retirar.
          </p>
        </header>

        <KitCheckoutForm />
      </div>
    </main>
  );
}
