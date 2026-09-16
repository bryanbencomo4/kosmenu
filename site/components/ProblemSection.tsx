import Image from 'next/image';
import { Caveat } from 'next/font/google';
import { Clock3, FileText, ImageIcon, Lightbulb, DollarSign } from 'lucide-react';

const handwriting = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
});

const problems = [
  {
    title: 'Menús desactualizados',
    detail: 'El platillo ya no está, el precio cambió y el papel sigue mintiendo.',
    image: '/branding/problem/worn-menus.webp',
    imageAlt: 'Carta de restaurante vieja y desgastada',
    icon: FileText,
    iconClass: 'border-rose-400/35 bg-rose-500/20 text-rose-300',
    accentClass: 'bg-rose-400',
  },
  {
    title: 'Cambios constantes de precios',
    detail: 'Reimprimir por cada ajuste cuesta tiempo, dinero y se ve poco profesional.',
    image: '/branding/problem/price-changes.webp',
    imageAlt: 'Precios de un menú impreso tachados y corregidos a mano',
    icon: DollarSign,
    iconClass: 'border-violet-400/35 bg-violet-500/20 text-violet-200',
    accentClass: 'bg-violet-400',
  },
  {
    title: 'Clientes esperando atención',
    detail: 'La mesa se detiene si el mesero no llega a tiempo con la carta.',
    image: '/branding/problem/waiting.webp',
    imageAlt: 'Mesa reservada en un restaurante mientras los clientes esperan',
    icon: Clock3,
    iconClass: 'border-amber-300/40 bg-amber-400/18 text-amber-200',
    accentClass: 'bg-amber-300',
  },
  {
    title: 'Mala experiencia visual',
    detail: 'Cartas gastadas, fotos borrosas o un QR genérico no venden tu restaurante.',
    image: '/branding/problem/stained-menu.webp',
    imageAlt: 'Menú de papel manchado por una bebida derramada',
    icon: ImageIcon,
    iconClass: 'border-violet-300/40 bg-violet-500/22 text-violet-200',
    accentClass: 'bg-violet-300',
  },
] as const;

export function ProblemSection() {
  return (
    <section
      id="problema"
      className="perf-section relative scroll-mt-28 overflow-hidden border-t border-white/8 bg-[#05070f]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-10 top-8 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(168,85,247,0.22)_0%,transparent_70%)] blur-3xl" />
        <div className="absolute right-[-6%] top-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.2)_0%,transparent_68%)] blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-40 w-[70%] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(88,28,135,0.18)_0%,transparent_70%)] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)_minmax(0,0.9fr)] lg:gap-4 xl:gap-6">
          <div className="pointer-events-none relative mx-auto hidden h-[13.5rem] w-full max-w-[22rem] lg:block xl:h-[15rem]">
            <Image
              src="/branding/problem/worn-menus.webp"
              alt=""
              fill
              sizes="22rem"
              className="object-cover object-left [mask-image:linear-gradient(90deg,black_58%,transparent_100%),linear-gradient(180deg,black_78%,transparent_100%)] [mask-composite:intersect] [-webkit-mask-composite:source-in]"
            />
          </div>

          <div className="mx-auto max-w-[40rem] text-center lg:max-w-none">
            <span className="inline-flex items-center rounded-full bg-[linear-gradient(180deg,#7c3aed_0%,#5b21b6_100%)] px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,0.9)]">
              El problema
            </span>
            <h2 className="mt-5 font-[var(--font-display)] text-[1.75rem] font-black leading-[1.08] tracking-[-0.045em] text-white sm:text-[2.35rem] lg:text-[2.55rem] xl:text-[2.8rem]">
              ¿Todavía dependes de
              <br />
              <span className="text-[#FACC15]">menús impresos</span>
              <br />
              en tu restaurante?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-6 text-slate-300/88 sm:text-base sm:leading-7">
              Un menú de papel no atiende, no se actualiza solo y no deja una imagen premium. Cada mesa espera; cada
              cambio se vuelve un costo.
            </p>
          </div>

          <div className="relative mx-auto max-w-[16.5rem] text-center lg:mx-0 lg:justify-self-end lg:pt-2 lg:rotate-[8deg] lg:text-right">
            <p
              className={`${handwriting.className} text-[1.55rem] font-semibold leading-[1.12] text-violet-100 sm:text-[1.7rem]`}
            >
              Más costos,
              <br />
              más problemas,
              <br />
              <span className="text-[#FACC15]">menos tiempo</span>
              <br />
              para lo importante.
            </p>
            <svg
              aria-hidden="true"
              viewBox="0 0 108 78"
              className="mx-auto -mt-1 h-14 w-[5.5rem] text-white/80 lg:ml-1 lg:mr-auto lg:h-16 lg:w-28"
              fill="none"
            >
              <path
                d="M78 10c10 16 8 42-46 40"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.85"
              />
              <path
                d="M44 38l-16 12 20 3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.85"
              />
            </svg>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:mt-4 lg:grid-cols-4 lg:gap-4">
          {problems.map((problem) => {
            const Icon = problem.icon;
            return (
              <article
                key={problem.title}
                className="relative isolate min-h-[22rem] overflow-hidden rounded-[1.45rem] border border-white/10 shadow-[0_28px_70px_-46px_rgba(0,0,0,1)] sm:min-h-[24rem]"
              >
                <Image
                  src={problem.image}
                  alt={problem.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 18rem, (min-width: 640px) 45vw, 92vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,15,0.08)_0%,rgba(5,7,15,0.28)_38%,rgba(5,7,15,0.92)_78%,#05070f_100%)]" />
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${problem.iconClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 max-w-[12.5rem] font-[var(--font-display)] text-[1.05rem] font-black leading-[1.15] tracking-[-0.03em] text-white">
                    {problem.title}
                  </h3>
                  <p className="mt-2 text-[0.84rem] leading-5 text-slate-200/88 sm:text-[0.88rem] sm:leading-6">
                    {problem.detail}
                  </p>
                  <span className={`mt-3 block h-1 w-8 rounded-full ${problem.accentClass}`} />
                </div>
              </article>
            );
          })}
        </div>

        <div className="mx-auto mt-7 flex max-w-[52rem] items-start gap-3 rounded-[1.6rem] border border-violet-400/20 bg-[linear-gradient(180deg,rgba(28,18,52,0.92),rgba(12,10,24,0.96))] px-4 py-4 shadow-[0_20px_50px_-32px_rgba(88,28,135,0.9)] sm:mt-8 sm:items-center sm:px-6 sm:py-5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet-400/35 bg-violet-500/20 text-violet-200">
            <Lightbulb className="h-5 w-5" />
          </span>
          <div>
            <p className="font-[var(--font-display)] text-[1.02rem] font-black tracking-[-0.03em] text-white sm:text-[1.12rem]">
              Tu restaurante merece más que papel.
            </p>
            <p className="mt-1 text-[0.86rem] leading-5 text-slate-300/88 sm:text-[0.92rem] sm:leading-6">
              Es momento de dar el salto a una experiencia moderna, rápida y sin complicaciones.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
