import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronRight,
  MessageCircle,
  QrCode,
  Sparkles,
  Boxes,
  CircleDollarSign,
  Headset,
  Rocket,
  TrendingUp,
} from 'lucide-react';

type HeroProps = {
  whatsappHref: string;
  appHref: string;
};

const heroHighlights = [
  { label: 'Menú digital', detail: 'con link y QR', icon: QrCode },
  { label: 'Pedidos directos', detail: 'por WhatsApp', icon: MessageCircle },
  { label: 'Tracking del pedido', detail: 'en tiempo real', icon: Boxes },
  { label: 'Sin comisiones', detail: 'por cada pedido', icon: CircleDollarSign },
] as const;

const supportCards = [
  {
    title: 'Sin comisiones',
    description: 'Tú te quedas con todo',
    icon: CircleDollarSign,
  },
  {
    title: 'Fácil y rápido',
    description: 'Configura tu menú en minutos',
    icon: Rocket,
  },
  {
    title: 'Soporte 24/7',
    description: 'Siempre listos para ayudarte',
    icon: Headset,
  },
  {
    title: 'Hecho para crecer',
    description: 'Escala tu negocio sin límites',
    icon: TrendingUp,
  },
] as const;

const avatarTokens = ['A', 'L', 'M', 'R', 'S'] as const;

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

