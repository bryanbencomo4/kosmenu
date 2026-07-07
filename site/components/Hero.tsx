import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronRight,
  Layers,
  PencilLine,
  QrCode,
  MessageCircle,
  Rocket,
} from 'lucide-react';

type HeroProps = {
  whatsappHref: string;
  appHref: string;
};

const heroHighlights = [
  { label: 'Escaneo rápido', detail: 'sin apps para clientes', icon: QrCode },
  { label: 'Menú actualizado', detail: 'sin reimprimir', icon: PencilLine },
  { label: 'Table Tent incluido', detail: 'listo para tu mesa', icon: Layers },
  { label: 'Más orden al vender', detail: 'menos errores', icon: Rocket },
] as const;

const avatarTokens = ['A', 'L', 'M', 'R', 'S'] as const;

export function Hero({ whatsappHref }: HeroProps) {
  return (
    <section id="inicio" className="hero-shell relative isolate overflow-hidden px-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-80" />
        <div className="hero-glow-violet absolute left-[58%] top-[10%] hidden h-[34rem] w-[34rem] -translate-x-1/2 opacity-90 lg:block xl:h-[40rem] xl:w-[40rem]" />
        <div className="hero-glow-violet hero-glow-secondary absolute left-[72%] top-[22%] hidden h-[28rem] w-[28rem] -translate-x-1/2 opacity-70 lg:block" />
        <div className="hero-glow-cyan absolute bottom-[-8%] right-[-8%] hidden h-[26rem] w-[26rem] opacity-60 lg:block" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-14 lg:pt-10">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)] lg:gap-6 xl:gap-8">
          <div className="mx-auto min-w-0 max-w-[36rem] text-center lg:mx-0 lg:max-w-[36.5rem] lg:text-left xl:max-w-[38rem]">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-[#221743]/45 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_16px_34px_-24px_rgba(124,58,237,0.95)] backdrop-blur-xl sm:px-4 sm:py-2 sm:text-[13px]">
              <QrCode className="h-3.5 w-3.5 text-violet-200 sm:h-4 sm:w-4" />
              Menú digital + QR + Table Tent <span className="text-[#FACC15]">incluido</span>
            </div>

            <h1 className="mx-auto mt-4 max-w-[19rem] font-[var(--font-display)] text-[1.95rem] font-black leading-[1.03] tracking-[-0.04em] text-white sm:max-w-[30rem] sm:text-[2.6rem] lg:mx-0 lg:max-w-none lg:text-[3.05rem] xl:text-[3.35rem]">
              <span className="block">Tu menú digital listo para que tus clientes</span>
              <span className="block text-[#FACC15]">escaneen, elijan y ordenen.</span>
            </h1>

            <p className="animate-fade-up animation-delay-300 mx-auto mt-5 max-w-[31rem] text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7 lg:mx-0 lg:max-w-[33rem] lg:text-[0.98rem] lg:leading-7">
              Incluye menú online, QR personalizado y Table Tent físico para colocar en tus mesas. Sin apps, sin complicaciones y listo para usar.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {heroHighlights.map((item, index) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className={`animate-fade-up flex min-h-[6.5rem] min-w-0 items-start gap-3 rounded-[1.2rem] border border-white/8 bg-[#0d1323]/72 px-3.5 py-3.5 text-left text-[0.88rem] font-medium text-slate-100 sm:min-h-[7rem] sm:px-4 sm:py-4 sm:text-[0.95rem] ${
                      index === 0 ? 'animation-delay-300' : index < 3 ? 'animation-delay-500' : 'animation-delay-700'
                    }`}
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-violet-400/22 bg-violet-500/10 text-violet-300 shadow-[0_12px_24px_-20px_rgba(124,58,237,0.95)] sm:h-10 sm:w-10">
                      <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block text-[1em] font-semibold text-white">{item.label}</span>
                      <span className="mt-1 block text-[0.98em] leading-[1.25] text-slate-300/90">{item.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row lg:items-start lg:justify-start">
              <Link
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group animate-fade-up animation-delay-500 relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FACC15] px-6 py-4 text-base font-bold text-[#0B0F1A] shadow-[0_34px_90px_-18px_rgba(250,204,21,1)] transition-all duration-300 hover:scale-[1.04] hover:bg-[#fde047] sm:min-w-[18.5rem] sm:w-auto sm:px-9"
              >
                <span className="animate-shine absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 blur-md" />
                Solicitar activación ahora
                <MessageCircle className="h-4 w-4" />
              </Link>
              <Link
                href="#demo"
                className="animate-fade-up animation-delay-500 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/14 bg-[#11182a]/55 px-8 py-4 text-base font-medium text-white/90 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/24 hover:bg-white/6 sm:w-auto"
              >
                Ver demo del menú
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <p className="animate-fade-up animation-delay-700 mt-3 text-center text-xs font-medium text-slate-300/85 sm:text-sm lg:text-left">
              Desde <span className="text-[#FACC15]">$10/mes</span> · Activación rápida · Ideal para restaurantes, cafés y food trucks
            </p>

            <div className="animate-fade-up animation-delay-500 mt-7 rounded-[1.45rem] border border-white/8 bg-[#0d1323]/74 px-4 py-4 backdrop-blur-xl sm:px-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div className="flex -space-x-2.5 sm:-space-x-3">
                  {avatarTokens.map((item, index) => (
                    <span
                      key={item}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0d1323] bg-[linear-gradient(135deg,#f3d062,#7C3AED)] text-[11px] font-bold text-white sm:h-11 sm:w-11 sm:text-sm"
                      style={{ zIndex: 10 - index }}
                    >
                      {item}
                    </span>
                  ))}
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0d1323] bg-[#40307a] text-[11px] font-bold text-white sm:h-11 sm:w-11 sm:text-sm">
                    +100
                  </span>
                </div>

                <div className="text-center sm:text-left">
                  <div className="flex items-center justify-center gap-2 sm:justify-start sm:gap-3">
                    <span className="text-[1.05rem] leading-none text-[#FACC15] sm:text-[1.5rem]">★★★★★</span>
                    <span className="text-[1.35rem] font-black tracking-[-0.04em] text-white sm:text-[2rem]">4.9/5</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300 sm:text-sm">
                    Restaurantes y cafés ya venden mejor con su menú digital
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="animate-fade-up animation-delay-300 relative mx-auto flex w-full min-w-0 justify-center lg:mx-0 lg:justify-end lg:pr-0">
            <div className="relative w-full max-w-[20rem] sm:max-w-[24rem] lg:max-w-[32rem] xl:max-w-[36rem]">
              <Image
                src="/branding/hero-visual-mock.png"
                alt="Table Tent físico y menú digital de elmenuxfa en un smartphone"
                width={544}
                height={612}
                priority
                className="h-auto w-full select-none"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
