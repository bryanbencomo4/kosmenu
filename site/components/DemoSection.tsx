import { MenuPreviewMockup } from '../app/components/MenuPreviewMockup';

const phoneScreens = [
  {
    title: 'Menú',
    subtitle: 'Categorías y productos',
    accent: 'from-violet-500/25 to-slate-900',
    content: (
      <div className="space-y-3">
        <div className="rounded-xl bg-white/8 px-3 py-2 text-sm text-white">Hamburguesas</div>
        <div className="rounded-xl bg-white/8 px-3 py-2 text-sm text-white">Combos</div>
        <div className="rounded-xl bg-white/8 px-3 py-2 text-sm text-white">Bebidas</div>
      </div>
    ),
  },
  {
    title: 'Carrito',
    subtitle: 'Pedido claro',
    accent: 'from-emerald-500/20 to-slate-900',
    content: (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-white">
          <span>Combo lunch</span>
          <span>$12.50</span>
        </div>
        <div className="flex items-center justify-between text-sm text-white">
          <span>Bebida</span>
          <span>$2.00</span>
        </div>
        <div className="rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-slate-900">
          Confirmar pedido
        </div>
      </div>
    ),
  },
  {
    title: 'Confirmación',
    subtitle: 'Orden recibida',
    accent: 'from-violet-600/20 to-emerald-500/10',
    content: (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
          Pedido #1284 confirmado
        </div>
        <div className="text-sm text-slate-300">Te avisaremos cuando esté en preparación.</div>
      </div>
    ),
  },
  {
    title: 'Tracking',
    subtitle: 'Estado del pedido',
    accent: 'from-emerald-500/20 to-violet-600/15',
    content: (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-white">
          <span>En preparación</span>
          <span>70%</span>
        </div>
        <div className="h-2 rounded-full bg-white/10">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-emerald-400 to-violet-500" />
        </div>
        <div className="text-sm text-slate-300">Tiempo estimado: 12 min</div>
      </div>
    ),
  },
] as const;

export function DemoSection() {
  return (
    <section id="demo" className="perf-section border-y border-white/8 bg-[#0b101b]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.44fr)_minmax(0,1fr)] lg:items-start">
          <div className="max-w-md">
            <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
              Demo visual
            </span>
            <h2 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.03em] text-white sm:mt-5 sm:text-[2.35rem]">
              Así se ve la experiencia de tus clientes
            </h2>
          </div>

          <div className="hide-scrollbar -mx-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0 lg:overflow-visible">
            <div className="flex snap-x snap-mandatory gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-4">
            {phoneScreens.map((screen, index) => (
              <article
                key={screen.title}
                className="relative min-w-[17.25rem] snap-center rounded-[1.4rem] border border-white/10 bg-[#0f1522] p-3 shadow-[0_28px_80px_-45px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-2 hover:border-violet-400/30 sm:min-w-[18.5rem] lg:min-w-0"
              >
                {index > 0 ? <span className="absolute -left-3 top-1/2 hidden -translate-y-1/2 text-xl text-white/45 xl:block">›</span> : null}
                <div className="mx-auto h-2 w-16 rounded-full bg-white/10" />
                <div
                  className={`mt-3 rounded-[1.2rem] border border-white/8 bg-gradient-to-b ${screen.accent} p-3`}
                >
                  {index === 0 ? (
                    <MenuPreviewMockup
                      businessName="Bistró del Barrio"
                      logoUrl="/branding/isotipo.png"
                      palette={{
                        background: '#111827',
                        primary: '#7C3AED',
                        text: '#FFFFFF',
                      }}
                    />
                  ) : (
                    <div className="rounded-[1rem] border border-white/8 bg-[#111827]/80 p-3">
                      {screen.content}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-center text-sm font-semibold text-white">{index + 1}. {screen.title}</p>
              </article>
            ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}