export function Hero({ whatsappHref, appHref }: HeroProps) {
  return (
    <section id="inicio" className="hero-shell relative isolate overflow-hidden px-0">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-grid absolute inset-0 opacity-80" />
        <div className="hero-glow-violet absolute left-[34%] top-[8%] h-[19rem] w-[19rem] -translate-x-1/2 opacity-65 sm:h-[24rem] sm:w-[24rem] lg:left-[58%] lg:top-[12%] lg:h-[38rem] lg:w-[38rem] lg:opacity-100" />
        <div className="hero-glow-violet hero-glow-secondary absolute left-[68%] top-[18%] hidden h-[33rem] w-[33rem] -translate-x-1/2 lg:block" />
        <div className="hero-glow-cyan absolute bottom-[-10%] right-[-24%] h-[18rem] w-[18rem] opacity-55 sm:right-[-14%] sm:h-[22rem] sm:w-[22rem] lg:bottom-[-14%] lg:right-[-10%] lg:h-[34rem] lg:w-[34rem] lg:opacity-100" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-16 lg:pt-14">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 xl:gap-12">
        <div className="mx-auto min-w-0 max-w-[36rem] text-center lg:mx-0 lg:max-w-[48rem] lg:text-left">
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-[#221743]/45 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_16px_34px_-24px_rgba(124,58,237,0.95)] backdrop-blur-xl will-change-transform will-change-opacity sm:px-4 sm:py-2 sm:text-[13px]">
            <span className="text-sm">🚀</span>
            Vende por WhatsApp sin apps de terceros
          </div>

          <div className="animate-fade-up animation-delay-100 mt-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#FACC15] will-change-transform will-change-opacity sm:text-[13px] sm:tracking-[0.22em]">
            <Sparkles className="h-3 w-3 text-[#FACC15] sm:h-3.5 sm:w-3.5" />
            Hecho para negocios de comida
          </div>

          <h1 className="mx-auto mt-4 max-w-[18.5rem] font-[var(--font-display)] text-[2rem] font-black leading-[0.96] tracking-[-0.05em] text-white sm:max-w-[32rem] sm:text-[3rem] lg:mx-0 lg:max-w-[36rem] lg:text-[3.55rem] xl:text-[3.8rem]">
            <span className="animate-fade-up animation-delay-200 block will-change-transform will-change-opacity">
              Menú digital para
            </span>
            <span className="animate-fade-up animation-delay-300 block will-change-transform will-change-opacity">
              vender por WhatsApp
            </span>
            <span className="animate-fade-up animation-delay-500 block will-change-transform will-change-opacity">
              <span className="inline-block pr-[0.04em] bg-gradient-to-r from-[#d4b2ff] via-[#bf87ff] to-[#7C3AED] bg-clip-text text-transparent">
                sin caos ni comisiones
              </span>
            </span>
          </h1>

          <p className="animate-fade-up animation-delay-300 mx-auto mt-5 max-w-[31rem] text-[0.95rem] leading-6 text-slate-300/88 will-change-transform will-change-opacity sm:text-base sm:leading-7 lg:mx-0 lg:max-w-[33rem] lg:text-[0.98rem] lg:leading-7">
            Comparte tu menú por link o QR y recibe pedidos organizados en WhatsApp, sin depender de apps de terceros.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {heroHighlights.map((item, index) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className={`animate-fade-up flex min-h-[6.5rem] min-w-0 items-start gap-3 rounded-[1.2rem] border border-white/8 bg-[#0d1323]/72 px-3.5 py-3.5 text-left text-[0.88rem] font-medium text-slate-100 will-change-transform will-change-opacity sm:min-h-[7rem] sm:px-4 sm:py-4 sm:text-[0.95rem] ${
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
              className="group animate-fade-up animation-delay-500 relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FACC15] px-6 py-4 text-base font-bold text-[#0B0F1A] shadow-[0_34px_90px_-18px_rgba(250,204,21,1)] transition-all duration-300 hover:scale-[1.04] hover:bg-[#fde047] hover:shadow-[0_40px_100px_-16px_rgba(250,204,21,1)] active:scale-95 sm:w-auto sm:px-9"
            >
              <span className="animate-shine absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 blur-md" />
              Crear mi menú gratis
              <Rocket className="h-4 w-4" />
            </Link>
            <Link
              href={appHref}
              className="animate-fade-up animation-delay-500 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 bg-[#11182a]/55 px-8 py-4 text-base font-medium text-white/84 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/20 hover:bg-white/6 hover:text-white will-change-transform will-change-opacity sm:w-auto"
            >
              Iniciar sesion o registrarte
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <p className="animate-fade-up animation-delay-700 mt-3 text-center text-xs font-medium text-slate-300/85 sm:text-sm lg:text-left">
            Sin app para tus clientes · Sin comisión por pedido · Listo en minutos
          </p>

          <div className="animate-fade-up animation-delay-500 mt-7 flex flex-col gap-5 will-change-transform will-change-opacity">
            <div className="flex flex-col items-center gap-4 rounded-[1.45rem] border border-white/8 bg-[#0d1323]/74 px-4 py-4 text-center backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
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

                <div>
                  <div className="flex items-center justify-center gap-2 sm:justify-start sm:gap-3">
                    <span className="text-[1.05rem] leading-none text-[#FACC15] sm:text-[1.5rem]">★★★★★</span>
                    <span className="text-[1.35rem] font-black tracking-[-0.04em] text-white sm:text-[2rem]">4.9/5</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300 sm:text-sm">Más de 100 negocios ya reciben pedidos con elmenuxfa</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="animate-fade-up animation-delay-300 relative mx-auto flex w-full min-w-0 max-w-[20rem] justify-center pt-2 sm:max-w-[25rem] lg:-mt-5 lg:max-w-[42rem] lg:justify-end lg:pt-0">
          <div
            aria-hidden="true"
            className="hero-orbit-system absolute left-1/2 top-1/2 h-[20rem] w-[20rem] -translate-x-1/2 -translate-y-1/2 opacity-55 sm:h-[26rem] sm:w-[26rem] sm:opacity-70 lg:left-[56%] lg:h-[42rem] lg:w-[42rem] lg:opacity-100 xl:left-[58%]"
          >
            <div className="hero-glow-violet animate-glow-pulse absolute left-1/2 top-1/2 h-[11rem] w-[11rem] -translate-x-1/2 -translate-y-1/2 lg:h-[20rem] lg:w-[20rem]" />
            <div className="hero-glow-violet hero-glow-secondary animate-glow-pulse animation-delay-200 absolute left-1/2 top-1/2 hidden h-[23rem] w-[23rem] -translate-x-1/2 -translate-y-1/2 sm:block lg:h-[27rem] lg:w-[27rem]" />
            <div className="hero-glow-cyan animate-glow-pulse animation-delay-300 absolute left-[70%] top-[66%] h-[10rem] w-[10rem] -translate-x-1/2 -translate-y-1/2 sm:h-[13rem] sm:w-[13rem] lg:h-[19rem] lg:w-[19rem]" />

            <div className="hero-orbit hero-orbit-1 absolute left-1/2 top-1/2 h-[14rem] w-[14rem] -translate-x-1/2 -translate-y-1/2 sm:h-[18rem] sm:w-[18rem] lg:h-[20rem] lg:w-[20rem]" />
            <div className="hero-orbit hero-orbit-2 absolute left-1/2 top-1/2 h-[19rem] w-[19rem] -translate-x-1/2 -translate-y-1/2 sm:h-[24rem] sm:w-[24rem] lg:h-[28rem] lg:w-[28rem]" />
            <div className="hero-orbit hero-orbit-3 absolute left-1/2 top-1/2 hidden h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 lg:block" />
            <div className="hero-orbit hero-orbit-4 absolute left-1/2 top-1/2 hidden h-[44rem] w-[44rem] -translate-x-1/2 -translate-y-1/2 lg:block" />

            {orbitNodes.map((className) => (
              <span key={className} className={`hero-node absolute hidden sm:block ${className}`} />
            ))}

            {orbitParticles.map((className) => (
              <span key={className} className={`hero-particle absolute hidden sm:block ${className}`} />
            ))}
          </div>

          <div className="relative z-20 w-full max-w-[16.75rem] sm:max-w-[22.5rem] lg:max-w-[39rem]">
            <div className="hidden justify-center lg:hidden">
              <div className="animate-fade-up animation-delay-500 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(28,33,67,0.84),rgba(22,27,51,0.68))] px-5 py-4 text-sm font-semibold text-slate-100 shadow-[0_20px_48px_-26px_rgba(91,33,182,0.62)] backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-1 will-change-transform will-change-opacity">
                <p className="text-sm text-slate-200">Hoy</p>
                <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">+38%</p>
                <p className="mt-2 text-sm leading-6 text-slate-200/90">más pedidos que ayer</p>
              </div>
            </div>

            <div className="relative mx-auto w-full lg:mr-0 lg:translate-x-0 xl:translate-x-2">
              <Image
                src="/hero-app-header.png"
                alt="Vista de la app de elmenuxfa en un iPhone mostrando el menú y el flujo de pedido"
                width={1024}
                height={1536}
                priority
                className="animate-float-slow relative z-10 mx-auto h-auto w-full max-w-[19rem] select-none drop-shadow-[0_36px_90px_rgba(0,0,0,0.68)] sm:max-w-[24rem] lg:ml-auto lg:max-w-[34rem] lg:drop-shadow-[0_48px_120px_rgba(0,0,0,0.82)]"
              />

              <div className="animate-fade-up animation-delay-500 absolute right-4 top-[18%] z-20 hidden w-[11.5rem] rounded-[1.9rem] border border-white/10 bg-[linear-gradient(180deg,rgba(34,39,78,0.84),rgba(20,25,49,0.72))] px-4 py-4 text-white shadow-[0_24px_64px_-28px_rgba(124,58,237,0.72)] backdrop-blur-2xl transition-transform duration-300 hover:-translate-y-1 lg:block will-change-transform will-change-opacity xl:right-6">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[0.95rem] font-medium text-slate-100">Hoy</p>
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-300" />
                </div>
                <p className="mt-2.5 text-[2.2rem] font-black tracking-[-0.06em] text-white">+38%</p>
                <p className="mt-1.5 text-[1rem] leading-6 text-slate-200/92">
                  más pedidos
                  <br />
                  que ayer
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="mt-8 hidden gap-px overflow-hidden rounded-[1.9rem] border border-white/8 bg-white/6 lg:grid lg:grid-cols-2 xl:grid-cols-4 xl:px-1 xl:py-1">
          {supportCards.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={item.title}
                className={`animate-fade-up flex min-h-[104px] items-center gap-4 bg-[#0d1323]/96 px-6 py-5 text-slate-100 transition-all duration-300 hover:-translate-y-1 hover:bg-[#11192b] will-change-transform will-change-opacity ${
                  index === 0 ? 'animation-delay-300' : 'animation-delay-500'
                }`}
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-400/18 bg-violet-500/10 text-violet-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-lg font-semibold leading-tight text-white">{item.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-slate-300">{item.description}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}