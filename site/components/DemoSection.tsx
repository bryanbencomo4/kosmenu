'use client';

import Image from 'next/image';
import { useRef, useState, type TouchEvent } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, MapPinned, Menu as MenuIcon, ShoppingCart, Sparkles } from 'lucide-react';

const phoneScreens = [
  {
    title: 'Menú',
    subtitle: 'Explora productos',
    icon: MenuIcon,
    shellClass:
      'border-violet-400/22 bg-violet-500/10 text-violet-200 shadow-[0_0_38px_rgba(168,85,247,0.24)]',
    dotClass: 'bg-violet-200 shadow-[0_0_14px_rgba(216,180,254,0.95)]',
    connectorClass:
      'border-violet-400/25 bg-violet-500/14 text-violet-100 shadow-[0_0_34px_rgba(168,85,247,0.28)]',
    footerClass:
      'border-violet-400/18 bg-[linear-gradient(180deg,rgba(76,29,149,0.42),rgba(44,18,92,0.6))] text-violet-50',
    imageSrc: '/demo/Screenshot_1778339909.png',
    imageAlt: 'Vista del menú con la categoría de hamburguesas activa y productos destacados.',
    imageClassName: 'object-cover object-[50%_0%] scale-[1.16]',
  },
  {
    title: 'Pedido',
    subtitle: 'Checkout inicial',
    icon: ShoppingCart,
    shellClass:
      'border-violet-400/18 bg-violet-500/8 text-violet-100 shadow-[0_0_32px_rgba(167,139,250,0.18)]',
    dotClass: 'bg-violet-200/90 shadow-[0_0_14px_rgba(196,181,253,0.9)]',
    connectorClass:
      'border-violet-400/22 bg-violet-500/12 text-violet-100 shadow-[0_0_28px_rgba(167,139,250,0.24)]',
    footerClass:
      'border-violet-400/16 bg-[linear-gradient(180deg,rgba(55,25,117,0.38),rgba(35,18,74,0.56))] text-violet-50',
    imageSrc: '/demo/Screenshot_1778340594.png',
    imageAlt: 'Pantalla de checkout en el paso de pedido con resumen y nota para el negocio.',
    imageClassName: 'object-cover object-[37%_0%] scale-[1.10]',
  },
  {
    title: 'Pago',
    subtitle: 'Cierre del pedido',
    icon: BadgeCheck,
    shellClass:
      'border-violet-400/18 bg-violet-500/8 text-violet-100 shadow-[0_0_30px_rgba(167,139,250,0.18)]',
    dotClass: 'bg-violet-200/90 shadow-[0_0_14px_rgba(196,181,253,0.9)]',
    connectorClass:
      'border-violet-400/22 bg-violet-500/12 text-violet-100 shadow-[0_0_28px_rgba(167,139,250,0.24)]',
    footerClass:
      'border-violet-400/16 bg-[linear-gradient(180deg,rgba(55,25,117,0.38),rgba(35,18,74,0.56))] text-violet-50',
    imageSrc: '/demo/Screenshot_1778340734.png',
    imageAlt: 'Pantalla de checkout en el paso de pago con total final y botón de confirmar.',
    imageClassName: 'object-cover object-[50%_0%] scale-[1.12]',
  },
  {
    title: 'Tracking',
    subtitle: 'Seguimiento en vivo',
    icon: MapPinned,
    shellClass:
      'border-cyan-400/24 bg-cyan-500/10 text-cyan-100 shadow-[0_0_40px_rgba(34,211,238,0.26)]',
    dotClass: 'bg-cyan-200 shadow-[0_0_15px_rgba(165,243,252,0.95)]',
    connectorClass:
      'border-cyan-400/25 bg-cyan-500/12 text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.26)]',
    footerClass:
      'border-cyan-400/20 bg-[linear-gradient(180deg,rgba(8,88,109,0.34),rgba(8,53,71,0.56))] text-cyan-50',
    imageSrc: '/demo/Screenshot_1778340763.png',
    imageAlt: 'Pantalla de seguimiento del pedido recibido con estado, mapa y contacto del comercio.',
    imageClassName: 'object-cover object-[50%_0%] scale-[1.16]',
  },
] as const;

