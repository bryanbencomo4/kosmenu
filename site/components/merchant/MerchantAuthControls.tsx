'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';

import { merchantInitials } from '../../app/_lib/merchant-presence';
import { useMerchantPresence } from './MerchantPresenceProvider';

type MerchantAuthControlsProps = {
  loginHref: string;
  signupHref: string;
};

export function MerchantAuthControls({ loginHref, signupHref }: MerchantAuthControlsProps) {
  const { merchant, panelHref } = useMerchantPresence();

  if (merchant) {
    const initials = merchantInitials(merchant.name);
    return (
      <Link
        href={panelHref}
        className="group flex max-w-[16.5rem] items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] py-1 pl-1 pr-2.5 text-left shadow-[0_16px_40px_-28px_rgba(124,58,237,0.95)] transition-all duration-300 hover:border-violet-300/35 hover:bg-white/[0.11] sm:pr-3"
      >
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-500/20 text-[12px] font-bold text-violet-100 ring-1 ring-white/15">
          {merchant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={merchant.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold leading-tight text-white sm:text-sm">
            {merchant.name}
          </span>
          <span className="hidden text-[11px] font-medium text-violet-200/90 sm:block">Ir al panel</span>
        </span>
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-white/55 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white sm:block" />
      </Link>
    );
  }

  return (
    <>
      <Link
        href={loginHref}
        className="hidden items-center justify-center rounded-full border border-white/14 bg-white/6 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:border-violet-300/30 hover:bg-white/10 sm:inline-flex"
      >
        Iniciar sesión
      </Link>
      <Link
        href={signupHref}
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FACC15] px-3.5 py-2 text-[11px] font-bold text-[#0B0F1A] shadow-[0_20px_50px_-20px_rgba(250,204,21,0.75)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047] sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
      >
        Quiero mi kit
        <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Link>
    </>
  );
}

export function MerchantMobileSignupLink({ signupHref }: { signupHref: string }) {
  const { merchant } = useMerchantPresence();
  if (merchant) return null;
  return (
    <Link
      href={signupHref}
      className="whitespace-nowrap rounded-full border border-[#FACC15]/30 bg-[#FACC15]/10 px-3 py-2 text-[13px] font-medium text-[#FACC15]"
    >
      Quiero mi kit
    </Link>
  );
}

export function MerchantHeroPrimary({ signupHref }: { signupHref: string }) {
  const { merchant, panelHref } = useMerchantPresence();
  if (merchant) {
    return (
      <Link
        href={panelHref}
        className="hero-mobile-button group animate-fade-up animation-delay-500 relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FACC15] px-5 py-4 text-center text-[0.95rem] font-bold leading-tight text-[#0B0F1A] shadow-[0_34px_90px_-18px_rgba(250,204,21,1)] transition-all duration-300 hover:scale-[1.04] hover:bg-[#fde047] sm:min-w-[20rem] sm:w-auto sm:px-8 sm:text-base"
      >
        <span className="animate-shine absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 blur-md" />
        Ir a mi panel
        <ChevronRight className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <Link
      href={signupHref}
      className="hero-mobile-button group animate-fade-up animation-delay-500 relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#FACC15] px-5 py-4 text-center text-[0.95rem] font-bold leading-tight text-[#0B0F1A] shadow-[0_34px_90px_-18px_rgba(250,204,21,1)] transition-all duration-300 hover:scale-[1.04] hover:bg-[#fde047] sm:min-w-[20rem] sm:w-auto sm:px-8 sm:text-base"
    >
      <span className="animate-shine absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 blur-md" />
      <span className="hero-cta-desktop-label">Quiero mi Kit Menú Inteligente</span>
      <span className="hero-cta-mobile-label">Crear mi menú inteligente por $10</span>
      <ChevronRight className="h-4 w-4" />
    </Link>
  );
}

export function MerchantHeroNote() {
  const { merchant } = useMerchantPresence();
  if (merchant) {
    return (
      <p className="animate-fade-up animation-delay-700 mt-3 text-center text-xs font-medium text-slate-300/85 sm:text-sm lg:text-left">
        Sesión activa en <span className="text-white">{merchant.name}</span>. Continúa donde lo dejaste.
      </p>
    );
  }
  return (
    <p className="animate-fade-up animation-delay-700 mt-3 text-center text-xs font-medium text-slate-300/85 sm:text-sm lg:text-left">
      <span className="text-[#FACC15]">Kit $10</span> · plataforma $10/mes o $90/año.
    </p>
  );
}

export function MerchantCtaPrimary({ signupHref }: { signupHref: string }) {
  const { merchant, panelHref } = useMerchantPresence();
  return (
    <Link
      href={merchant ? panelHref : signupHref}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#FACC15] px-6 py-4 text-sm font-bold text-[#0B0F1A] shadow-[0_22px_50px_-24px_rgba(250,204,21,0.95)] transition-all duration-300 hover:scale-105 hover:bg-[#fde047]"
    >
      {merchant ? 'Ir a mi panel' : 'Quiero mi Kit Menú Inteligente'}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
