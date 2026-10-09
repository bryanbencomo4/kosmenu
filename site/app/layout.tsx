import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Montserrat, Roboto } from 'next/font/google';

import { publicSiteUrl } from './_lib/public-site-config';
import { SupabaseRecoveryRedirectGuard } from './_components/SupabaseRecoveryRedirectGuard';
import { CookieConsentBanner } from '../components/CookieConsentBanner';
import { WhatsAppChatWidget } from '../components/WhatsAppChatWidget';

const displayFont = Montserrat({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
});

const bodyFont = Roboto({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: 'elmenuxfa | Descubre restaurantes cerca de ti',
  description:
    'Explora menús reales, sitios promocionados y los restaurantes mejor calificados de la comunidad elmenuxfa.',
  keywords: [
    'restaurantes cerca de ti',
    'menú digital',
    'directorio de restaurantes',
    'elmenuxfa',
  ],
  robots:
    process.env.VERCEL_ENV === 'preview'
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
  icons: {
    icon: '/branding/isotipo.png',
    apple: '/branding/isotipo.png',
    shortcut: '/branding/isotipo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B0F17' },
    { media: '(prefers-color-scheme: light)', color: '#F6F2FF' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <SupabaseRecoveryRedirectGuard />
        {children}
        <WhatsAppChatWidget />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
