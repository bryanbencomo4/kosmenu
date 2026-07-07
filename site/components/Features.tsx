import Image from 'next/image';
import {
  ArrowRight,
  ClipboardList,
  Layers,
  QrCode,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';

const features = [
  {
    title: 'Tus clientes escanean y ordenan más rápido',
    description: 'El menú está disponible desde el celular, sin instalar aplicaciones.',
    icon: Smartphone,
    iconClass:
      'border-emerald-400/25 bg-emerald-500/10 text-emerald-200 shadow-[0_0_35px_rgba(16,185,129,0.18)]',
    arrowClass: 'border-emerald-400/20 text-emerald-200',
  },
  {
    title: 'Actualiza precios y productos sin reimprimir',
    description: 'Cambia platos, precios o disponibilidad sin gastar en nuevos menús físicos.',
    icon: Zap,
    iconClass:
      'border-violet-400/25 bg-violet-500/10 text-violet-200 shadow-[0_0_38px_rgba(168,85,247,0.24)]',
    arrowClass: 'border-violet-400/25 text-violet-200',
  },
  {
    title: 'Table Tent físico incluido',
    description: 'Recibe el hablador de mesa con QR listo para colocar en tu restaurante.',
    imageSrc: '/branding/table-tent.png',
    imageAlt: 'Table Tent en acrílico de elmenuxfa con QR para escanear el menú digital.',
    icon: Layers,
    iconClass:
      'border-cyan-400/25 bg-cyan-500/10 text-cyan-200 shadow-[0_0_38px_rgba(34,211,238,0.2)]',
    arrowClass: 'border-cyan-400/25 text-cyan-200',
  },
  {
    title: 'Imagen más profesional',
    description: 'Haz que tu negocio se vea moderno, ordenado y confiable desde la primera visita.',
    icon: Sparkles,
    iconClass:
      'border-yellow-400/25 bg-yellow-500/10 text-yellow-200 shadow-[0_0_35px_rgba(250,204,21,0.18)]',
    arrowClass: 'border-yellow-400/20 text-yellow-200',
  },
  {
    title: 'Menos errores en los pedidos',
    description: 'Tus clientes ven opciones, precios y detalles con mayor claridad.',
    icon: ClipboardList,
    iconClass:
      'border-blue-400/25 bg-blue-500/10 text-blue-200 shadow-[0_0_35px_rgba(59,130,246,0.18)]',
    arrowClass: 'border-blue-400/20 text-blue-200',
  },
];

const stats = [
  {
    value: '$10/mes',
    label: 'inversión clara para empezar',
    icon: QrCode,
    iconClass: 'border-violet-400/22 bg-violet-500/10 text-violet-300',
    valueClass: 'text-violet-300',
  },
  {
    value: 'Table Tent',
    label: 'físico incluido en tu kit',
    icon: Layers,
    iconClass: 'border-cyan-400/22 bg-cyan-500/10 text-cyan-300',
    valueClass: 'text-cyan-300',
  },
  {
    value: 'Sin apps',
    label: 'para tus clientes',
    icon: Smartphone,
    iconClass: 'border-emerald-400/22 bg-emerald-500/10 text-emerald-300',
    valueClass: 'text-emerald-300',
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

      <div className="relative z-10 mx-auto grid max-w-[1240px] gap-4 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1.56fr)] lg:items-stretch lg:gap-4 lg:pt-32 lg:pb-16 xl:pt-32 xl:pb-20">
        <div className="animate-fade-up relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_86%_16%,rgba(192,132,252,0.12),transparent_20%),linear-gradient(180deg,rgba(15,20,35,0.98),rgba(7,12,23,0.97))] px-5 py-6 shadow-[0_40px_120px_-54px_rgba(0,0,0,1)] sm:px-8 sm:py-8 lg:px-11 lg:py-11">
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
              Beneficios principales
            </span>
            <h2 className="mt-6 max-w-[28rem] font-[var(--font-display)] text-[1.7rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[2.35rem] lg:max-w-[31rem] lg:text-[3.3rem]">
              <span className="block">Todo lo que necesitas</span>
              <span className="block">para vender mejor</span>
              <span className="block">
                cada{' '}
                <span className="bg-[linear-gradient(180deg,#d8b4fe_0%,#a855f7_48%,#9333ea_100%)] bg-clip-text text-transparent">
                  día
                </span>
              </span>
            </h2>
            <p className="mt-4 max-w-[27rem] text-[0.93rem] leading-[1.55] text-slate-300/88 lg:mt-5 lg:max-w-[29rem] lg:text-[1rem] lg:leading-[1.62]">
              Menú digital, QR personalizado y Table Tent físico: menos errores, más claridad y una experiencia profesional para tus clientes.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-auto">
              {stats.map(({ value, label, icon: Icon, iconClass, valueClass }, index) => (
                <article
                  key={label}
                  className={`animate-fade-up rounded-[1.35rem] border border-white/8 bg-[linear-gradient(180deg,rgba(20,25,42,0.84),rgba(12,17,29,0.82))] px-4 py-4 shadow-[0_24px_48px_-32px_rgba(0,0,0,0.95)] ${
                    index === 2 ? 'col-span-2 sm:col-span-1' : ''
                  } ${
                    index === 0 ? 'animation-delay-100' : index === 1 ? 'animation-delay-200' : 'animation-delay-300'
                  }`}
                >
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className={`mt-4 text-[1.45rem] font-black tracking-[-0.05em] sm:text-[1.7rem] ${valueClass}`}>{value}</p>
                  <p className="mt-1 text-[0.85rem] leading-5 text-slate-300/88 sm:text-sm sm:leading-6">{label}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ title, description, icon: Icon, iconClass, arrowClass, imageSrc, imageAlt }, index) => (
            <article
              key={title}
              className={`animate-fade-up group relative flex min-h-[14.5rem] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(13,19,33,0.96),rgba(10,15,26,0.92))] px-5 py-6 shadow-[0_26px_80px_-48px_rgba(0,0,0,1)] transition-all duration-300 hover:-translate-y-1 hover:border-white/16 sm:min-h-[17.4rem] sm:px-6 sm:py-7 ${
                index === 4 ? 'sm:col-span-2 lg:col-span-1' : ''
              } ${
                index === 0 ? 'animation-delay-100' : index < 3 ? 'animation-delay-200' : 'animation-delay-300'
              }`}
            >
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)] opacity-80" />
              <div className="relative z-10 flex h-full flex-col">
                {imageSrc ? (
                  <div className="relative mx-auto mb-4 aspect-[3/4] w-full max-w-[10.5rem] overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#120a24] shadow-[0_24px_60px_-34px_rgba(124,58,237,0.75)]">
                    <Image src={imageSrc} alt={imageAlt ?? title} fill sizes="168px" className="object-contain object-center p-2" />
                  </div>
                ) : (
                  <span className={`inline-flex h-14 w-14 items-center justify-center rounded-[1rem] border ${iconClass} sm:h-16 sm:w-16 sm:rounded-[1.2rem]`}>
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </span>
                )}
                <h3 className={`max-w-none font-[var(--font-display)] text-[1.02rem] font-bold leading-[1.12] text-white sm:max-w-[13rem] sm:text-[1.12rem] lg:text-[1.22rem] ${imageSrc ? 'mt-1' : 'mt-5 sm:mt-7'}`}>{title}</h3>
                <p className="mt-3 max-w-none text-[0.9rem] leading-[1.5] text-slate-300/78 sm:max-w-[15rem] sm:text-[0.98rem] sm:leading-[1.6]">{description}</p>
                <span className={`mt-5 inline-flex h-10 w-10 items-center justify-center rounded-full border bg-white/[0.02] transition-transform duration-300 group-hover:translate-x-1 sm:mt-auto sm:h-11 sm:w-11 ${arrowClass}`}>
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