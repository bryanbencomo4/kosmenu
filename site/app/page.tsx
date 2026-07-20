import type { Metadata } from 'next';

import { publicSiteUrl } from './_lib/public-site-config';
import { BusinessLandingPage } from '../components/business/BusinessLandingPage';

const canonicalUrl = publicSiteUrl;

const seoTitle = 'ElMenúXFA | Menú digital con QR y Table Tent para restaurantes';
const seoDescription =
  'Tu menú digital listo para que tus clientes escaneen, elijan y ordenen. Incluye menú online, QR personalizado y Table Tent físico. $10/mes.';

export const metadata: Metadata = {
  title: seoTitle,
  description: seoDescription,
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: seoTitle,
    description: seoDescription,
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
    title: seoTitle,
    description: seoDescription,
    images: [`${canonicalUrl}/branding/full_logo.png`],
  },
};

export default function HomePage() {
  return <BusinessLandingPage />;
}
