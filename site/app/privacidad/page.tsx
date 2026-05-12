import type { Metadata } from 'next';

import { privacyPagePath, publicSiteUrl, supportEmail, supportEmailHref } from '../_lib/public-site-config';

const canonicalUrl = `${publicSiteUrl}${privacyPagePath}`;
const lastUpdatedLabel = '12 de mayo de 2026';
const cardClassName = 'rounded-[1.35rem] border border-white/10 bg-[#09111e]/78 p-5 sm:p-6';

export const metadata: Metadata = {
  title: 'Política de privacidad | ElMenúXFA',
  description:
    'Conoce cómo ElMenúXFA recopila y usa información del portal público, formularios de contacto y suscripciones al boletín.',
  alternates: {
    canonical: canonicalUrl,
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#040814] px-4 py-8 text-white sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,32,0.96),rgba(8,14,27,0.92))] px-5 py-8 shadow-[0_40px_120px_-60px_rgba(15,23,42,1)] sm:px-8 sm:py-10">
          <span className="inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-200">
            Privacidad
          </span>
          <h1 className="mt-4 font-[var(--font-display)] text-[2.2rem] font-black leading-[0.98] tracking-[-0.05em] text-white sm:text-[3rem]">
            Política de privacidad de ElMenúXFA
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">
            Esta política aplica al portal público de ElMenúXFA, al sitio para negocios y a los formularios de contacto o suscripción que uses dentro de la plataforma.
          </p>
          <p className="mt-3 text-sm text-slate-400">Última actualización: {lastUpdatedLabel}</p>
        </section>

        <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-5">
          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">1. Datos que podemos recopilar</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300 sm:text-[15px]">
              <li>Información de contacto que compartes de forma voluntaria, como tu correo al suscribirte al boletín o escribirnos.</li>
              <li>Datos técnicos básicos de navegación, como dispositivo, navegador, páginas visitadas, origen de la visita y hora de acceso.</li>
              <li>Ubicación aproximada o precisa cuando aceptas usar geolocalización para mostrar negocios cercanos en el mapa.</li>
            </ul>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">2. Cómo usamos esa información</h2>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300 sm:text-[15px]">
              <li>Mostrar menús, promociones y negocios relevantes según tu búsqueda o ubicación.</li>
              <li>Atender solicitudes comerciales o de soporte enviadas por correo o WhatsApp.</li>
              <li>Enviar novedades, promociones o recordatorios del portal cuando te suscribes al boletín.</li>
              <li>Medir uso del sitio, detectar fallas y mejorar la experiencia de navegación.</li>
            </ul>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">3. Con quién compartimos datos</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              No vendemos tu información personal. Podemos apoyarnos en proveedores de infraestructura, analítica, mensajería o base de datos para operar ElMenúXFA. También podemos compartir información cuando una autoridad competente lo exija o cuando sea necesario para prevenir fraude, abuso o riesgos de seguridad.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">4. Conservación y control</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Conservamos la información solo durante el tiempo necesario para prestar el servicio, responder solicitudes o cumplir obligaciones legales. Si deseas corregir o eliminar tus datos de contacto, escríbenos a <a href={supportEmailHref} className="font-semibold text-[#FACC15] transition-colors duration-300 hover:text-[#fde047]">{supportEmail}</a>.
            </p>
          </section>

          <section className={cardClassName}>
            <h2 className="text-xl font-bold text-white">5. Cambios a esta política</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-[15px]">
              Podemos actualizar esta política cuando cambien las funcionalidades, los proveedores o la normativa aplicable. Publicaremos aquí la versión vigente junto con su fecha de actualización.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}