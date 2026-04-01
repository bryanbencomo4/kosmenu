import './globals.css';
import type { Metadata } from 'next';
import { Montserrat, Roboto } from 'next/font/google';

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
  title: 'elmenuxfa.com',
  description: 'Menu digital publico',
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
      </body>
    </html>
  );
}
