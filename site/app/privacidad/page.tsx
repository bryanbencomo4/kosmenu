import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { privacyPagePath, publicSiteUrl, supportEmail, supportEmailHref } from '../_lib/public-site-config';

const canonicalUrl = `${publicSiteUrl}${privacyPagePath}`;
const lastUpdatedLabel = '20 de julio de 2026';
const cardClassName = 'rounded-[1.35rem] border border-white/10 bg-[#09111e]/78 p-5 sm:p-6';

export const metadata: Metadata = {
  title: 'Política de privacidad | ElMenúXFA',
  description:
    'Conoce cómo ElMenúXFA recopila y usa información del sitio público, menús digitales, pedidos y formularios de contacto.',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#040814] px-4 py-8 text-white sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between sm:mb-6">
          <Link
            href="/"
            aria-label="Cerrar política de privacidad y volver al inicio"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-violet-300/24 hover:bg-violet-500/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Cerrar
          </Link>
        </div>

        <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,32,0.96),rgba(8,14,27,0.92))] px-5 py-8 shadow-[0_40px_120px_-60px_rgba(15,23,42,1)] sm:px-8 sm:py-10">
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            Privacidad
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[2.2rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[3rem]">
            Política de privacidad de ElMenúXFA
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
            Esta política aplica al sitio público de ElMenúXFA, a los menús digitales de negocios, al flujo de pedidos y a
            los formularios de contacto o soporte que uses dentro de la plataforma.
          </p>
          <p className="mt-3 text-sm text-slate-400">Última actualización: {lastUpdatedLabel}</p>
        </section>

        <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-5">
          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">1. Datos que podemos recopilar</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300 sm:text-[15px]">
              <li>
                Información de contacto que compartes de forma voluntaria, como tu correo o WhatsApp al escribirnos para
                activación o soporte.
              </li>
              <li>
                Datos necesarios para operar pedidos cuando usas un menú digital (por ejemplo nombre, teléfono, dirección
                de entrega u observaciones), según lo configure cada negocio.
              </li>
              <li>
                Datos técnicos básicos de navegación, como dispositivo, navegador, páginas visitadas y hora de acceso,
                necesarios para seguridad y operación del servicio.
              </li>
            </ul>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">2. Cómo usamos esa información</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300 sm:text-[15px]">
              <li>Mostrar menús digitales y procesar pedidos según la configuración de cada negocio.</li>
              <li>Atender solicitudes comerciales o de soporte enviadas por correo o WhatsApp.</li>
              <li>Operar, asegurar y mejorar la plataforma (disponibilidad, prevención de abuso y corrección de fallas).</li>
            </ul>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">3. Con quién compartimos datos</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              No vendemos tu información personal. Podemos apoyarnos en proveedores de infraestructura, mensajería o base
              de datos para operar ElMenúXFA. Los datos de un pedido se ponen a disposición del negocio correspondiente
              para atenderlo. También podemos compartir información cuando una autoridad competente lo exija o cuando sea
              necesario para prevenir fraude, abuso o riesgos de seguridad.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">4. Conservación y control</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Conservamos la información solo durante el tiempo necesario para prestar el servicio, responder solicitudes o
              cumplir obligaciones legales. Si deseas corregir o eliminar tus datos de contacto, escríbenos a{' '}
              <a
                href={supportEmailHref}
                className="font-semibold text-[#FACC15] transition-colors duration-300 hover:text-[#fde047]"
              >
                {supportEmail}
              </a>
              .
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">5. Cambios a esta política</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Podemos actualizar esta política cuando cambien las funcionalidades, los proveedores o la normativa
              aplicable. Publicaremos aquí la versión vigente junto con su fecha de actualización.
            </p>
          </section>

          <section id="cookies" className={`${cardClassName} scroll-mt-28`}>
            <h2 className="text-xl font-bold text-white">6. Cookies y preferencias</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              El banner del sitio te permite aceptar o rechazar la preferencia de cookies. Guardamos únicamente esa
              preferencia en tu dispositivo para no interrumpirte en cada visita. Hoy no usamos cookies de analítica ni de
              publicidad. Si deseas cambiar la preferencia más adelante, puedes borrar las cookies del navegador y volver a
              cargar el sitio.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
