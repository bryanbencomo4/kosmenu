import Link from 'next/link';
import { ChevronRight, MessageCircle } from 'lucide-react';

type CTASectionProps = {
  whatsappHref: string;
  appHref: string;
};

export function CTASection({ whatsappHref }: CTASectionProps) {
  return (
    <section id="cta" className="perf-section mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-18">
      <div className="overflow-hidden rounded-[1.8rem] border border-violet-400/20 bg-[linear-gradient(90deg,#7c3aed_0%,#5120a9_38%,#161022_100%)] shadow-[0_35px_120px_-45px_rgba(124,58,237,0.95)] sm:rounded-[2rem]">
        <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-10 lg:py-10">
          <div className="flex flex-col items-center gap-4 text-center lg:flex-row lg:items-start lg:text-left">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white sm:h-14 sm:w-14">
              <MessageCircle className="h-7 w-7" />
            </span>
            <div className="max-w-2xl">
              <h2 className="font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.03em] text-white sm:text-[2.35rem]">
                Empieza a vender con un menú digital profesional.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-violet-100/80 sm:text-[15px]">
                Activa tu menú, recibe tu QR y coloca el Table Tent en tus mesas. Rápido, claro y listo para tus clientes.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[22rem]">
            <Link
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-4 text-sm font-bold text-[#0B0F1A] shadow-[0_22px_50px_-24px_rgba(250,204,21,0.95)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047]"
            >
              Solicitar activación por WhatsApp
              <MessageCircle className="h-4 w-4" />
            </Link>
            <Link
              href="#demo"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-transparent px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:border-white/35 hover:bg-white/8"
            >
              Ver demo del menú
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}