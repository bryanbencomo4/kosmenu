import Image from 'next/image';
import {
  ChevronRight,
  CircleDollarSign,
  Gift,
  LayoutGrid,
  MessageCircle,
  QrCode,
  Rocket,
  TrendingUp,
  Zap,
} from 'lucide-react';

const steps = [
  {
    number: 1,
    title: 'Solicita tu activación',
    description: 'Escríbenos por WhatsApp y activamos tu cuenta en minutos.',
    badgeClass: 'border-violet-300/25 bg-violet-500/15 text-violet-100',
    iconShellClass: 'border-violet-400/30 bg-violet-500/12 text-violet-200',
    icon: MessageCircle,
    previewSrc: '/branding/step-preview-1.png',
    previewAlt: 'Mensaje de WhatsApp solicitando la activación del menú digital',
    previewAspect: 'aspect-square',
  },
  {
    number: 2,
    title: 'Cargamos tu menú',
    description: 'Te ayudamos a organizar tus categorías, productos, fotos y precios.',
    badgeClass: 'border-violet-300/25 bg-violet-500/15 text-violet-100',
    iconShellClass: 'border-violet-400/30 bg-violet-500/12 text-violet-200',
    icon: LayoutGrid,
    previewSrc: '/branding/step-preview-2.png',
    previewAlt: 'Lista de categorías del menú con fotos de productos',
    previewAspect: 'aspect-square',
  },
  {
    number: 3,
    title: 'Generamos tu QR',
    description: 'Recibes tu código QR único y tu enlace personalizado listo para compartir.',
    badgeClass: 'border-sky-300/25 bg-sky-500/15 text-sky-50',
    iconShellClass: 'border-sky-400/30 bg-sky-500/12 text-sky-100',
    icon: QrCode,
    previewSrc: '/branding/step-preview-3.png',
    previewAlt: 'Tarjeta con QR y enlace personalizado de elmenuxfa',
    previewAspect: 'aspect-square',
  },
  {
    number: 4,
    title: 'Recibes tu Table Tent',
    description: 'Te enviamos tu Table Tent para colocar en tu mesa y que todos te encuentren.',
    badgeClass: 'border-cyan-300/25 bg-cyan-500/15 text-cyan-50',
    iconShellClass: 'border-cyan-400/30 bg-cyan-500/12 text-cyan-100',
    icon: Gift,
    previewSrc: '/branding/step-preview-4.png',
    previewAlt: 'Table Tent físico con QR para escanear el menú',
    previewAspect: 'aspect-square',
  },
  {
    number: 5,
    title: 'Tus clientes escanean y ordenan',
    description: 'Ven tu menú, eligen lo que quieren y ¡tú recibes más pedidos!',
    badgeClass: 'border-violet-300/25 bg-violet-500/15 text-violet-100',
    iconShellClass: 'border-violet-400/30 bg-violet-500/12 text-violet-200',
    icon: Rocket,
    previewSrc: '/branding/step-preview-5.png',
    previewAlt: 'Menú digital en el celular con carrito de pedidos',
    previewAspect: 'aspect-square',
  },
] as const;

const trustItems = [
  {
    label: 'Activación rápida',
    icon: Zap,
    iconClass: 'border-yellow-400/18 bg-yellow-500/12 text-[#FACC15]',
  },
  {
    label: 'Desde $10/mes',
    icon: CircleDollarSign,
    iconClass: 'border-violet-400/18 bg-violet-500/10 text-violet-200',
  },
  {
    label: 'Table Tent incluido',
    icon: Gift,
    iconClass: 'border-cyan-400/18 bg-cyan-500/10 text-cyan-200',
  },
  {
    label: 'Sin apps para clientes',
    icon: TrendingUp,
    iconClass: 'border-yellow-400/18 bg-yellow-500/10 text-yellow-300',
  },
] as const;

export function Steps() {
  return (
    <section id="como-funciona" className="perf-section relative overflow-hidden border-y border-white/8 bg-[#050916]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.55)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute left-[-10%] top-[20%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.2)_0%,transparent_70%)] blur-3xl" />
        <div className="absolute right-[-8%] top-[10%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.14)_0%,transparent_70%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-200">
            # Cómo funciona
          </span>
          <h2 className="mt-4 font-[var(--font-display)] text-[1.85rem] font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-[2.7rem] lg:text-[3.2rem]">
            Así de fácil empiezas a vender con tu{' '}
            <span className="bg-[linear-gradient(90deg,#c084fc_0%,#818cf8_48%,#38bdf8_100%)] bg-clip-text text-transparent">
              menú digital
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7">
            En pocos minutos tendrás tu menú listo y tus clientes podrán ver, elegir y ordenar desde su celular.
          </p>
        </div>

        <div className="relative mt-8 lg:mt-10">
          <div className="hide-scrollbar flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-3 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:pb-0">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.title}
                  className="relative flex min-w-[15.5rem] max-w-[15.5rem] snap-center lg:min-w-0 lg:max-w-none"
                >
                  <article className="relative flex h-full w-full flex-col overflow-hidden rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,rgba(16,22,36,0.96),rgba(10,15,26,0.98))] px-3.5 pb-3.5 pt-4 text-center shadow-[0_28px_70px_-46px_rgba(0,0,0,1)]">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)]"
                    />

                    <div
                      className={`absolute left-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border text-[0.85rem] font-black ${step.badgeClass}`}
                    >
                      {step.number}
                    </div>

                    <div
                      className={`mx-auto mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full border ${step.iconShellClass}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <h3 className="mt-3 font-[var(--font-display)] text-[0.98rem] font-black leading-[1.15] tracking-[-0.03em] text-white sm:text-[1.05rem]">
                      {step.title}
                    </h3>

                    <p className="mt-2 text-[0.8rem] leading-[1.4] text-slate-300/85 sm:text-[0.84rem]">
                      {step.description}
                    </p>

                    <div className={`relative mt-4 w-full overflow-hidden rounded-[1rem] bg-[#05070f] ${step.previewAspect}`}>
                      <Image
                        src={step.previewSrc}
                        alt={step.previewAlt}
                        fill
                        sizes="(max-width: 1024px) 220px, 180px"
                        className="object-contain object-center"
                        unoptimized
                      />
                    </div>
                  </article>

                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-3 top-1/2 z-20 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-sky-300/30 bg-[#0b1528] text-sky-300 shadow-[0_0_18px_rgba(56,189,248,0.35)] lg:inline-flex"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex justify-center lg:mt-12">
          <div className="grid w-full max-w-[760px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,22,36,0.9),rgba(12,18,29,0.92))] shadow-[0_24px_60px_-40px_rgba(0,0,0,1)] sm:flex sm:rounded-full">
            {trustItems.map(({ label, icon: Icon, iconClass }, index) => (
              <div
                key={label}
                className={`flex items-center gap-3 px-4 py-3.5 text-[0.88rem] text-slate-200/92 sm:flex-1 sm:justify-center sm:px-5 sm:py-4 sm:text-sm ${
                  index < trustItems.length - 1 ? 'border-b border-white/8 sm:border-b-0 sm:border-r' : ''
                } border-white/8`}
              >
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${iconClass}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
