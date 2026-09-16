import { cookies } from 'next/headers';

import {
  MERCHANT_PRESENCE_COOKIE,
  parseMerchantPresenceCookie,
} from '../../app/_lib/merchant-presence';
import {
  appLoginHref,
  appSignupHref,
  appSiteUrl,
  marketingWhatsappHref,
  publicSiteUrl,
} from '../../app/_lib/public-site-config';
import { CTASection } from '../CTASection';
import { DemoSection } from '../DemoSection';
import { Features } from '../Features';
import { Footer } from '../Footer';
import { Hero } from '../Hero';
import { MerchantPresenceProvider } from '../merchant/MerchantPresenceProvider';
import { Navbar } from '../Navbar';
import { PricingSection } from '../PricingSection';
import { ProblemSection } from '../ProblemSection';
import { Steps } from '../Steps';
import { TargetSection } from '../TargetSection';

const supportHref = marketingWhatsappHref;
const signupHref = appSignupHref;
const loginHref = appLoginHref;

export async function BusinessLandingPage() {
  const cookieStore = await cookies();
  const initialMerchant = parseMerchantPresenceCookie(
    cookieStore.get(MERCHANT_PRESENCE_COOKIE)?.value,
  );
  const presenceSrc = `${appSiteUrl.replace(/\/$/, '')}/merchant-presence.html?api=${encodeURIComponent(publicSiteUrl)}`;

  return (
    <main className="home-performance-tuned min-h-screen bg-[#0B0F1A] text-white">
      <div className="relative isolate">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.24),_transparent_30%),radial-gradient(circle_at_85%_18%,_rgba(34,197,94,0.14),_transparent_22%),linear-gradient(180deg,_#0B0F1A_0%,_#0E1424_45%,_#0A0E18_100%)]" />
        <div className="absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),_transparent_55%)] blur-3xl" />

        <MerchantPresenceProvider
          panelHref={loginHref}
          presenceSrc={presenceSrc}
          initialMerchant={initialMerchant}
        >
          <Navbar supportHref={supportHref} loginHref={loginHref} signupHref={signupHref} />

          <Hero signupHref={signupHref} />

          <div className="hero-features-next">
            <ProblemSection />
            <Features signupHref={signupHref} />
            <Steps />
            <PricingSection signupHref={signupHref} supportHref={supportHref} />
            <DemoSection signupHref={signupHref} />
            <TargetSection />
            <CTASection signupHref={signupHref} supportHref={supportHref} />
            <Footer />
          </div>
        </MerchantPresenceProvider>
      </div>
    </main>
  );
}