import type { Metadata } from 'next';

import { publicSiteUrl } from './_lib/public-site-config';
import { ClientesDiscoveryPage } from '../components/clientes/ClientesDiscoveryPage';

const canonicalUrl = publicSiteUrl.replace(/\/$/, '');

export const metadata: Metadata = {
  title: 'elmenuxfa | Descubre restaurantes cerca de ti',
  description:
    'Explora menús reales, sitios promocionados y los restaurantes mejor calificados de la comunidad elmenuxfa.',
  alternates: { canonical: canonicalUrl },
  openGraph: {
    title: 'elmenuxfa | Descubre restaurantes cerca de ti',
    description:
      'Explora menús reales, sitios promocionados y los restaurantes mejor calificados de la comunidad elmenuxfa.',
    url: canonicalUrl,
    siteName: 'elmenuxfa',
    locale: 'es_VE',
    type: 'website',
  },
};

export default function HomePage() {
  return <ClientesDiscoveryPage />;
}
