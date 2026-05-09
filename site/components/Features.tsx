import {
  ArrowRight,
  Bike,
  ClipboardList,
  LayoutGrid,
  MapPin,
  QrCode,
  Rocket,
  Smile,
  Sparkles,
} from 'lucide-react';

function WhatsAppLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.03 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.74.45 3.43 1.31 4.92L2 22l5.33-1.39a9.83 9.83 0 0 0 4.7 1.2h.01c5.45 0 9.89-4.44 9.89-9.9 0-2.64-1.03-5.12-2.88-7ZM12.04 20.13h-.01a8.13 8.13 0 0 1-4.14-1.13l-.3-.18-3.16.82.84-3.08-.2-.32a8.1 8.1 0 0 1-1.25-4.33c0-4.48 3.65-8.13 8.14-8.13 2.17 0 4.2.84 5.74 2.38a8.06 8.06 0 0 1 2.38 5.75c0 4.49-3.65 8.13-8.04 8.22Zm4.46-6.1c-.24-.12-1.4-.69-1.62-.76-.22-.08-.38-.12-.54.12-.16.23-.62.76-.76.92-.14.15-.28.17-.52.06-.24-.12-1-.37-1.9-1.18-.7-.62-1.17-1.38-1.31-1.61-.14-.24-.01-.36.1-.48.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.39-.41-.54-.42h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.68 2.57 4.07 3.6.57.25 1.02.4 1.37.5.58.18 1.1.15 1.52.09.46-.07 1.4-.57 1.6-1.13.2-.55.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

const features = [
  {
    title: 'Menú digital',
    description: 'Publica categorías, fotos, precios y productos destacados en un solo enlace profesional.',
    icon: LayoutGrid,
    iconClass:
      'border-violet-400/25 bg-violet-500/10 text-violet-200 shadow-[0_0_38px_rgba(168,85,247,0.24)]',
    arrowClass: 'border-violet-400/25 text-violet-200',
  },
  {
    title: 'Pedidos organizados',
    description: 'Centraliza las órdenes para evitar mensajes cruzados y errores al momento de preparar.',
    icon: ClipboardList,
    iconClass:
      'border-violet-400/25 bg-violet-500/10 text-violet-200 shadow-[0_0_38px_rgba(168,85,247,0.2)]',
    arrowClass: 'border-violet-400/25 text-violet-200',
  },
  {
    title: 'WhatsApp integrado',
    description: 'Mantén el canal que tus clientes ya usan, pero con una experiencia mucho más ordenada.',
    icon: WhatsAppLogo,
    iconClass:
      'border-emerald-400/25 bg-emerald-500/10 text-emerald-200 shadow-[0_0_35px_rgba(16,185,129,0.18)]',
    arrowClass: 'border-emerald-400/20 text-emerald-200',
  },
  {
    title: 'Tracking del pedido',
    description: 'Permite que tus clientes sigan el estado de la orden con una vista simple y clara.',
    icon: MapPin,
    iconClass:
      'border-blue-400/25 bg-blue-500/10 text-blue-200 shadow-[0_0_38px_rgba(59,130,246,0.2)]',
    arrowClass: 'border-blue-400/25 text-blue-200',
  },
  {
    title: 'Delivery delegado',
    description: 'Comparte enlaces con repartidores y mejora la coordinación de entregas.',
    icon: Bike,
    iconClass:
      'border-cyan-400/25 bg-cyan-500/10 text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,0.2)]',
    arrowClass: 'border-cyan-400/25 text-cyan-200',
  },
  {
    title: 'QR para compartir',
    description: 'Lleva tu menú a mesa, vitrina, redes o flyers con un QR fácil de escanear.',
    icon: QrCode,
    iconClass:
      'border-cyan-400/25 bg-cyan-500/10 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.18)]',
    arrowClass: 'border-cyan-400/20 text-cyan-200',
  },
] as const;

const stats = [
  {
    value: '+1,500',
    label: 'negocios impulsados',
    icon: Rocket,
    iconClass: 'border-violet-400/22 bg-violet-500/10 text-violet-300',
    valueClass: 'text-violet-300',
  },
  {
    value: '+230K',
    label: 'pedidos gestionados',
    icon: ClipboardList,
    iconClass: 'border-blue-400/22 bg-blue-500/10 text-blue-300',
    valueClass: 'text-blue-300',
  },
  {
    value: '98%',
    label: 'satisfacción de clientes',
    icon: Smile,
    iconClass: 'border-cyan-400/22 bg-cyan-500/10 text-cyan-300',
    valueClass: 'text-cyan-300',
  },
] as const;

