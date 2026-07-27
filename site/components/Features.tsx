import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Zap } from 'lucide-react';

type FeaturesProps = {
  signupHref: string;
};

const benefits = [
  'Tus clientes escanean y entienden el menú al instante',
  'Actualizas productos y precios sin reimprimir',
  'Recibes pedidos con menos errores y menos preguntas repetidas',
  'Tu negocio se ve más moderno y profesional',
  'Puedes compartir tu menú a través de redes sociales',
] as const;

export function Features({ signupHref }: FeaturesProps) {
  return (
    <section id="beneficios" className="relative isolate overflow-hidden border-t border-white/8 bg-black">
      <div className="grid items-center lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14 lg:ml-auto lg:max-w-[38rem] lg:py-16 lg:pl-8 lg:pr-10 xl:max-w-[40rem] xl:pl-10">
          <span className="inline-flex w-fit items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-400 sm:text-xs">
            <Zap className="h-3.5 w-3.5 text-[#FACC15]" />
            Por qué lo necesitas
          </span>

          <h2 className="mt-5 max-w-[22rem] font-[var(--font-display)] text-[1.85rem] font-black leading-[1.04] tracking-[-0.045em] text-white sm:max-w-[28rem] sm:text-[2.35rem] lg:max-w-none lg:text-[2.65rem] xl:text-[2.85rem]">
            Tu restaurante necesita un menú que{' '}
            <span className="bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_52%,#9333ea_100%)] bg-clip-text text-transparent">
              trabaje por ti
            </span>
          </h2>

          <p className="mt-4 max-w-[30rem] text-[0.94rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7">
            Haz que tus clientes escaneen, elijan y ordenen más fácil, con una experiencia clara, rápida y profesional.
          </p>

          <div className="mt-7 rounded-[1.35rem] border border-white/8 bg-[#0c1220]/95 px-4 py-5 shadow-[0_28px_70px_-40px_rgba(0,0,0,0.95)] sm:px-5 sm:py-6">
            <p className="text-[0.98rem] font-semibold text-white sm:text-base">Con el menú digital logras:</p>

            <ul className="mt-4 space-y-3.5">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-[0.9rem] leading-6 text-slate-200/92 sm:text-[0.95rem]">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/25">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-7">
            <Link
              href={signupHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-4 text-base font-bold text-[#0B0F1A] shadow-[0_28px_70px_-18px_rgba(250,204,21,0.95)] transition-all duration-300 hover:scale-[1.02] hover:bg-[#fde047] sm:w-auto sm:min-w-[16.5rem]"
            >
              Crear mi menú
              <ArrowRight className="h-4 w-4" />
            </Link>

            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-slate-300/85">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              Incluye QR personalizado y Table Tent físico para tu restaurante.
            </p>
          </div>
        </div>

        <div className="relative min-w-0 px-4 pb-10 sm:px-6 sm:pb-14 lg:px-0 lg:pb-0 lg:pr-0">
          <div className="relative overflow-hidden rounded-[1.25rem] lg:rounded-l-[1.75rem] lg:rounded-r-none">
            <Image
              src="/branding/benefits-restaurant-scene.png"
              alt="Cliente escaneando el menú digital con Table Tent y smartphone en un restaurante"
              width={1024}
              height={768}
              quality={100}
              unoptimized
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="block h-auto w-full max-w-none"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.88)_8%,rgba(0,0,0,0.55)_18%,rgba(0,0,0,0.22)_30%,transparent_48%)] lg:bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.92)_6%,rgba(0,0,0,0.68)_14%,rgba(0,0,0,0.28)_26%,transparent_42%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.35)_100%)] lg:hidden"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
