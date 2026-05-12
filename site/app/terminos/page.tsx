import type { Metadata } from 'next';

import { publicSiteUrl, supportEmail, supportEmailHref, termsPagePath } from '../_lib/public-site-config';

const canonicalUrl = `${publicSiteUrl}${termsPagePath}`;
const lastUpdatedLabel = '12 de mayo de 2026';
const cardClassName = 'rounded-[1.35rem] border border-white/10 bg-[#09111e]/78 p-5 sm:p-6';

export const metadata: Metadata = {
  title: 'Términos y condiciones | ElMenúXFA',
  description:
    'Consulta las condiciones de uso del portal público de ElMenúXFA y del sitio comercial para negocios de comida.',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#040814] px-4 py-8 text-white sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,32,0.96),rgba(8,14,27,0.92))] px-5 py-8 shadow-[0_40px_120px_-60px_rgba(15,23,42,1)] sm:px-8 sm:py-10">
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            Términos
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[2.2rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[3rem]">
            Términos y condiciones de uso
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
            Al navegar por ElMenúXFA aceptas estas condiciones para el uso del portal público y del sitio comercial dirigido a negocios de comida.
          </p>
          <p className="mt-3 text-sm text-slate-400">Última actualización: {lastUpdatedLabel}</p>
        </section>

        <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-5">
          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">1. Uso permitido</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Puedes usar ElMenúXFA para descubrir negocios, revisar menús, explorar promociones, contactar comercios y conocer la propuesta comercial del servicio. No está permitido usar la plataforma para actividades fraudulentas, scraping abusivo, interferencia técnica o cualquier conducta que afecte a otros usuarios o comercios.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">2. Información publicada por negocios</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Los menús, precios, horarios, ubicaciones y promociones son administrados por cada negocio. Hacemos esfuerzos razonables para mostrar información actualizada, pero cada comercio es responsable de la exactitud y disponibilidad de su oferta.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">3. Pedidos, pagos y entregas</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              ElMenúXFA facilita la visualización del menú, el flujo de pedido y el seguimiento cuando el negocio lo tenga habilitado. La preparación, disponibilidad, cobro, despacho, tiempos de entrega, reembolsos y atención final del pedido corresponden al comercio que ofrece el producto.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">4. Propiedad intelectual</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              El diseño de la plataforma, la marca ElMenúXFA y sus componentes visuales están protegidos por derechos de propiedad intelectual. Los logos, fotos y nombres comerciales de terceros pertenecen a sus respectivos titulares.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">5. Contacto y cambios</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Podemos actualizar estos términos cuando el producto evolucione o cambie la normativa aplicable. Si tienes dudas sobre el uso del servicio, escríbenos a <a href={supportEmailHref} className="font-semibold text-[#FACC15] transition-colors duration-300 hover:text-[#fde047]">{supportEmail}</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}