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
  'linear-gradient(135deg,#f97316,#eab308)',
] as const;

const orbitNodes = [
  'left-[10%] top-[36%] h-2.5 w-2.5',
  'left-[24%] top-[14%] h-2 w-2',
  'left-[60%] top-[10%] h-2.5 w-2.5',
  'right-[7%] top-[28%] h-3 w-3',
  'right-[12%] bottom-[19%] h-2.5 w-2.5',
  'left-[54%] bottom-[11%] h-2 w-2',
] as const;

const orbitParticles = [
  'left-[17%] top-[24%] h-1 w-1 opacity-75',
  'left-[30%] top-[58%] h-1.5 w-1.5 opacity-60',
  'left-[72%] top-[22%] h-1 w-1 opacity-65',
  'right-[16%] top-[16%] h-1 w-1 opacity-55',
  'right-[22%] bottom-[30%] h-1.5 w-1.5 opacity-70',
  'left-[44%] bottom-[18%] h-1 w-1 opacity-50',
] as const;

function HeroProductVisual() {
  return (
    <div className="relative w-full">
      <div
        aria-hidden="true"
        className="hero-orbit-system pointer-events-none absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 opacity-55 sm:h-[26rem] sm:w-[26rem] sm:opacity-70 lg:h-[36rem] lg:w-[36rem] lg:opacity-100"
      >
        <div className="hero-glow-violet animate-glow-pulse absolute left-1/2 top-1/2 h-[11rem] w-[11rem] -translate-x-1/2 -translate-y-1/2 lg:h-[18rem] lg:w-[18rem]" />
        <div className="hero-glow-violet hero-glow-secondary animate-glow-pulse animation-delay-200 absolute left-1/2 top-1/2 hidden h-[23rem] w-[23rem] -translate-x-1/2 -translate-y-1/2 sm:block lg:h-[27rem] lg:w-[27rem]" />
        <div className="hero-glow-cyan animate-glow-pulse animation-delay-300 absolute left-[70%] top-[66%] h-[10rem] w-[10rem] -translate-x-1/2 -translate-y-1/2 sm:h-[13rem] sm:w-[13rem] lg:h-[19rem] lg:w-[19rem]" />

        <div className="hero-orbit hero-orbit-1 absolute left-1/2 top-1/2 h-[14rem] w-[14rem] -translate-x-1/2 -translate-y-1/2 sm:h-[18rem] sm:w-[18rem] lg:h-[20rem] lg:w-[20rem]" />
        <div className="hero-orbit hero-orbit-2 absolute left-1/2 top-1/2 h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 sm:h-[24rem] sm:w-[24rem] lg:h-[28rem] lg:w-[28rem]" />
        <div className="hero-orbit hero-orbit-3 absolute left-1/2 top-1/2 hidden h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 lg:block" />
        <div className="hero-orbit hero-orbit-4 absolute left-1/2 top-1/2 hidden h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 lg:block" />

        {orbitNodes.map((className) => (
          <span key={className} className={`hero-node absolute hidden sm:block ${className}`} />
        ))}

        {orbitParticles.map((className) => (
          <span key={className} className={`hero-particle absolute hidden sm:block ${className}`} />
        ))}
      </div>

      <Image
        src="/branding/phone-and-tent.png"
        alt="Table Tent físico y menú digital de elmenuxfa en un smartphone"
        width={1122}
        height={1402}
        priority
        className="animate-float-slow relative z-10 block h-auto w-full select-none drop-shadow-[0_40px_100px_rgba(0,0,0,0.55)]"
      />
    </div>
  );
}

export function Hero({ whatsappHref }: HeroProps) {
  return (
    <section id="inicio" className="hero-shell relative isolate overflow-hidden px-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-80" />
        <div className="hero-glow-violet absolute left-[58%] top-[10%] hidden h-[34rem] w-[34rem] -translate-x-1/2 opacity-90 lg:block xl:h-[40rem] xl:w-[40rem]" />
        <div className="hero-glow-violet hero-glow-secondary absolute left-[72%] top-[22%] hidden h-[28rem] w-[28rem] -translate-x-1/2 opacity-70 lg:block" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-14 lg:pt-10">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-6 xl:gap-8">
          <div className="mx-auto min-w-0 max-w-[36rem] text-center lg:mx-0 lg:max-w-[36.5rem] lg:text-left xl:max-w-[38rem]">
            <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-[#221743]/45 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_16px_34px_-24px_rgba(124,58,237,0.95)] backdrop-blur-xl sm:px-4 sm:py-2 sm:text-[13px]">
              <span className="text-violet-200">#</span>
              Menú digital + QR + Table Tent{' '}
              <span className="rounded-full bg-[#FACC15] px-1.5 py-0.5 text-[10px] font-bold text-[#0B0F1A] sm:px-2 sm:text-[11px]">
                incluido
              </span>
            </div>

            <h1 className="mx-auto mt-4 max-w-[19rem] font-[var(--font-display)] text-[1.95rem] font-black leading-[1.03] tracking-[-0.04em] text-white sm:max-w-[30rem] sm:text-[2.6rem] lg:mx-0 lg:max-w-none lg:text-[3.05rem] xl:text-[3.35rem]">
              Tu menú digital listo para que tus clientes escaneen, elijan y{' '}
              <span className="text-[#FACC15]">ordenen.</span>
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

            <div className="animate-fade-up animation-delay-500 mt-7 rounded-[1.45rem] border border-white/8 bg-[#0d1323]/74 px-4 py-4 backdrop-blur-xl sm:px-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div className="flex -space-x-2.5 sm:-space-x-3">
                  {avatarGradients.map((gradient, index) => (
                    <span
                      key={gradient}
                      className="inline-flex h-8 w-8 rounded-full border-2 border-[#0d1323] sm:h-11 sm:w-11"
                      style={{ background: gradient, zIndex: 10 - index }}
                    />
                  ))}
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

          <div className="animate-fade-up animation-delay-300 relative mx-auto flex w-full min-w-0 justify-center lg:mx-0 lg:justify-end">
            <div className="w-full max-w-[20rem] sm:max-w-[24rem] lg:max-w-[30rem] xl:max-w-[33rem]">
              <HeroProductVisual />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
