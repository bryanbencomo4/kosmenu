import { appSiteUrl, marketingWhatsappHref } from '../../app/_lib/public-site-config';
import { CTASection } from '../CTASection';
import { DemoSection } from '../DemoSection';
import { Features } from '../Features';
import { Footer } from '../Footer';
import { Hero } from '../Hero';
import { Navbar } from '../Navbar';
import { PricingSection } from '../PricingSection';
import { Steps } from '../Steps';
import { TargetSection } from '../TargetSection';

const whatsappHref = marketingWhatsappHref;
const appHref = appSiteUrl;

export function BusinessLandingPage() {
  return (
    <main className="home-performance-tuned min-h-screen bg-[#0B0F1A] text-white">
      <div className="relative isolate">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.24),_transparent_30%),radial-gradient(circle_at_85%_18%,_rgba(34,197,94,0.14),_transparent_22%),linear-gradient(180deg,_#0B0F1A_0%,_#0E1424_45%,_#0A0E18_100%)]" />
        <div className="absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),_transparent_55%)] blur-3xl" />

        <Navbar whatsappHref={whatsappHref} appHref={appHref} />

        <Hero whatsappHref={whatsappHref} appHref={appHref} />

        <div className="hero-features-next">
          <Features whatsappHref={whatsappHref} />
          <Steps />
          <PricingSection whatsappHref={whatsappHref} />
          <DemoSection />
          <TargetSection />
          <CTASection whatsappHref={whatsappHref} appHref={appHref} />
          <Footer />
        </div>
      </div>
    </main>
  );
}