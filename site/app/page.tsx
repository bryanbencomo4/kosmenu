import type { Metadata } from 'next';

import { getPublicConsumerHomeData } from './_lib/public-consumer-home';
import { publicSiteUrl } from './_lib/public-site-config';
import { ConsumerHomePage } from '../components/consumer/ConsumerHomePage';

const canonicalUrl = publicSiteUrl;

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'ElMenúXFA | Descubre negocios, menús y promociones cerca de ti',
  description:
    'Descubre restaurantes, cafés, pizzerías, promociones y negocios abiertos cerca de ti con el portal público de elmenuxfa.com.',
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: 'ElMenúXFA | Descubre negocios, menús y promociones cerca de ti',
    description:
      'Busca restaurantes, cafés, pizzerías, promociones y ubicaciones cercanas desde el portal público de elmenuxfa.com.',
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
    title: 'ElMenúXFA | Descubre negocios, menús y promociones cerca de ti',
    description:
      'Descubre negocios de comida, menús, promociones y ubicaciones cercanas en el portal público de elmenuxfa.com.',
    images: [`${canonicalUrl}/branding/full_logo.png`],
  },
};

export default async function HomePage() {
  const homeData = await getPublicConsumerHomeData();

  return <ConsumerHomePage {...homeData} />;
}