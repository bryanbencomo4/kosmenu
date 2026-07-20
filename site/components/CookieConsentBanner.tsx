'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Cookie } from 'lucide-react';

import { adminSiteHost, privacyPagePath } from '../app/_lib/public-site-config';

type ConsentDecision = 'accepted' | 'rejected';

const consentStorageKey = 'elmenuxfa-cookie-consent';
const consentCookieName = 'elmenuxfa_cookie_consent';
const consentMaxAge = 60 * 60 * 24 * 180;
const cookiePreferencesPath = `${privacyPagePath}#cookies`;

function parseConsentDecision(value: string | null): ConsentDecision | null {
  if (value === 'accepted' || value === 'rejected') {
    return value;
  }

  return null;
}

function readStoredDecision() {
  if (typeof document === 'undefined') {
    return 'accepted';
  }

  const cookieEntry = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${consentCookieName}=`));

  if (cookieEntry) {
    const cookieValue = cookieEntry.slice(consentCookieName.length + 1);
    const parsedCookieValue = parseConsentDecision(decodeURIComponent(cookieValue));

    if (parsedCookieValue) {
      return parsedCookieValue;
    }
  }

  try {
    return parseConsentDecision(window.localStorage.getItem(consentStorageKey));
  } catch {
    return null;
  }
}

function persistDecision(decision: ConsentDecision) {
  try {
    window.localStorage.setItem(consentStorageKey, decision);
  } catch {
    // Ignore storage errors and keep the cookie as the fallback persistence.
  }

  const secureAttribute = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${consentCookieName}=${encodeURIComponent(decision)}; path=/; max-age=${consentMaxAge}; samesite=lax${secureAttribute}`;
}

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsVisible(readStoredDecision() === null);
  }, []);

  const isAdminSurface =
    pathname.startsWith('/admin') ||
    (typeof window !== 'undefined' && window.location.hostname.toLowerCase() === adminSiteHost);

  if (isAdminSurface || !isVisible) {
    return null;
  }

  const handleDecision = (decision: ConsentDecision) => {
    persistDecision(decision);
    setIsVisible(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4 lg:pb-6">
      <div className="pointer-events-auto relative mx-auto max-w-[46rem] overflow-hidden rounded-[1.75rem] border border-violet-300/30 bg-[linear-gradient(135deg,rgba(17,13,38,0.96)_0%,rgba(10,14,32,0.97)_52%,rgba(7,14,28,0.99)_100%)] text-white shadow-[0_30px_100px_-34px_rgba(76,29,149,0.88),0_0_0_1px_rgba(255,255,255,0.04)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(250,204,21,0.08),transparent_24%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] [background-size:38px_38px] opacity-[0.16]" />
        <div className="absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(196,181,253,0.7),transparent)]" />

        <div className="relative grid gap-5 px-4 py-4 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center lg:gap-6 lg:px-6">
          <div className="flex min-w-0 gap-3 sm:gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center self-start rounded-[1.25rem] border border-violet-300/18 bg-[radial-gradient(circle,rgba(168,85,247,0.18)_0%,rgba(91,33,182,0.08)_55%,rgba(255,255,255,0.02)_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_0_28px_rgba(139,92,246,0.22)] sm:h-15 sm:w-15">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-300/25 bg-[#120f25]/90 text-violet-100 shadow-[0_0_22px_rgba(168,85,247,0.28)] sm:h-11 sm:w-11">
                <Cookie className="h-5 w-5 sm:h-5.5 sm:w-5.5" />
              </div>
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/18 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-100">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FACC15]" />
                Cookies
              </div>

              <p className="mt-3 font-[var(--font-display)] text-[1.05rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-white sm:text-[1.22rem]">
                Preferencia de cookies
              </p>

              <p className="mt-2 max-w-[36rem] text-[13px] leading-6 text-slate-300 sm:text-sm">
                Guardamos únicamente tu preferencia de cookies en este dispositivo. Hoy no usamos cookies de analítica ni
                publicidad. Puedes aceptar o rechazar esta preferencia.
              </p>

              <Link
                href={cookiePreferencesPath}
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-violet-100 underline decoration-violet-200/24 underline-offset-4 transition-colors duration-200 hover:text-[#FACC15] hover:decoration-[#FACC15]/35"
              >
                Política de privacidad
                <span aria-hidden="true">›</span>
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 lg:pl-2">
            <button
              type="button"
              onClick={() => handleDecision('accepted')}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] bg-[#FACC15] px-5 text-sm font-black text-[#0B1120] shadow-[0_12px_30px_-18px_rgba(250,204,21,0.9)] transition-all duration-200 hover:bg-[#fde047] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FACC15] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1020]"
            >
              <Check className="h-4.5 w-4.5" />
              Aceptar
            </button>

            <button
              type="button"
              onClick={() => handleDecision('rejected')}
              className="inline-flex h-11 items-center justify-center rounded-[1rem] border border-white/12 bg-white/[0.03] px-5 text-sm font-bold text-violet-100/92 transition-all duration-200 hover:border-violet-300/30 hover:bg-violet-400/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1020]"
            >
              Rechazar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}