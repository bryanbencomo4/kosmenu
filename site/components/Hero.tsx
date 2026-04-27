import Link from 'next/link';
import { ChevronRight, MessageCircle, ShoppingBag, Sparkles } from 'lucide-react';

type HeroProps = {
  whatsappHref: string;
  demoHref: string;
};

const featuredProducts = [
  {
    name: 'Hamburguesa Clásica',
    note: 'Carne, queso, lechuga, tomate y salsa.',
    price: '$6.900',
    emoji: '🍔',
  },
  {
    name: 'Papas Deluxe',
    note: 'Papas a la francesa con cheddar y tocino.',
    price: '$4.500',
    emoji: '🍟',
  },
] as const;

export function Hero({ whatsappHref, demoHref }: HeroProps) {
  return (
    <section id="inicio" className="mx-auto max-w-7xl px-6 pb-16 pt-10 sm:pt-16 lg:pb-24 lg:pt-18">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="max-w-2xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FACC15]/15 bg-[#251d42]/45 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-[#FACC15] backdrop-blur-xl">
            <Sparkles className="h-3.5 w-3.5 text-[#FACC15]" />
            Foodtech para tu negocio
          </div>

          <h1 className="mt-6 font-[var(--font-display)] text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl lg:text-[4.15rem] lg:leading-[0.98]">
            Tu menú digital,
            <br />
            tus pedidos y
            <br />
            tu delivery en un
            <br />
            <span className="bg-gradient-to-r from-[#b675ff] to-[#7C3AED] bg-clip-text text-transparent">
              solo lugar.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-lg text-[1.05rem] leading-8 text-slate-300/90 lg:mx-0">
            Crea un menú online profesional para tu negocio, recibe pedidos por WhatsApp,
            comparte tu QR y permite que tus clientes sigan su orden en tiempo real.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              href={whatsappHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-4 text-sm font-bold text-[#0B0F1A] shadow-[0_24px_60px_-24px_rgba(250,204,21,0.8)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047]"
            >
              Solicitar demo
              <MessageCircle className="h-4 w-4" />
            </Link>
            <Link
              href={demoHref}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-transparent px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:scale-105 hover:border-violet-300/30 hover:bg-white/5"
            >
              Ver demo
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Link propio y QR', icon: 'QR' },
              { label: 'Pedidos por WhatsApp', icon: 'WA' },
              { label: 'Tracking del pedido', icon: 'TR' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1220]/85 px-4 py-3 text-sm font-medium text-slate-100 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/30 hover:bg-[#11192b]"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-[10px] font-bold text-violet-200">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[42rem] justify-center lg:justify-end">
          <div className="absolute left-[8%] top-[28%] h-48 w-48 rounded-full bg-violet-700/25 blur-3xl" />
          <div className="absolute right-[8%] top-[16%] h-44 w-44 rounded-full bg-violet-500/18 blur-3xl" />

          <div className="relative flex w-full max-w-[39rem] items-start justify-center lg:justify-end">
            <div className="relative z-20 w-[20.5rem] rounded-[2.2rem] border border-white/18 bg-[#111621] p-3 shadow-[0_38px_120px_-38px_rgba(0,0,0,1)]">
              <div className="absolute left-1/2 top-3 h-5 w-28 -translate-x-1/2 rounded-full bg-black/65" />
              <div className="rounded-[1.8rem] border border-white/8 bg-[#161b28] p-4 shadow-inner shadow-black/45">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>9:41</span>
                  <span>4G</span>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/8 bg-[#0f1420] px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FACC15] text-[11px] font-black text-[#22160d]">
                      B
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">Bistró del Barrio</p>
                      <p className="text-[11px] text-slate-400">45 min de demora • Pickup</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">⌕</span>
                </div>

                <div className="mt-4 rounded-2xl border border-white/8 bg-gradient-to-r from-[#161c29] to-[#111827] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Combo del día</p>
                      <p className="mt-1 text-[11px] text-slate-400">Hamburguesa • Papas • Bebida</p>
                      <p className="mt-2 text-lg font-black text-white">$9.900</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-3xl">🍔</span>
                      <button
                        type="button"
                        className="rounded-full bg-[#7C3AED] px-3 py-1 text-[11px] font-bold text-white transition-all duration-300 hover:scale-105 hover:bg-[#8b5cf6]"
                      >
                        Pedir ahora
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Categorías</p>
                    <p className="text-[11px] font-medium text-violet-300">Ver todas</p>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: 'Desayunos', emoji: '🍳' },
                      { label: 'Combos', emoji: '🍟' },
                      { label: 'Bebidas', emoji: '🥤' },
                      { label: 'Postres', emoji: '🧁' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/8 bg-[#0f1420] px-2 py-3">
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 text-lg">
                          {item.emoji}
                        </div>
                        <p className="mt-2 text-[10px] font-medium leading-3 text-slate-300">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-semibold text-white">Productos destacados</p>
                  <div className="mt-3 space-y-2.5">
                    {featuredProducts.map((item) => (
                      <div
                        key={item.name}
                        className="rounded-2xl border border-white/8 bg-[#0f1420] p-3 transition-all duration-300 hover:border-violet-400/30"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1d2434] text-2xl">
                            {item.emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[13px] font-semibold text-white">{item.name}</p>
                                <p className="mt-1 text-[10px] leading-4 text-slate-400">{item.note}</p>
                              </div>
                              <button
                                type="button"
                                className="rounded-full bg-[#7C3AED] px-2.5 py-1 text-[10px] font-semibold text-white transition-all duration-300 hover:scale-105"
                              >
                                Agregar
                              </button>
                            </div>
                            <p className="mt-2 text-[12px] font-bold text-white">{item.price}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#6d28d9] px-4 py-3 shadow-[0_18px_50px_-24px_rgba(124,58,237,0.95)]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <ShoppingBag className="h-4 w-4" />
                    <span>Ver carrito • 3 items</span>
                  </div>
                  <span className="text-sm font-bold text-white">$18.300</span>
                </div>
              </div>
            </div>

            <div className="absolute right-0 top-[4.6rem] z-10 hidden w-[11.5rem] rounded-[1.8rem] border border-white/10 bg-[#121826]/92 p-4 shadow-[0_32px_100px_-34px_rgba(0,0,0,1)] lg:block">
              <div className="rounded-[1.35rem] border border-white/8 bg-[#151b29] p-4">
                <p className="text-sm font-semibold text-white">Estado del pedido</p>
                <div className="mt-5 space-y-4">
                  {[
                    ['Pedido recibido', '12:35 PM', 'bg-[#84cc16]'],
                    ['En preparación', '12:40 PM', 'bg-[#84cc16]'],
                    ['En camino', '12:55 PM', 'bg-[#84cc16]'],
                    ['Entregado', '01:10 PM', 'bg-[#7C3AED]'],
                  ].map(([label, time, dot], index) => (
                    <div key={label} className="relative pl-6">
                      {index < 3 ? <span className="absolute left-[7px] top-4 h-8 w-px bg-white/15" /> : null}
                      <span className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full ${dot}`} />
                      <p className="text-[12px] font-semibold text-white">{label}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{time}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-white/8 bg-[#0e1320] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Tiempo estimado</p>
                  <p className="mt-2 text-sm font-bold text-white">25 - 35 min</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}