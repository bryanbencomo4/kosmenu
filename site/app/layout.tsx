import './globals.css';
import type { Metadata } from 'next';
import { Montserrat, Roboto } from 'next/font/google';

import { publicSiteUrl } from './_lib/public-site-config';
import { SupabaseRecoveryRedirectGuard } from './_components/SupabaseRecoveryRedirectGuard';
import { CookieConsentBanner } from '../components/CookieConsentBanner';

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
  title: 'ElMenúXFA | Menú digital con QR y Table Tent para restaurantes',
  description:
    'Tu menú digital listo para que tus clientes escaneen, elijan y ordenen. Incluye menú online, QR personalizado y Table Tent físico. Desde $10/mes.',
  icons: {
    icon: '/branding/isotipo.png',
    apple: '/branding/isotipo.png',
    shortcut: '/branding/isotipo.png',
  },
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
        <CookieConsentBanner />
      </body>
    </html>
  );
}
