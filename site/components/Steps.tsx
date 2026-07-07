import {
  LayoutGrid,
  Package,
  QrCode,
  Rocket,
  Shield,
  Sparkles,
  TrendingUp,
  UserPlus,
  Zap,
} from 'lucide-react';

const steps = [
  {
    number: 1,
    title: 'Regístrate',
    description: 'Crea tu cuenta\nen segundos.',
    badgeClass: 'border-violet-300/22 bg-violet-500/14 text-violet-100 shadow-[0_0_28px_rgba(192,132,252,0.35)]',
    iconShellClass: 'border-violet-400/30 bg-violet-500/10 text-violet-200 shadow-[0_0_40px_rgba(168,85,247,0.34)]',
    dotClass: 'bg-violet-200 shadow-[0_0_14px_rgba(216,180,254,0.95)]',
    glowClass: 'shadow-[0_0_0_1px_rgba(192,132,252,0.2),0_0_42px_rgba(168,85,247,0.24)]',
    featured: false,
    icon: <UserPlus className="h-10 w-10" />,
  },
  {
    number: 2,
    title: 'Carga tu menú',
    description: 'Sube categorías\ny fotos fácilmente.',
    badgeClass: 'border-violet-300/20 bg-violet-500/10 text-violet-100 shadow-[0_0_20px_rgba(167,139,250,0.22)]',
    iconShellClass: 'border-violet-400/28 bg-violet-500/10 text-violet-200 shadow-[0_0_34px_rgba(129,140,248,0.28)]',
    dotClass: 'bg-violet-200 shadow-[0_0_12px_rgba(196,181,253,0.95)]',
    glowClass: 'shadow-[0_0_0_1px_rgba(167,139,250,0.15),0_0_34px_rgba(129,140,248,0.16)]',
    featured: false,
    icon: <LayoutGrid className="h-10 w-10" />,
  },
  {
    number: 3,
    title: 'Genera tu QR',
    description: 'Obtén tu código\núnico al instante.',
    badgeClass: 'border-sky-300/24 bg-sky-500/12 text-sky-50 shadow-[0_0_26px_rgba(56,189,248,0.34)]',
    iconShellClass: 'border-sky-400/34 bg-sky-500/10 text-sky-100 shadow-[0_0_44px_rgba(56,189,248,0.38)]',
    dotClass: 'bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.95)]',
    glowClass: 'border-sky-300/32 shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_0_54px_rgba(59,130,246,0.3)]',
    featured: true,
    icon: <QrCode className="h-10 w-10" />,
  },
  {
    number: 4,
    title: 'Recibe tus\nTable Tents',
    description: 'Te enviamos los\nhabladores físicos.',
    badgeClass: 'border-cyan-300/24 bg-cyan-500/12 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.3)]',
    iconShellClass: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100 shadow-[0_0_38px_rgba(34,211,238,0.32)]',
    dotClass: 'bg-cyan-200 shadow-[0_0_14px_rgba(165,243,252,0.95)]',
    glowClass: 'shadow-[0_0_0_1px_rgba(34,211,238,0.16),0_0_40px_rgba(34,211,238,0.2)]',
    featured: false,
    icon: <Package className="h-10 w-10" />,
  },
  {
    number: 5,
    title: '¡A vender!',
    description: 'Tus clientes ya pueden\nescanear la oferta actualizada.',
    badgeClass: 'border-violet-300/22 bg-violet-500/12 text-violet-100 shadow-[0_0_22px_rgba(192,132,252,0.26)]',
    iconShellClass: 'border-violet-400/28 bg-violet-500/10 text-violet-200 shadow-[0_0_38px_rgba(168,85,247,0.3)]',
    dotClass: 'bg-violet-200 shadow-[0_0_14px_rgba(216,180,254,0.9)]',
    glowClass: 'shadow-[0_0_0_1px_rgba(192,132,252,0.16),0_0_38px_rgba(168,85,247,0.22)]',
    featured: false,
    icon: <Rocket className="h-10 w-10" />,
  },
] as const;

const trustItems = [
  {
    label: 'Listo en minutos',
    icon: Zap,
    iconClass: 'border-yellow-400/18 bg-yellow-500/12 text-[#FACC15]',
  },
  {
    label: 'Sin tarjeta de crédito',
    icon: Shield,
    iconClass: 'border-violet-400/18 bg-violet-500/10 text-violet-200',
  },
  {
    label: 'Table Tents incluidos',
    icon: Package,
    iconClass: 'border-cyan-400/18 bg-cyan-500/10 text-cyan-200',
  },
  {
    label: 'Escala tu negocio',
    icon: TrendingUp,
    iconClass: 'border-yellow-400/18 bg-yellow-500/10 text-yellow-300',
  },
] as const;