type PhoneScreen = (typeof phoneScreens)[number];

type PhoneFlowCardProps = {
  screen: PhoneScreen;
  index: number;
  articleClassName: string;
  showConnector?: boolean;
  showSubtitleOnMobile?: boolean;
};

function PhoneFlowCard({
  screen,
  index,
  articleClassName,
  showConnector = false,
  showSubtitleOnMobile = false,
}: PhoneFlowCardProps) {
  const Icon = screen.icon;

  return (
    <article className={articleClassName}>
      {showConnector && index > 0 ? (
        <div className="absolute -left-[1.15rem] top-[46.5%] hidden -translate-y-1/2 lg:flex">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${screen.connectorClass}`}>
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      ) : null}

      <div className="mx-auto h-1.5 w-12 rounded-full bg-white/10 sm:h-2 sm:w-16" />

      <div className="mt-1.5 flex items-center justify-between gap-2 px-1 sm:mt-4 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border sm:h-9 sm:w-9 lg:h-10 lg:w-10 ${screen.shellClass}`}>
            <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.8rem] font-bold text-white sm:text-[0.94rem] lg:text-[0.98rem]">{screen.title}</p>
            <p
              className={
                showSubtitleOnMobile
                  ? 'truncate text-[0.58rem] uppercase tracking-[0.18em] text-white/42 sm:text-[0.64rem] lg:text-[0.68rem]'
                  : 'hidden truncate text-[0.58rem] uppercase tracking-[0.18em] text-white/42 sm:block sm:text-[0.64rem] lg:text-[0.68rem]'
              }
            >
              {screen.subtitle}
            </p>
          </div>
        </div>
        <span className={`h-1.5 w-1.5 rounded-full sm:h-2.5 sm:w-2.5 ${screen.dotClass}`} />
      </div>

      <div className="mt-2 flex flex-1 flex-col sm:mt-4">
        <div className="mx-auto flex h-full w-full items-center justify-center">
          <div className="relative w-[84%] max-w-[11rem] sm:max-w-[13.6rem] lg:max-w-[14.1rem] xl:max-w-[15.2rem]">
            <div className="relative aspect-[390/844] rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,20,34,0.98),rgba(6,10,20,1))] p-[0.34rem] shadow-[0_42px_80px_-38px_rgba(0,0,0,1)] sm:rounded-[2.1rem] sm:p-[0.38rem] lg:rounded-[2.25rem] lg:p-[0.42rem]">
              <div className="pointer-events-none absolute left-1/2 top-[0.42rem] z-10 h-[0.34rem] w-[34%] -translate-x-1/2 rounded-full bg-white/10 sm:top-[0.5rem] sm:h-[0.38rem]" />
              <div className="relative h-full w-full overflow-hidden rounded-[1.55rem] bg-[#04070f] sm:rounded-[1.82rem] lg:rounded-[1.98rem]">
                <Image
                  src={screen.imageSrc}
                  alt={screen.imageAlt}
                  fill
                  sizes="(max-width: 639px) 180px, (max-width: 1023px) 230px, 260px"
                  className={`transform-gpu ${screen.imageClassName}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`mt-2 rounded-[0.8rem] border px-2.5 py-1.5 text-center text-[0.76rem] font-semibold shadow-[0_18px_34px_-28px_rgba(0,0,0,1)] sm:mt-4 sm:rounded-[1.05rem] sm:px-4 sm:py-2.5 sm:text-[0.94rem] lg:rounded-[1.15rem] lg:py-3 lg:text-[1rem] ${screen.footerClass}`}>
        {index + 1}. {screen.title}
      </div>
    </article>
  );
}

export function DemoSection() {
  const [activeMobileScreen, setActiveMobileScreen] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef(0);
  const lastMobileScreenIndex = phoneScreens.length - 1;

  function goToMobileScreen(nextIndex: number) {
    const boundedIndex = Math.max(0, Math.min(lastMobileScreenIndex, nextIndex));
    setActiveMobileScreen(boundedIndex);
  }

  function handleSliderTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchDeltaXRef.current = 0;
  }

  function handleSliderTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (touchStartXRef.current === null) return;
    const currentX = event.touches[0]?.clientX ?? touchStartXRef.current;
    touchDeltaXRef.current = currentX - touchStartXRef.current;
  }

  function handleSliderTouchEnd() {
    if (Math.abs(touchDeltaXRef.current) > 42) {
      goToMobileScreen(activeMobileScreen + (touchDeltaXRef.current < 0 ? 1 : -1));
    }

    touchStartXRef.current = null;
    touchDeltaXRef.current = 0;
  }

  return (
    <section id="demo" className="perf-section relative overflow-hidden border-y border-white/8 bg-[#040a16]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute left-[-8%] top-[18%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.24)_0%,rgba(124,58,237,0.1)_34%,transparent_72%)] blur-3xl" />
        <div className="absolute right-[-9%] top-[10%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.18)_0%,rgba(34,211,238,0.08)_36%,transparent_72%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-[1380px] px-4 py-6 sm:px-6 sm:py-11 lg:px-8 lg:py-16">
        <div className="grid gap-4 sm:gap-8 lg:grid-cols-[minmax(0,0.32fr)_minmax(0,1fr)] lg:items-center lg:gap-8 xl:gap-10">
          <div className="relative hidden max-w-[24rem] lg:block lg:max-w-[27rem] lg:pb-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.08)] sm:px-5 sm:py-2 sm:text-[11px]">
              <Sparkles className="h-3.5 w-3.5 text-[#c4b5fd]" />
              Flujo real
            </span>

            <h2 className="mt-4 max-w-[14rem] font-[var(--font-display)] text-[1.55rem] font-black leading-[0.92] tracking-[-0.05em] text-white sm:mt-5 sm:max-w-[21rem] sm:text-[2.75rem] lg:max-w-[29rem] lg:text-[3.55rem]">
              <span className="block">Así vive tu</span>
              <span className="block">cliente</span>
              <span className="block sm:hidden bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_48%,#9333ea_100%)] bg-clip-text text-transparent">
                el pedido
              </span>
              <span className="block sm:hidden bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_48%,#9333ea_100%)] bg-clip-text text-transparent">
                real
              </span>
              <span className="hidden sm:block bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_48%,#9333ea_100%)] bg-clip-text text-transparent">
                el pedido real
              </span>
            </h2>

            <p className="mt-3 max-w-[16rem] text-[0.87rem] leading-[1.5] text-slate-300/84 sm:mt-5 sm:max-w-[22rem] sm:text-[1rem] lg:max-w-[24rem] lg:text-[1.08rem]">
              Menú, checkout y tracking con capturas reales de una experiencia clara y lista para vender.
            </p>

            <div className="mt-4 h-1 w-16 rounded-full bg-[linear-gradient(90deg,#a855f7_0%,#7c3aed_58%,#22d3ee_100%)] shadow-[0_0_26px_rgba(168,85,247,0.42)] sm:mt-7 sm:w-24" />
          </div>

          <div className="relative">
            <div className="mb-4 max-w-[16rem] lg:hidden">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.08)]">
                <Sparkles className="h-3.5 w-3.5 text-[#c4b5fd]" />
                Flujo real
              </span>

              <h2 className="mt-4 max-w-[14rem] font-[var(--font-display)] text-[1.45rem] font-black leading-[0.92] tracking-[-0.05em] text-white">
                <span className="block">Así se ve</span>
                <span className="block bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_48%,#9333ea_100%)] bg-clip-text text-transparent">
                  el flujo real
                </span>
              </h2>

              <p className="mt-3 max-w-[15rem] text-[0.85rem] leading-[1.48] text-slate-300/84">
                Menú, checkout y tracking en capturas reales.
              </p>

              <div className="mt-4 h-1 w-16 rounded-full bg-[linear-gradient(90deg,#a855f7_0%,#7c3aed_58%,#22d3ee_100%)] shadow-[0_0_26px_rgba(168,85,247,0.42)]" />
            </div>

            <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden xl:block">
              <div className="absolute left-[3%] right-[3%] top-[18%] h-[62%] rounded-[50%] border border-violet-400/12" />
              <div className="absolute left-[10%] right-[10%] top-[25%] h-[48%] rounded-[50%] border border-violet-400/8" />
              <div className="absolute left-[-4%] right-[-4%] top-[6%] h-[84%] rounded-[50%] border border-cyan-400/10" />
              <div className="absolute left-[18%] top-[13%] h-3 w-3 rounded-full bg-violet-200 shadow-[0_0_20px_rgba(216,180,254,0.95)]" />
              <div className="absolute right-[14%] top-[22%] h-2.5 w-2.5 rounded-full bg-violet-200/90 shadow-[0_0_18px_rgba(216,180,254,0.88)]" />
              <div className="absolute right-[6%] top-[49%] h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_20px_rgba(165,243,252,0.92)]" />
              <div className="absolute left-[12%] bottom-[7%] h-2 w-2 rounded-full bg-violet-200/90 shadow-[0_0_18px_rgba(216,180,254,0.82)]" />
            </div>

            <div className="lg:hidden">
              <div
                data-mobile-slider
                className="relative h-[29.5rem] overflow-hidden [touch-action:pan-y]"
                onTouchStart={handleSliderTouchStart}
                onTouchMove={handleSliderTouchMove}
                onTouchEnd={handleSliderTouchEnd}
                onTouchCancel={handleSliderTouchEnd}
              >
                {phoneScreens.map((screen, index) => (
                  <div
                    key={screen.title}
                    data-mobile-slide
                    data-active={activeMobileScreen === index ? 'true' : 'false'}
                    aria-hidden={activeMobileScreen !== index}
                    className="absolute inset-0 px-1 transition-transform duration-300 ease-out"
                    style={{ transform: `translate3d(${(index - activeMobileScreen) * 100}%, 0, 0)` }}
                  >
                    <PhoneFlowCard
                      screen={screen}
                      index={index}
                      articleClassName="relative mx-auto flex min-h-[28.75rem] w-full max-w-[19rem] flex-col rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,31,0.56),rgba(8,12,22,0.62))] p-2.5 shadow-[0_34px_100px_-50px_rgba(0,0,0,1)]"
                      showSubtitleOnMobile
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goToMobileScreen(activeMobileScreen - 1)}
                  disabled={activeMobileScreen === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white transition disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Ver paso anterior"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2">
                  {phoneScreens.map((screen, index) => (
                    <button
                      key={`mobile-step-${screen.title}`}
                      type="button"
                      onClick={() => goToMobileScreen(index)}
                      aria-label={`Ir al paso ${index + 1}: ${screen.title}`}
                      className={`h-2.5 rounded-full transition-all ${
                        activeMobileScreen === index ? 'w-8 bg-violet-300 shadow-[0_0_18px_rgba(196,181,253,0.9)]' : 'w-2.5 bg-white/22'
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => goToMobileScreen(activeMobileScreen + 1)}
                  disabled={activeMobileScreen === lastMobileScreenIndex}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white transition disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label="Ver siguiente paso"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/48">
                Paso {activeMobileScreen + 1} de {phoneScreens.length}. Desliza o usa las flechas.
              </p>
            </div>

            <div className="hidden lg:block">
              <div className="grid grid-cols-4 gap-4 xl:gap-6">
                {phoneScreens.map((screen, index) => (
                  <PhoneFlowCard
                    key={screen.title}
                    screen={screen}
                    index={index}
                    articleClassName="group relative flex min-h-[34rem] min-w-0 max-w-none flex-col rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,18,31,0.56),rgba(8,12,22,0.62))] p-3 shadow-[0_34px_100px_-50px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-1.5 hover:border-white/16 xl:min-h-[40rem]"
                    showConnector
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}