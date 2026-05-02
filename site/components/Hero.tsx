import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronRight,
  MessageCircle,
  QrCode,
  Sparkles,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';

type HeroProps = {
  whatsappHref: string;
  demoHref: string;
};

export function Hero({ whatsappHref, demoHref }: HeroProps) {
  return (
    <section id="inicio" className="mx-auto max-w-7xl px-6 pb-16 pt-12 sm:pt-16 lg:pb-24 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10">
        <div className="max-w-2xl text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-[#221743]/45 px-4 py-2 text-[13px] font-semibold text-[#FACC15] shadow-[0_16px_34px_-24px_rgba(124,58,237,0.95)] backdrop-blur-xl">
            <span className="text-sm">🚀</span>
            Aumenta tus pedidos sin depender de apps externas
          </div>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#FACC15]/15 bg-[#251d42]/45 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-[#FACC15] backdrop-blur-xl">
            <Sparkles className="h-3.5 w-3.5 text-[#FACC15]" />
            Foodtech para tu negocio
          </div>

          <h1 className="mt-7 font-[var(--font-display)] text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl lg:text-[4.3rem] lg:leading-[0.95]">
            Recibe pedidos por WhatsApp
            <br />
            y digitaliza tu menú
            <br />
            <span className="bg-gradient-to-r from-[#b675ff] to-[#7C3AED] bg-clip-text text-transparent">
              en minutos.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[1.05rem] leading-8 text-slate-300/88 lg:mx-0">
            Menú digital profesional, pedidos por WhatsApp y seguimiento en tiempo real. Todo en un solo lugar.
          </p>

          <p className="mx-auto mt-4 max-w-xl text-[1.02rem] font-semibold text-slate-100 lg:mx-0">
            Empieza a vender más sin apps complicadas ni comisiones
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {[
              { label: 'Menú digital', detail: 'con link y QR', icon: CheckCircle2 },
              { label: 'Pedidos directos', detail: 'por WhatsApp', icon: MessageCircle },
              { label: 'Seguimiento del pedido', detail: 'en tiempo real', icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;

              return (
              <div
                key={item.label}
                className="flex items-center justify-center gap-3 text-left text-sm font-medium text-slate-100 lg:justify-start"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/10 text-violet-300 shadow-[0_10px_24px_-18px_rgba(124,58,237,0.95)]">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="leading-5">
                  <span className="block">{item.label}</span>
                  <span className="block text-slate-300">{item.detail}</span>
                </span>
              </div>
            );})}
          </div>

          <div className="mt-11 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start lg:items-start">
            <div className="flex flex-col items-center lg:items-start">
              <Link
                href={whatsappHref}
                className="inline-flex scale-100 items-center justify-center gap-2 rounded-full bg-[#FACC15] px-8 py-4 text-base font-bold text-[#0B0F1A] shadow-[0_34px_90px_-18px_rgba(250,204,21,1)] transition-all duration-300 hover:scale-[1.04] hover:bg-[#fde047] hover:shadow-[0_40px_100px_-16px_rgba(250,204,21,1)]"
              >
                Empieza gratis ahora
                <MessageCircle className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-xs font-medium text-slate-300/85">
                Sin tarjeta • Configuración en 2 minutos
              </p>
            </div>

            <Link
              href={demoHref}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-[#11182a]/55 px-6 py-4 text-base font-medium text-white/84 transition-all duration-300 hover:border-violet-300/20 hover:bg-white/6 hover:text-white"
            >
              Ver demo
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Comparte tu menú en segundos', detail: '(QR + link)', icon: 'QR' },
              { label: 'Recibe pedidos sin apps', detail: '', icon: 'WA' },
              { label: 'Tus clientes ven su pedido', detail: 'en tiempo real', icon: 'TR' },
            ].map((item) => (
              <div
                key={`${item.label}-${item.icon}`}
                className="flex min-h-[92px] items-center gap-3 rounded-2xl border border-white/8 bg-[#0d1525]/82 px-4 py-4 text-sm font-medium text-slate-100 shadow-[0_14px_34px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/30 hover:bg-[#11192b]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
                  {item.icon === 'QR' ? <QrCode className="h-4.5 w-4.5" /> : null}
                  {item.icon === 'WA' ? <MessageCircle className="h-4.5 w-4.5 text-emerald-300" /> : null}
                  {item.icon === 'TR' ? <BarChart3 className="h-4.5 w-4.5" /> : null}
                </span>
                <span>
                  {item.label}
                  {item.detail ? <span className="block text-xs text-violet-300/90">{item.detail}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[42rem] justify-center lg:justify-end">
          <div className="absolute left-[10%] top-[22%] h-56 w-56 rounded-full bg-violet-700/25 blur-3xl" />
          <div className="absolute right-[6%] top-[10%] h-64 w-64 rounded-full bg-violet-500/22 blur-3xl" />

          <div className="relative z-20 w-full max-w-[40rem]">
            <div className="mb-5 flex justify-center lg:hidden">
              <div className="rounded-[1.4rem] border border-white/12 bg-[#121931]/90 px-5 py-3 text-sm font-semibold text-slate-100 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                <span className="mr-2 text-amber-300">★★★★★</span>
                4.9/5 • Más de 100 negocios ya venden con esto
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[39rem] lg:mr-0">
              <Image
                src="/hero-app-header.png"
                alt="Vista de la app de elmenuxfa en un iPhone mostrando el menú y el flujo de pedido"
                width={1024}
                height={1536}
                priority
                className="relative z-10 h-auto w-full drop-shadow-[0_44px_120px_rgba(0,0,0,0.88)] select-none"
              />

              <div className="absolute -right-6 top-[28%] z-20 hidden w-[14.5rem] rounded-[1.9rem] border border-white/12 bg-[linear-gradient(180deg,rgba(30,41,59,0.94),rgba(46,16,101,0.88))] px-5 py-5 text-white shadow-[0_24px_70px_-26px_rgba(124,58,237,0.8)] backdrop-blur-xl lg:block">
                <div className="text-amber-300">★★★★★</div>
                <p className="mt-3 text-[2rem] font-black tracking-[-0.05em]">4.9/5</p>
                <p className="mt-3 text-sm leading-6 text-slate-200/90">
                  Más de 100 negocios ya venden con esto
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {['A', 'L', 'M', 'R'].map((item, index) => (
                      <span
                        key={item}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#1a2340] bg-gradient-to-br from-[#f8d34f] to-[#7C3AED] text-xs font-bold text-white"
                        style={{ zIndex: 10 - index }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                    +100
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}