import Link from 'next/link';
import { BadgeCheck, CircleDollarSign, MessageCircle, QrCode, Rocket } from 'lucide-react';

type PricingSectionProps = {
  whatsappHref: string;
};

const pricingWhatsappMessage =
  'Hola, quiero crear mi menú digital con elmenuxfa.com. Me gustaría recibir información del plan profesional.';
const pricingWhatsappHref = `https://wa.me/584148216433?text=${encodeURIComponent(pricingWhatsappMessage)}`;

const includedFeatures = [
  'Menú digital personalizado',
  'Catálogo con productos, fotos y precios',
  'Link y QR para compartir tu menú',
  'Pedidos organizados por WhatsApp',
  'Tracking del pedido',
  'Panel para administrar productos',
  'Ideal para delivery y pickup',
  'Soporte inicial para configurar tu negocio',
  'Sin comisión por venta',
] as const;

export function PricingSection({ whatsappHref }: PricingSectionProps) {
  const resolvedWhatsappHref =
    whatsappHref && whatsappHref !== '#' && whatsappHref !== '#cta' && whatsappHref !== 'javascript:void(0)'
      ? whatsappHref
      : pricingWhatsappHref;

  return (
    <section id="pricing" className="perf-section border-b border-white/8 bg-[#0a101c]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            <CircleDollarSign className="h-3.5 w-3.5" />
            Precio claro
          </span>
          <h2 className="mt-4 font-[var(--font-display)] text-[2rem] font-black leading-[1.02] tracking-[-0.03em] text-white sm:mt-5 sm:text-[2.55rem]">
            Un solo plan, todo incluido
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-[15px]">
            Todo lo que necesitas para vender con un menú digital profesional y recibir pedidos organizados por WhatsApp.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,20,35,0.94),rgba(10,14,26,0.9))] shadow-[0_40px_110px_-54px_rgba(0,0,0,1)]">
          <div className="h-px bg-[linear-gradient(90deg,transparent,rgba(196,181,253,0.72),transparent)]" />

          <div className="grid gap-8 px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:py-10 xl:px-12">
            <div className="flex flex-col">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-200">
                <Rocket className="h-3.5 w-3.5" />
                Plan Profesional
              </div>

              <div className="mt-5">
                <p className="font-[var(--font-display)] text-[3.25rem] font-black leading-none tracking-[-0.06em] text-white sm:text-[4.15rem]">
                  $20
                  <span className="ml-1.5 text-[1.15rem] font-bold tracking-[-0.02em] text-slate-300 sm:text-[1.35rem]">
                    /mes
                  </span>
                </p>
                <p className="mt-3 text-sm font-medium text-slate-300 sm:text-[15px]">
                  Por negocio · Sin comisión por pedido
                </p>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4 text-sm leading-7 text-slate-300 sm:p-5 sm:text-[15px]">
                <p className="font-semibold text-white">Empieza sin miedo.</p>
                <p className="mt-2">
                  Un solo precio mensual para tener tu menú digital listo, compartirlo con link o QR y recibir pedidos más claros por WhatsApp.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  href={resolvedWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-4 text-sm font-bold text-[#0B0F1A] shadow-[0_22px_50px_-24px_rgba(250,204,21,0.95)] transition-all duration-300 hover:scale-[1.02] hover:bg-[#fde047]"
                >
                  Solicitar activación gratis
                  <Rocket className="h-4 w-4" />
                </Link>
                <Link
                  href={resolvedWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/14 bg-white/[0.03] px-6 py-4 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/25 hover:bg-white/[0.06]"
                >
                  Hablar por WhatsApp
                  <MessageCircle className="h-4 w-4" />
                </Link>
              </div>

              <p className="mt-4 text-center text-sm leading-6 text-slate-300 lg:text-left">
                Te ayudamos a configurar tu menú inicial antes de activar el plan mensual.
              </p>

              <p className="mt-4 text-center text-xs font-medium text-slate-400 sm:text-sm lg:text-left">
                Sin instalaciones complicadas. Tus clientes no necesitan descargar ninguna app.
              </p>
            </div>

            <div className="rounded-[1.6rem] border border-white/8 bg-[#0d1323]/86 p-4 sm:p-5 lg:p-6">
              <div className="flex items-center gap-3 border-b border-white/8 pb-4">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/18 bg-violet-500/10 text-violet-200">
                  <QrCode className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-base font-semibold text-white">Todo incluido desde el primer mes</p>
                  <p className="text-sm text-slate-400">Sin cobros escondidos y sin comisión por pedido.</p>
                </div>
              </div>

              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {includedFeatures.map((feature, index) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200 ${
                      index === includedFeatures.length - 1 ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/14 text-emerald-300">
                      <BadgeCheck className="h-3.5 w-3.5" />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}