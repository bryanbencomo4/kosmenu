import { Bike, ChevronDown, Clock3, MapPin, Search, Store, Truck } from 'lucide-react';

const quickFilters = [
  { label: 'Categorías', icon: Store },
  { label: 'Ubicación', icon: MapPin },
  { label: 'Abiertos ahora', icon: Clock3 },
  { label: 'Delivery', icon: Bike },
  { label: 'Retiro', icon: Truck },
] as const;

const heroArt = {
  burger:
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
  sushi:
    'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80',
};

export function HeroSearchSection() {
  return (
    <section id="explorar" className="relative px-4 pb-3 pt-5 sm:px-6 lg:px-8 lg:pb-4 lg:pt-6">
      <div className="mx-auto max-w-[1320px] overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,#050913_0%,#080d1a_100%)] shadow-[0_45px_120px_-70px_rgba(76,29,149,0.95)]">
        <div className="relative overflow-hidden px-4 pb-5 pt-6 sm:px-6 lg:px-10 lg:pb-6 lg:pt-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_14%,rgba(124,58,237,0.34),transparent_24%),radial-gradient(circle_at_84%_12%,rgba(34,211,238,0.16),transparent_18%)]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.72)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.72)_1px,transparent_1px)] [background-size:64px_64px]" />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 top-1 hidden h-[15rem] w-[28rem] bg-cover bg-center opacity-95 lg:block"
            style={{
              backgroundImage: `linear-gradient(90deg, rgba(5,9,19,0.02) 0%, rgba(5,9,19,0.18) 22%, rgba(5,9,19,0.65) 100%), url(${heroArt.burger})`,
              backgroundPosition: 'center center',
              WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.98) 72%, rgba(0,0,0,0) 100%)',
              maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.98) 72%, rgba(0,0,0,0) 100%)',
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 top-4 hidden h-[13.25rem] w-[24rem] bg-cover bg-center opacity-95 lg:block"
            style={{
              backgroundImage: `linear-gradient(270deg, rgba(5,9,19,0.08) 0%, rgba(5,9,19,0.2) 22%, rgba(5,9,19,0.65) 100%), url(${heroArt.sushi})`,
              backgroundPosition: 'center center',
              WebkitMaskImage: 'linear-gradient(270deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.98) 72%, rgba(0,0,0,0) 100%)',
              maskImage: 'linear-gradient(270deg, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.98) 72%, rgba(0,0,0,0) 100%)',
            }}
          />

          <div className="relative z-10 mx-auto max-w-[920px] text-center">
            <h1 className="mx-auto max-w-[760px] font-[var(--font-display)] text-[2.5rem] font-black leading-[0.9] tracking-[-0.06em] text-white sm:text-[3.5rem] lg:text-[4rem]">
              Encuentra tus negocios y menús <span className="text-violet-400">favoritos</span>
            </h1>

            <p className="mx-auto mt-3 max-w-[760px] text-sm leading-6 text-slate-300 sm:text-base">
              Busca restaurantes, cafés, pizzerías, comida rápida y ubicaciones cercanas.
            </p>

            <div className="mx-auto mt-5 max-w-[900px] rounded-[1.8rem] border border-white/10 bg-[#0b1220]/86 p-2.5 shadow-[0_25px_70px_-35px_rgba(76,29,149,0.95)] backdrop-blur-xl">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                <label className="relative flex-1">
                  <span className="sr-only">Buscar negocios o platos</span>
                  <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Busca hamburguesas, sushi, pizza, café o tu negocio..."
                    className="h-13 w-full rounded-[1.2rem] border border-white/10 bg-[#070d19] pl-14 pr-5 text-[15px] text-white outline-none transition-all duration-300 placeholder:text-slate-500 focus:border-violet-400/45"
                  />
                </label>

                <button
                  type="button"
                  aria-label="Buscar negocios destacados"
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-[1.2rem] bg-[#FACC15] px-7 text-base font-black text-[#0B1120] shadow-[0_22px_60px_-20px_rgba(250,204,21,0.9)] transition-all duration-300 hover:bg-[#fde047]"
                >
                  <Search className="h-4.5 w-4.5" />
                  Buscar
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                {quickFilters.map((filter) => {
                  const Icon = filter.icon;

                  return (
                    <button
                      key={filter.label}
                      type="button"
                      aria-label={`Filtrar por ${filter.label}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-slate-100 transition-all duration-300 hover:border-violet-400/30 hover:bg-white/8"
                    >
                      <Icon className="h-3.5 w-3.5 text-violet-300" />
                      {filter.label}
                      {filter.label !== 'Abiertos ahora' ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" /> : <span className="ml-1 inline-flex h-4.5 w-8 items-center rounded-full bg-white/10 p-[2px]"><span className="h-3.5 w-3.5 rounded-full bg-white/85" /></span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}