export function Steps() {
  return (
    <section id="como-funciona" className="perf-section relative overflow-hidden border-y border-white/8 bg-[#07101b]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.48)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.48)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute left-[-8%] top-[18%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.22)_0%,rgba(124,58,237,0.08)_38%,transparent_72%)] blur-3xl" />
        <div className="absolute right-[-10%] top-[14%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(6,182,212,0.18)_0%,rgba(6,182,212,0.08)_36%,transparent_72%)] blur-3xl" />
      </div>

      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.26em] text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.08)]">
            <Sparkles className="h-3.5 w-3.5" />
            Cómo funciona
          </span>
          <h2 className="mt-4 font-[var(--font-display)] text-[1.9rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[3rem] lg:text-[3.8rem]">
            <span className="block">Cinco pasos para digitalizar</span>
            <span className="block">tu menú en tiempo récord</span>
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-[0.95rem] leading-[1.55] text-slate-300/84 sm:text-[1.05rem] lg:text-[1.12rem]">
            Del registro a los Table Tents en mesa:
            <br className="hidden sm:block" />
            todo el proceso en menos de <span className="font-semibold text-[#FACC15]">5 minutos.</span>
          </p>
        </div>

        <div className="relative mt-8 lg:mt-10">
          <svg
            aria-hidden="true"
            viewBox="0 0 1280 520"
            className="pointer-events-none absolute inset-x-0 top-[-44px] hidden h-[520px] w-full lg:block"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="steps-line-main" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(168,85,247,0.0)" />
                <stop offset="20%" stopColor="rgba(192,132,252,0.55)" />
                <stop offset="52%" stopColor="rgba(96,165,250,0.95)" />
                <stop offset="80%" stopColor="rgba(103,232,249,0.55)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.0)" />
              </linearGradient>
              <linearGradient id="steps-arc-top" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(168,85,247,0.0)" />
                <stop offset="18%" stopColor="rgba(168,85,247,0.16)" />
                <stop offset="52%" stopColor="rgba(192,132,252,0.22)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.16)" />
              </linearGradient>
              <linearGradient id="steps-arc-bottom" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(168,85,247,0.18)" />
                <stop offset="50%" stopColor="rgba(168,85,247,0.08)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.18)" />
              </linearGradient>
              <filter id="steps-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path d="M70 254 H1210" stroke="url(#steps-line-main)" strokeWidth="2.5" fill="none" />
            <path d="M72 286 C170 110, 1110 110, 1210 286" stroke="url(#steps-arc-top)" strokeWidth="1.5" fill="none" />
            <path d="M78 302 C210 450, 1070 450, 1202 302" stroke="url(#steps-arc-bottom)" strokeWidth="1.5" fill="none" />
            <path d="M88 280 C132 240, 176 240, 220 280" stroke="rgba(168,85,247,0.24)" strokeDasharray="3 7" strokeWidth="1.2" fill="none" />
            <circle cx="83" cy="316" r="4.5" fill="rgba(216,180,254,0.96)" filter="url(#steps-glow)" />
            <circle cx="90" cy="164" r="4" fill="rgba(216,180,254,0.96)" filter="url(#steps-glow)" />
            <circle cx="262" cy="255" r="5" fill="rgba(233,213,255,0.98)" filter="url(#steps-glow)" />
            <circle cx="506" cy="255" r="5" fill="rgba(233,213,255,0.98)" filter="url(#steps-glow)" />
            <circle cx="642" cy="207" r="4.5" fill="rgba(125,211,252,1)" filter="url(#steps-glow)" />
            <circle cx="738" cy="255" r="5" fill="rgba(125,211,252,0.98)" filter="url(#steps-glow)" />
            <circle cx="978" cy="255" r="5" fill="rgba(165,243,252,0.98)" filter="url(#steps-glow)" />
            <circle cx="1222" cy="303" r="3" fill="rgba(250,204,21,0.95)" filter="url(#steps-glow)" />
            <circle cx="994" cy="493" r="2.5" fill="rgba(165,243,252,0.85)" filter="url(#steps-glow)" />
            <circle cx="503" cy="486" r="4" fill="rgba(216,180,254,0.96)" filter="url(#steps-glow)" />
          </svg>

          <div className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:grid lg:overflow-visible lg:pb-0 lg:grid-cols-5 lg:gap-7">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className={`relative flex min-h-[17rem] min-w-[16rem] max-w-[16rem] snap-center flex-col overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,39,0.9),rgba(12,18,30,0.92))] px-4 pb-4 pt-5 text-center shadow-[0_28px_70px_-44px_rgba(0,0,0,1)] backdrop-blur-sm transition-transform duration-300 sm:min-w-[17rem] sm:max-w-[17rem] lg:min-h-[18.1rem] lg:min-w-0 lg:max-w-none lg:px-5 ${step.glowClass}`}
              >
                <div className={`absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border text-[1.55rem] font-black leading-none ${step.badgeClass}`}>
                  <span className="translate-y-[-1px] text-[1.65rem]">{step.number}</span>
                </div>

                <div className={`mx-auto mt-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 ${step.iconShellClass} sm:h-20 sm:w-20`}>
                  <div className="flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-full border border-white/10 bg-[#0b1321]/86 sm:h-16 sm:w-16">
                    {step.icon}
                  </div>
                </div>

                <h3 className="mt-5 whitespace-pre-line font-[var(--font-display)] text-[1rem] font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-[1.22rem]">
                  {step.title}
                </h3>

                <p className="mt-3 whitespace-pre-line text-[0.88rem] leading-[1.4] text-slate-300/80 sm:text-[0.92rem] sm:leading-[1.42]">
                  {step.description}
                </p>

                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-center gap-2">
                    {steps.map((_, dotIndex) => (
                      <span
                        key={`${step.number}-${dotIndex}`}
                        className={`h-2.5 w-2.5 rounded-full ${
                          dotIndex === index
                            ? step.dotClass
                            : 'border border-white/10 bg-white/10'
                        }`}
                      />
                    ))}
                  </div>

                  {step.featured ? (
                    <div className="mt-5 flex justify-center">
                      <span className="inline-flex rounded-full border border-sky-400/24 bg-sky-500/14 px-4 py-1.5 text-[0.74rem] font-bold uppercase tracking-[0.14em] text-sky-300 shadow-[0_0_24px_rgba(59,130,246,0.24)]">
                        Paso clave
                      </span>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
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