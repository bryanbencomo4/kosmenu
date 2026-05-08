import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  PackageCheck,
  QrCode,
  ScanSearch,
  Store,
  Truck,
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
    icon: Store,
    iconClass:
      'border-violet-400/25 bg-violet-500/10 text-violet-200 shadow-[0_0_35px_rgba(124,58,237,0.18)]',
    arrowClass: 'border-violet-400/20 text-violet-200',
  },
  {
    title: 'Pedidos organizados',
    description: 'Centraliza las órdenes para evitar mensajes cruzados y errores al momento de preparar.',
    icon: PackageCheck,
    iconClass:
      'border-blue-400/25 bg-blue-500/10 text-blue-200 shadow-[0_0_35px_rgba(59,130,246,0.18)]',
    arrowClass: 'border-blue-400/20 text-blue-200',
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
    icon: ScanSearch,
    iconClass:
      'border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200 shadow-[0_0_35px_rgba(192,132,252,0.18)]',
    arrowClass: 'border-fuchsia-400/20 text-fuchsia-200',
  },
  {
    title: 'Delivery delegado',
    description: 'Comparte enlaces con repartidores y mejora la coordinación de entregas.',
    icon: Truck,
    iconClass:
      'border-sky-400/25 bg-sky-500/10 text-sky-200 shadow-[0_0_35px_rgba(56,189,248,0.18)]',
    arrowClass: 'border-sky-400/20 text-sky-200',
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
  { value: '+1,500', label: 'negocios impulsados', icon: Store },
  { value: '+230K', label: 'pedidos gestionados', icon: Clock3 },
  { value: '98%', label: 'satisfacción de clientes', icon: BadgeCheck },
] as const;

export function Features() {
  return (
    <section id="beneficios" className="relative overflow-hidden border-t border-white/8 bg-[#050816] lg:min-h-full">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.65)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.65)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute left-[-18%] top-[6%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.28)_0%,rgba(124,58,237,0.08)_42%,transparent_72%)] blur-3xl sm:h-[30rem] sm:w-[30rem]" />
        <div className="absolute right-[-12%] top-[18%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.18)_0%,rgba(34,211,238,0.06)_42%,transparent_72%)] blur-3xl sm:h-[28rem] sm:w-[28rem]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,transparent,rgba(5,8,22,0.72))]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-stretch lg:gap-7 lg:py-16 xl:py-20">
        <div className="animate-fade-up relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,20,35,0.94),rgba(10,14,26,0.88))] p-6 shadow-[0_40px_120px_-54px_rgba(0,0,0,1)] backdrop-blur-2xl sm:p-8 lg:p-10">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(196,181,253,0.7),transparent)]" />
          <div aria-hidden="true" className="absolute -left-14 top-16 h-40 w-40 rounded-full bg-violet-500/14 blur-3xl" />
          <div aria-hidden="true" className="absolute bottom-10 right-[-3.5rem] h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 flex h-full flex-col">
            <span className="inline-flex w-fit rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-200">
            ¿Qué es ElMenuxFA?
          </span>
            <h2 className="mt-5 max-w-xl font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.035em] text-white sm:text-[2.5rem] lg:text-[3rem]">
              Una plataforma para vender mejor sin depender de catálogos manuales
            </h2>
            <div className="mt-5 h-1 w-24 rounded-full bg-[linear-gradient(90deg,rgba(168,85,247,1),rgba(34,211,238,0.75))] shadow-[0_0_28px_rgba(124,58,237,0.34)]" />
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-[15px] sm:leading-7">
              ElMenuxFA ayuda a restaurantes, cafeterías, dark kitchens, food trucks, reposterías y emprendimientos de comida a mostrar su menú, recibir pedidos y gestionar mejor la entrega desde una experiencia más profesional.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:mt-auto">
              {stats.map(({ value, label, icon: Icon }, index) => (
                <article
                  key={label}
                  className={`animate-fade-up rounded-[1.35rem] border border-white/8 bg-white/[0.04] px-4 py-4 shadow-[0_20px_45px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl ${
                    index === 0 ? 'animation-delay-100' : index === 1 ? 'animation-delay-200' : 'animation-delay-300'
                  }`}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-[1.7rem] font-black tracking-[-0.05em] text-white">{value}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{label}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {features.map(({ title, description, icon: Icon, iconClass, arrowClass }, index) => (
            <article
              key={title}
              className={`animate-fade-up group relative flex min-h-[15.5rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0c1320]/85 p-5 shadow-[0_26px_80px_-48px_rgba(0,0,0,1)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-2 hover:border-violet-400/30 hover:shadow-[0_35px_80px_-42px_rgba(76,29,149,0.45)] sm:p-6 ${
                index < 2 ? 'animation-delay-100' : index < 4 ? 'animation-delay-200' : 'animation-delay-300'
              }`}
            >
              <div aria-hidden="true" className="absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)] opacity-80" />
              <div className="relative z-10 flex h-full flex-col">
                <span className={`inline-flex h-14 w-14 items-center justify-center rounded-[1.1rem] border ${iconClass}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-[var(--font-display)] text-[1.18rem] font-bold leading-6 text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
                <span className={`mt-6 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white/[0.02] transition-transform duration-300 group-hover:translate-x-1 ${arrowClass}`}>
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