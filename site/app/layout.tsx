import './globals.css';
import type { Metadata } from 'next';
import { Montserrat, Roboto } from 'next/font/google';

import { publicSiteUrl } from './_lib/public-site-config';
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
  title: 'elmenuxfa.com',
  description: 'Menu digital publico',
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
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
