import type { Metadata } from 'next';

import { publicSiteUrl } from './_lib/public-site-config';
import { BusinessLandingPage } from '../components/business/BusinessLandingPage';

const canonicalUrl = publicSiteUrl;

export const metadata: Metadata = {
  title: 'ElMenúXFA | Menú digital y pedidos online para negocios de comida',
  description:
    'Crea tu menú digital, recibe pedidos por WhatsApp, comparte tu QR y permite a tus clientes seguir sus órdenes en tiempo real.',
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: 'ElMenúXFA | Menú digital y pedidos online para negocios de comida',
    description:
      'Crea tu menú digital, recibe pedidos por WhatsApp, comparte tu QR y permite a tus clientes seguir sus órdenes en tiempo real.',
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
    title: 'ElMenúXFA | Menú digital y pedidos online para negocios de comida',
    description:
      'Crea tu menú digital, recibe pedidos por WhatsApp, comparte tu QR y permite a tus clientes seguir sus órdenes en tiempo real.',
    images: [`${canonicalUrl}/branding/full_logo.png`],
  },
};

export default function HomePage() {
  return <BusinessLandingPage />;
}
