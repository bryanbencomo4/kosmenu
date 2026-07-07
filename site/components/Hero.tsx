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

function HeroProductVisual() {
  return (
    <div className="relative w-full">
      <div className="relative overflow-hidden rounded-[1.65rem] border border-white/8 bg-[linear-gradient(180deg,#0c1224_0%,#090f1d_100%)] px-3 pb-2 pt-3 sm:rounded-[1.85rem] sm:px-4 sm:pb-3 sm:pt-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_38%_72%,rgba(124,58,237,0.34),transparent_52%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(217,70,239,0.14),transparent_38%)]"
        />

        <div className="absolute left-3 top-3 z-20 max-w-[10.5rem] rounded-[1rem] border border-violet-300/18 bg-[#17102b]/92 p-2.5 shadow-[0_18px_40px_-24px_rgba(124,58,237,0.95)] backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[11.5rem] sm:p-3">
          <div className="flex items-start gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.7rem] border border-[#FACC15]/35 bg-[#FACC15]/12 text-[#FACC15]">
              <Layers className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[0.72rem] font-bold leading-tight text-white sm:text-[0.78rem]">
                Incluye <span className="text-[#FACC15]">Table Tent físico</span>
              </p>
              <p className="mt-0.5 text-[0.62rem] leading-snug text-slate-300/88 sm:text-[0.68rem]">
                QR listo para colocar en tu mesa
              </p>
            </div>
          </div>
        </div>

        <svg
          aria-hidden="true"
          viewBox="0 0 320 420"
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="hero-arrow-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M 104 86 C 98 108, 86 132, 72 158 C 62 178, 54 198, 48 218"
            fill="none"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth="1.5"
            strokeLinecap="round"
            filter="url(#hero-arrow-glow)"
          />
          <path
            d="M 104 86 C 98 108, 86 132, 72 158 C 62 178, 54 198, 48 218"
            fill="none"
            stroke="rgba(196,181,253,0.7)"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <circle cx="48" cy="218" r="3" fill="#FACC15" />
          <circle cx="48" cy="218" r="5.5" fill="rgba(250,204,21,0.2)" />
        </svg>

        <Image
          src="/branding/hero-product.png"
          alt="Table Tent físico y menú digital de elmenuxfa en un smartphone"
          width={819}
          height={1024}
          priority
          className="relative z-0 mx-auto h-auto w-full max-w-[94%] select-none drop-shadow-[0_28px_60px_-20px_rgba(0,0,0,0.75)]"
        />
      </div>
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
