import type { Metadata } from 'next';

import { publicSiteUrl } from './_lib/public-site-config';
import { BusinessLandingPage } from '../components/business/BusinessLandingPage';

const canonicalUrl = publicSiteUrl;

const seoTitle = 'elmenuxfa | Menú inteligente para restaurantes con QR y autoservicio';
const seoDescription =
  'Convierte cada mesa en un vendedor inteligente. Kit Portamenú Inteligente $10 de lanzamiento. Plataforma $10/mes o $90/año. Autoservicio para restaurantes.';

export const metadata: Metadata = {
  title: seoTitle,
  description: seoDescription,
  keywords: [
    'menú inteligente para restaurantes',
    'menú QR',
    'autoservicio para restaurantes',
    'portamenú inteligente',
    'elmenuxfa',
  ],
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: seoTitle,
    description: seoDescription,
    url: canonicalUrl,
    siteName: 'elmenuxfa',
    locale: 'es_CO',
    type: 'website',
    images: [
      {
        url: `${canonicalUrl}/branding/full_logo.png`,
        width: 1200,
        height: 630,
        alt: 'elmenuxfa menú inteligente para restaurantes',
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
