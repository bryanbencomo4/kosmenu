import type { Metadata } from 'next';

import { publicSiteUrl } from './_lib/public-site-config';
import { BusinessLandingPage } from '../components/business/BusinessLandingPage';

const canonicalUrl = publicSiteUrl;

export const metadata: Metadata = {
  title: 'ElMenúXFA | Digitaliza el menú de tu restaurante en menos de 5 minutos',
  description:
    'Crea tu menú digital al instante, actualiza precios en tiempo real y ofrece una experiencia sin contacto con Table Tents en acrílico listos para tus mesas.',
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: 'ElMenúXFA | Digitaliza el menú de tu restaurante en menos de 5 minutos',
    description:
      'Crea tu menú digital al instante, actualiza precios en tiempo real y ofrece una experiencia sin contacto con Table Tents en acrílico listos para tus mesas.',
    url: canonicalUrl,
    siteName: 'ElMenúXFA',
    locale: 'es_CO',
    type: 'website',
    images: [
      {
        url: `${canonicalUrl}/branding/full_logo.png`,
        width: 1200,
        height: 630,
        alt: 'ElMenúXFA',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ElMenúXFA | Digitaliza el menú de tu restaurante en menos de 5 minutos',
    description:
      'Crea tu menú digital al instante, actualiza precios en tiempo real y ofrece una experiencia sin contacto con Table Tents en acrílico listos para tus mesas.',
    images: [`${canonicalUrl}/branding/full_logo.png`],
  },
};

export default function HomePage() {
  return <BusinessLandingPage />;
}
