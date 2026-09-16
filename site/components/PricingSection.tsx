import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { SubscriptionBillingTabs } from './SubscriptionBillingTabs';

type PricingSectionProps = {
  signupHref: string;
  supportHref: string;
};

export function PricingSection({ signupHref, supportHref }: PricingSectionProps) {
  return (
    <section
      id="kit"
      className="perf-section relative scroll-mt-28 overflow-hidden border-b border-white/8 bg-[#050916]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-12%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.16)_0%,transparent_70%)] blur-3xl" />
        <div className="absolute right-[-10%] bottom-[8%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.08)_0%,transparent_70%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div id="pricing" className="scroll-mt-28 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#FACC15]/25 bg-[#FACC15]/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[#FDE68A]">
            Precio
          </span>
          <h2 className="mt-5 font-[var(--font-display)] text-[1.75rem] font-black leading-[1.08] tracking-[-0.045em] text-white sm:text-[2.45rem] lg:text-[2.85rem]">
            Un precio claro para poner tu restaurante en marcha
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7">
            Activa la plataforma, recibe tu Kit Portamenú Inteligente y elige si pagas mes a mes o al año.
          </p>
        </div>

        <div className="mt-8">
          <SubscriptionBillingTabs signupHref={signupHref} />
        </div>

        <div
          id="extras"
          className="mt-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(14,20,36,0.94),rgba(10,15,28,0.96))] sm:grid sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center"
        >
          <div className="px-5 py-6 sm:px-7 sm:py-7">
            <h3 className="font-[var(--font-display)] text-[1.35rem] font-black text-white">
              ¿Necesitas más mesas?
            </h3>
            <p className="mt-2 text-[0.92rem] leading-6 text-slate-300/90">
              Agrega portamenús extra cuando tu restaurante crezca.
            </p>
            <p className="mt-4 font-[var(--font-display)] text-[2.2rem] font-black leading-none tracking-[-0.04em] text-[#FACC15]">
              +$2.50
              <span className="ml-2 text-[1rem] font-semibold tracking-normal text-white">c/u</span>
            </p>
            <Link
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#FDE68A] transition hover:text-white"
            >
              Pedir portamenús extra
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="relative border-t border-white/8 px-5 py-5 sm:border-l sm:border-t-0">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-[9.5rem]">
              <Image
                src="/branding/table-tent.png"
                alt="Portamenú premium de elmenuxfa con QR para autoservicio en mesa"
                fill
                sizes="160px"
                className="object-contain object-center drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
