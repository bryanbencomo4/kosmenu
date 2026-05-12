import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { businessSiteHost, businessSiteUrl } from '../_lib/public-site-config';
import { BusinessLandingPage } from '../../components/business/BusinessLandingPage';

const canonicalUrl = businessSiteUrl;
const BUSINESS_HOSTS = new Set([businessSiteHost]);
const LOCAL_DEVELOPMENT_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

function requestHostname(host: string) {
  return host.split(',')[0].split(':')[0].trim().toLowerCase();
}

export const metadata: Metadata = {
  title: 'ElMenúXFA Business | Menú digital y pedidos online para negocios de comida',
  description:
    'Crea tu menú digital, recibe pedidos por WhatsApp, comparte tu QR y permite a tus clientes seguir sus órdenes en tiempo real.',
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: 'ElMenúXFA Business | Menú digital y pedidos online para negocios de comida',
    description:
      'Crea tu menú digital, recibe pedidos por WhatsApp, comparte tu QR y permite a tus clientes seguir sus órdenes en tiempo real.',
    url: canonicalUrl,
    siteName: 'ElMenúXFA Business',
    locale: 'es_CO',
    type: 'website',
    images: [
      {
        url: `${canonicalUrl}/branding/full_logo.png`,
        width: 1200,
        height: 630,
        alt: 'ElMenúXFA Business',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ElMenúXFA Business | Menú digital y pedidos online para negocios de comida',
    description:
      'Crea tu menú digital, recibe pedidos por WhatsApp, comparte tu QR y permite a tus clientes seguir sus órdenes en tiempo real.',
    images: [`${canonicalUrl}/branding/full_logo.png`],
  },
};

export default async function BusinessPage() {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? businessSiteHost;
  const hostname = requestHostname(host);

  if (
    hostname &&
    !BUSINESS_HOSTS.has(hostname) &&
    !LOCAL_DEVELOPMENT_HOSTS.has(hostname)
  ) {
    notFound();
  }

  return <BusinessLandingPage />;
}