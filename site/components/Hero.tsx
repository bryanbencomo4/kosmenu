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

const avatarGradients = [
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#06b6d4,#3b82f6)',
  'linear-gradient(135deg,#22c55e,#14b8a6)',
] as const;

export function Hero({ whatsappHref }: HeroProps) {
  return (
    <section id="inicio" className="hero-shell relative isolate overflow-hidden px-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-80 [mask-image:linear-gradient(90deg,black_0%,black_52%,transparent_72%)]" />
        <div className="hero-glow-violet absolute left-[58%] top-[10%] hidden h-[34rem] w-[34rem] -translate-x-1/2 opacity-90 lg:block xl:h-[40rem] xl:w-[40rem]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-14 lg:pt-10">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-5 xl:gap-6">
          <div className="mx-auto min-w-0 max-w-[36rem] text-center lg:mx-0 lg:max-w-[37rem] lg:text-left xl:max-w-[40rem]">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-[#221743]/45 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_16px_34px_-24px_rgba(124,58,237,0.95)] backdrop-blur-xl sm:px-4 sm:py-2 sm:text-[13px]">
              <QrCode className="h-3.5 w-3.5 text-violet-200 sm:h-4 sm:w-4" />
              Menú digital + QR + Table Tent <span className="text-[#FACC15]">incluido</span>
            </div>

            <h1 className="mx-auto mt-4 max-w-[19rem] font-[var(--font-display)] text-[1.95rem] font-black leading-[1.02] tracking-[-0.045em] text-white sm:max-w-[30rem] sm:text-[2.6rem] lg:mx-0 lg:max-w-none lg:text-[3.15rem] xl:text-[3.45rem]">
              <span className="block">Tu menú digital listo para que tus clientes</span>
              <span className="block text-[#FACC15]">escaneen, elijan y ordenen.</span>
            </h1>

            <p className="animate-fade-up animation-delay-300 mx-auto mt-5 max-w-[31rem] text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7 lg:mx-0 lg:max-w-[33rem] lg:text-[0.98rem] lg:leading-7">
              Incluye menú online, QR personalizado y Table Tent físico para colocar en tus mesas. Sin apps, sin complicaciones y listo para usar.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3">
              {heroHighlights.map((item, index) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className={`animate-fade-up flex min-h-[6.25rem] min-w-0 items-start gap-3 rounded-[1.15rem] border border-white/7 bg-[#0b101d]/78 px-3.5 py-3.5 text-left text-[0.86rem] font-medium text-slate-100 sm:min-h-[6.75rem] sm:px-4 sm:py-4 sm:text-[0.92rem] ${
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
                className="animate-fade-up animation-delay-500 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-6 py-4 text-base font-semibold text-white/92 transition-all duration-300 hover:text-white sm:w-auto"
              >
                Ver demo del menú
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <p className="animate-fade-up animation-delay-700 mt-3 text-center text-xs font-medium text-slate-300/85 sm:text-sm lg:text-left">
              Desde <span className="text-[#FACC15]">$10/mes</span> · Activación rápida · Ideal para restaurantes, cafés y food trucks
            </p>

            <div className="animate-fade-up animation-delay-500 mt-7">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
                <div className="flex items-center -space-x-2.5 sm:-space-x-3">
                  {avatarGradients.map((gradient, index) => (
                    <span
                      key={gradient}
                      className="inline-flex h-9 w-9 rounded-full border-2 border-[#060b17] sm:h-10 sm:w-10"
                      style={{ background: gradient, zIndex: 10 - index }}
                    />
                  ))}
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#060b17] bg-[#3b2f6b] text-[10px] font-bold text-white sm:h-10 sm:w-10 sm:text-[11px]"
                    style={{ zIndex: 5 }}
                  >
                    +100
                  </span>
                </div>

                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="text-[1.1rem] leading-none text-[#FACC15] sm:text-[1.35rem]">★★★★★</span>
                  <span className="text-[1.5rem] font-black tracking-[-0.04em] text-white sm:text-[1.85rem]">4.9/5</span>
                </div>
              </div>
              <p className="mt-2.5 text-center text-xs text-slate-300/90 sm:text-left sm:text-sm">
                Restaurantes y cafés ya venden mejor con su menú digital
              </p>
            </div>
          </div>

          <div className="animate-fade-up animation-delay-300 relative mx-auto flex w-full min-w-0 justify-center lg:mx-0 lg:justify-end">
            <div className="relative w-full max-w-[21rem] sm:max-w-[25rem] lg:max-w-[31rem] xl:max-w-[34.5rem]">
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
