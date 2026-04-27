import Link from 'next/link';
import { ArrowRight, MessageCircle, Rocket } from 'lucide-react';

type CTASectionProps = {
  whatsappHref: string;
  demoHref: string;
};

export function CTASection({ whatsappHref, demoHref }: CTASectionProps) {
  return (
    <section id="cta" className="mx-auto max-w-7xl px-6 py-16 lg:py-18">
      <div className="overflow-hidden rounded-[2rem] border border-violet-400/20 bg-[linear-gradient(90deg,#7c3aed_0%,#5120a9_38%,#161022_100%)] shadow-[0_35px_120px_-45px_rgba(124,58,237,0.95)]">
        <div className="grid gap-8 px-7 py-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-10 lg:py-10">
          <div className="flex items-start gap-4">
            <span className="mt-1 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
              <Rocket className="h-7 w-7" />
            </span>
            <div className="max-w-2xl">
              <h2 className="font-[var(--font-display)] text-3xl font-black tracking-[-0.03em] text-white sm:text-[2.35rem]">
                Empieza a vender con un menú digital profesional.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-violet-100/80 sm:text-[15px]">
                Presenta mejor tu catálogo, recibe pedidos más claros y acompaña la experiencia del cliente desde el menú hasta la entrega.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:min-w-[22rem]">
            <Link
              href={whatsappHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-4 text-sm font-bold text-[#0B0F1A] shadow-[0_22px_50px_-24px_rgba(250,204,21,0.95)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047]"
            >
              Solicitar demo por WhatsApp
              <MessageCircle className="h-4 w-4" />
            </Link>
            <Link
              href={demoHref}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-transparent px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:border-white/35 hover:bg-white/8"
            >
              Ver menú de ejemplo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}