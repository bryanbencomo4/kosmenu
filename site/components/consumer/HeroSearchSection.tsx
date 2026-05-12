import {
  Bike,
  ChevronDown,
  Clock3,
  LayoutGrid,
  MapPin,
  MapPinned,
  Search,
  ShoppingBag,
} from 'lucide-react';

const quickFilters = [
  { label: 'Categorías', icon: LayoutGrid },
  { label: 'Ubicación', icon: MapPin },
  { label: 'Abiertos ahora', icon: Clock3 },
  { label: 'Delivery', icon: Bike },
  { label: 'Retiro', icon: ShoppingBag },
] as const;

export function HeroSearchSection() {
  return (
    <section id="explorar" className="relative -mt-px px-3 pb-0 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] overflow-hidden rounded-b-[1.5rem] border border-t-0 border-white/8 bg-[linear-gradient(180deg,#040814_0%,#07101b_58%,#040814_100%)] shadow-[0_45px_120px_-70px_rgba(76,29,149,0.95)] sm:rounded-b-[1.65rem] lg:rounded-b-[1.85rem]">
        <div className="relative overflow-hidden px-4 pb-6 pt-5 sm:px-8 sm:pb-9 sm:pt-9 lg:px-14 lg:pb-10 lg:pt-10">
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.72)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.72)_1px,transparent_1px)] [background-size:64px_64px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_34%,rgba(124,58,237,0.28),transparent_22%),radial-gradient(circle_at_88%_30%,rgba(34,211,238,0.14),transparent_20%),radial-gradient(circle_at_50%_16%,rgba(124,58,237,0.1),transparent_26%)]" />

          <div className="pointer-events-none absolute left-[-3.5rem] top-[38%] hidden h-[14rem] w-[10rem] rounded-[2.8rem] border border-violet-400/16 bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(124,58,237,0.02))] sm:block" />
          <div className="pointer-events-none absolute right-[-2.5rem] top-[24%] hidden h-[13rem] w-[8.5rem] rounded-[2.8rem] border border-violet-400/16 bg-[linear-gradient(180deg,rgba(124,58,237,0.08),rgba(124,58,237,0.01))] sm:block" />
          <div className="pointer-events-none absolute left-[7%] top-[18%] hidden h-40 w-40 rounded-full bg-violet-500/20 blur-[88px] lg:block" />
          <div className="pointer-events-none absolute right-[8%] top-[16%] hidden h-32 w-32 rounded-full bg-cyan-400/16 blur-[78px] lg:block" />

          <div className="pointer-events-none absolute left-[6%] top-[43%] hidden h-px w-[16rem] rotate-[24deg] bg-[linear-gradient(90deg,rgba(124,58,237,0),rgba(124,58,237,0.35),rgba(59,130,246,0.08))] lg:block" />
          <div className="pointer-events-none absolute left-[13%] top-[48%] hidden h-px w-[11rem] -rotate-[14deg] bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.24),rgba(124,58,237,0.02))] lg:block" />
          <div className="pointer-events-none absolute right-[12%] top-[34%] hidden h-px w-[13rem] -rotate-[32deg] bg-[linear-gradient(90deg,rgba(59,130,246,0),rgba(59,130,246,0.22),rgba(124,58,237,0.02))] lg:block" />
          <div className="pointer-events-none absolute right-[10%] top-[56%] hidden h-px w-[12rem] rotate-[22deg] bg-[linear-gradient(90deg,rgba(124,58,237,0),rgba(124,58,237,0.28),rgba(59,130,246,0.08))] lg:block" />

          <div
            className="animate-zero-gravity pointer-events-none absolute left-[11%] top-[56%] hidden h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_26px_rgba(56,189,248,0.95)] lg:block"
            style={{ animationDelay: '-0.8s', animationDuration: '8.8s' }}
          />
          <div
            className="animate-zero-gravity pointer-events-none absolute left-[15%] top-[34%] hidden h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_22px_rgba(167,139,250,0.95)] lg:block"
            style={{ animationDelay: '-2.4s', animationDuration: '10.2s' }}
          />
          <div
            className="animate-zero-gravity pointer-events-none absolute right-[11%] top-[63%] hidden h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_26px_rgba(56,189,248,0.95)] lg:block"
            style={{ animationDelay: '-1.7s', animationDuration: '9.4s' }}
          />
          <div
            className="animate-zero-gravity pointer-events-none absolute right-[14%] top-[44%] hidden h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_22px_rgba(167,139,250,0.95)] lg:block"
            style={{ animationDelay: '-3.1s', animationDuration: '11.1s' }}
          />

          <div className="pointer-events-none absolute right-[11%] top-[34%] hidden lg:block">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-violet-400/16 bg-violet-500/6">
              <div className="absolute inset-[-16px] rounded-full border border-violet-400/10" />
              <div className="absolute inset-[-32px] rounded-full border border-cyan-400/8" />
              <MapPinned className="h-10 w-10 text-violet-400 drop-shadow-[0_0_24px_rgba(167,139,250,0.9)]" />
            </div>
          </div>

          <div className="relative z-10 mx-auto max-w-[1320px] text-center">
            <h1
              className="mx-auto max-w-[1060px] font-[var(--font-display)] text-[2.3rem] font-black leading-[0.92] tracking-[-0.065em] text-white min-[430px]:text-[2.55rem] sm:text-[3rem] lg:text-[5rem]"
              style={{ textWrap: 'balance' }}
            >
              <span className="block">Encuentra tus negocios</span>
              <span className="block">
                y menús <span className="text-violet-400">favoritos</span>
              </span>
            </h1>

            <p className="mx-auto mt-3.5 max-w-[30rem] text-[14px] leading-6 text-slate-300 sm:mt-4 sm:max-w-[980px] sm:text-[1.15rem] lg:text-[1.35rem]">
              Busca restaurantes, cafés, pizzerías, comida rápida y ubicaciones cercanas.
            </p>

            <div className="mx-auto mt-5 max-w-[1320px] rounded-[1.45rem] border border-violet-400/24 bg-[#070d18]/82 p-2 shadow-[0_40px_120px_-60px_rgba(124,58,237,0.95)] backdrop-blur-xl sm:mt-6 sm:rounded-[1.85rem] sm:p-2 lg:mt-8 lg:max-w-[1160px] lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
              <div className="flex flex-col gap-2.5 lg:gap-3">
                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:rounded-full lg:border lg:border-violet-400/28 lg:bg-[#060b16]/90 lg:p-[0.3rem] lg:shadow-[0_28px_100px_-55px_rgba(124,58,237,0.95)]">
                  <label className="relative flex-1 overflow-hidden rounded-[1.2rem] border border-white/8 bg-[#060c18] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:rounded-[1.5rem] lg:rounded-full lg:border-0 lg:bg-transparent lg:shadow-none">
                    <span className="sr-only">Buscar negocios o platos</span>
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 sm:left-5 sm:h-6 sm:w-6 lg:left-6 lg:h-6 lg:w-6" />
                    <input
                      type="search"
                      placeholder="Busca hamburguesas, sushi, pizza, café o tu negocio..."
                      className="h-[3.2rem] w-full bg-transparent pl-12 pr-4 text-[14px] text-white outline-none transition-all duration-300 placeholder:text-[13px] placeholder:text-slate-500 sm:h-[3.65rem] sm:pl-[3.7rem] sm:pr-5 sm:text-[0.97rem] lg:h-[4rem] lg:pl-[4rem] lg:pr-6 lg:text-[0.96rem]"
                    />
                  </label>

                  <button
                    type="button"
                    aria-label="Buscar negocios destacados"
                    className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[1rem] bg-[#FACC15] px-5 text-[0.96rem] font-black text-[#0B1120] shadow-[0_22px_60px_-20px_rgba(250,204,21,0.9)] transition-all duration-300 hover:bg-[#fde047] sm:h-[3.65rem] sm:w-auto sm:rounded-[1.2rem] sm:px-6 sm:text-[1rem] lg:h-[4rem] lg:min-w-[154px] lg:rounded-full lg:px-7"
                  >
                    <Search className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                    Buscar
                  </button>
                </div>

                <div className="hide-scrollbar mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5 sm:mx-0 sm:mt-3.5 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0 lg:gap-2.5">
                  {quickFilters.map((filter) => {
                    const Icon = filter.icon;
                    const isOpenNow = filter.label === 'Abiertos ahora';

                    return (
                      <button
                        key={filter.label}
                        type="button"
                        aria-label={`Filtrar por ${filter.label}`}
                        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[0.9rem] border border-white/10 bg-white/[0.04] px-3 text-[11px] font-semibold text-slate-100 transition-all duration-300 hover:border-violet-400/30 hover:bg-white/[0.07] sm:h-[3rem] sm:px-4 sm:text-[13px] lg:h-[2.95rem] lg:px-4.5 lg:text-[13px]"
                      >
                        <Icon className="h-4 w-4 text-violet-300 sm:h-[1.05rem] sm:w-[1.05rem]" />
                        {filter.label}
                        {isOpenNow ? (
                          <span className="ml-1 inline-flex h-5 w-10 items-center rounded-full bg-violet-500/25 p-[3px] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.3)] sm:h-6 sm:w-12">
                            <span className="ml-auto h-4 w-4 rounded-full bg-white shadow-[0_2px_8px_rgba(255,255,255,0.45)] sm:h-4.5 sm:w-4.5" />
                          </span>
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}