export function Features() {
  return (
    <section id="beneficios" className="relative overflow-hidden border-t border-white/8 bg-[#050916] lg:min-h-full">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-[4.5%] top-7 h-px bg-white/8" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.56)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.56)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute -left-24 bottom-6 h-[20rem] w-[20rem] rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.5)_0%,rgba(168,85,247,0.18)_28%,transparent_74%)] blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-18%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.24)_0%,rgba(6,182,212,0.08)_36%,transparent_72%)] blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(180deg,transparent,rgba(5,9,22,0.8))]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-[1240px] gap-4 px-5 py-14 sm:px-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1.56fr)] lg:items-stretch lg:gap-4 lg:pt-32 lg:pb-16 xl:pt-32 xl:pb-20">
        <div className="animate-fade-up relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_86%_16%,rgba(192,132,252,0.12),transparent_20%),linear-gradient(180deg,rgba(15,20,35,0.98),rgba(7,12,23,0.97))] px-6 py-7 shadow-[0_40px_120px_-54px_rgba(0,0,0,1)] sm:px-8 sm:py-8 lg:px-11 lg:py-11">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(196,181,253,0.55),transparent)]" />
          <div aria-hidden="true" className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.85)_0%,rgba(168,85,247,0.22)_34%,transparent_72%)] blur-2xl" />
          <div aria-hidden="true" className="absolute -right-24 top-12 h-[26rem] w-[26rem] rounded-full border border-violet-400/10" />
          <div aria-hidden="true" className="absolute -right-40 top-4 h-[34rem] w-[34rem] rounded-full border border-violet-400/6" />
          <div aria-hidden="true" className="absolute right-[18%] top-[14%] h-3 w-3 rounded-full bg-violet-200 shadow-[0_0_24px_rgba(216,180,254,0.9)]" />
          <div aria-hidden="true" className="absolute right-[10%] top-[34%] h-1.5 w-1.5 rounded-full bg-violet-200/80 shadow-[0_0_18px_rgba(216,180,254,0.8)]" />
          <div aria-hidden="true" className="absolute right-[22%] top-[39%] h-2 w-2 rounded-full bg-violet-200/90 shadow-[0_0_18px_rgba(216,180,254,0.8)]" />

          <div className="relative z-10 flex h-full flex-col">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet-200">
              <Sparkles className="h-3.5 w-3.5 text-[#FACC15]" />
              ¿Qué es ElMenuxFA.com?
            </span>
            <h2 className="mt-7 max-w-[34rem] font-[var(--font-display)] text-[2.15rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[2.8rem] lg:text-[4.1rem]">
              <span className="block">Una plataforma</span>
              <span className="block">
                para{' '}
                <span className="bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_48%,#9333ea_100%)] bg-clip-text text-transparent">
                  vender mejor
                </span>
              </span>
              <span className="block">sin depender de</span>
              <span className="block">catálogos manuales</span>
            </h2>
            <p className="mt-7 max-w-[31rem] text-[1.02rem] leading-[1.72] text-slate-300/88 lg:text-[1.12rem]">
              Elmenuxfa.com digitaliza tu menú, organiza tus pedidos y se integra con WhatsApp para que vendas más, con menos esfuerzo y más control.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-3 lg:mt-auto">
              {stats.map(({ value, label, icon: Icon, iconClass, valueClass }, index) => (
                <article
                  key={label}
                  className={`animate-fade-up rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(20,25,42,0.84),rgba(12,17,29,0.82))] px-4 py-5 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.95)] ${
                    index === 0 ? 'animation-delay-100' : index === 1 ? 'animation-delay-200' : 'animation-delay-300'
                  }`}
                >
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className={`mt-5 text-[1.7rem] font-black tracking-[-0.05em] ${valueClass}`}>{value}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300/88">{label}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ title, description, icon: Icon, iconClass, arrowClass }, index) => (
            <article
              key={title}
              className={`animate-fade-up group relative flex min-h-[17.4rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,19,33,0.96),rgba(10,15,26,0.92))] px-6 py-7 shadow-[0_26px_80px_-48px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-1 hover:border-white/16 sm:px-6 sm:py-7 ${
                index < 2 ? 'animation-delay-100' : index < 4 ? 'animation-delay-200' : 'animation-delay-300'
              }`}
            >
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)] opacity-80" />
              <div className="relative z-10 flex h-full flex-col">
                <span className={`inline-flex h-16 w-16 items-center justify-center rounded-[1.2rem] border ${iconClass}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-7 max-w-[13rem] font-[var(--font-display)] text-[1.12rem] font-bold leading-[1.15] text-white lg:text-[1.22rem]">{title}</h3>
                <p className="mt-3 max-w-[15rem] text-[0.98rem] leading-[1.6] text-slate-300/78">{description}</p>
                <span className={`mt-auto inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white/[0.02] transition-transform duration-300 group-hover:translate-x-1 ${arrowClass}`}>
                  <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}