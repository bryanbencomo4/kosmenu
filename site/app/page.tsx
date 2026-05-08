import type { Metadata } from 'next';

import { CTASection } from '../components/CTASection';
import { DemoSection } from '../components/DemoSection';
import { Features } from '../components/Features';
import { Footer } from '../components/Footer';
import { Hero } from '../components/Hero';
import { HeroFeaturesReveal } from '../components/HeroFeaturesReveal';
import { Navbar } from '../components/Navbar';
import { Steps } from '../components/Steps';
import { TargetSection } from '../components/TargetSection';

const canonicalUrl = 'https://www.elmenuxfa.com';
const whatsappHref = '#cta';
const demoHref = '#demo';

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
  return (
    <main className="home-performance-tuned min-h-screen bg-[#0B0F1A] text-white">
      <div className="relative isolate">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.24),_transparent_30%),radial-gradient(circle_at_85%_18%,_rgba(34,197,94,0.14),_transparent_22%),linear-gradient(180deg,_#0B0F1A_0%,_#0E1424_45%,_#0A0E18_100%)]" />
        <div className="absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),_transparent_55%)] blur-3xl" />

        <Navbar whatsappHref={whatsappHref} />

        <HeroFeaturesReveal
          features={<Features />}
          hero={<Hero whatsappHref={whatsappHref} demoHref={demoHref} />}
        />

        <div className="hero-features-next">
          <Steps />
          <DemoSection />
          <TargetSection />
          <CTASection whatsappHref={whatsappHref} demoHref={demoHref} />
          <Footer />
        </div>
      </div>
    </main>
  );
}