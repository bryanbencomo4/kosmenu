'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  buildClearedMerchantPresenceCookie,
  buildMerchantPresenceCookie,
  readMerchantPresenceFromDocumentCookie,
  sanitizeMerchantPresence,
  type MerchantPresence,
} from '../../app/_lib/merchant-presence';

type MerchantPresenceContextValue = {
  merchant: MerchantPresence | null;
  panelHref: string;
};

const MerchantPresenceContext = createContext<MerchantPresenceContextValue>({
  merchant: null,
  panelHref: 'https://app.elmenuxfa.com',
});

type MerchantPresenceProviderProps = {
  children: ReactNode;
  panelHref: string;
  presenceSrc: string;
  initialMerchant?: MerchantPresence | null;
};

type PresenceMessage = {
  source?: string;
  loggedIn?: boolean;
  reason?: string;
  merchant?: Partial<MerchantPresence> | null;
};

export function MerchantPresenceProvider({
  children,
  panelHref,
  presenceSrc,
  initialMerchant = null,
}: MerchantPresenceProviderProps) {
  const [merchant, setMerchant] = useState<MerchantPresence | null>(initialMerchant);

  useEffect(() => {
    if (merchant) return;
    const fromCookie = readMerchantPresenceFromDocumentCookie(document.cookie);
    if (fromCookie) {
      setMerchant(fromCookie);
    }
  }, [merchant]);

  useEffect(() => {
    function persist(next: MerchantPresence) {
      setMerchant(next);
      document.cookie = buildMerchantPresenceCookie(next, window.location.hostname);
    }

    function onMessage(event: MessageEvent<PresenceMessage>) {
      let expectedOrigin = '';
      try {
        expectedOrigin = new URL(presenceSrc, window.location.origin).origin;
      } catch {
        return;
      }
      if (event.origin !== expectedOrigin) return;
      const payload = event.data;
      if (!payload || payload.source !== 'elmenuxfa-merchant-presence') return;

      if (payload.loggedIn === false) {
        if (payload.reason === 'no-session') {
          setMerchant(null);
          document.cookie = buildClearedMerchantPresenceCookie(window.location.hostname);
        }
        return;
      }
      const next = sanitizeMerchantPresence(payload.merchant);
      if (next) persist(next);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [presenceSrc]);

  const value = useMemo(
    () => ({ merchant, panelHref }),
    [merchant, panelHref],
  );

  return (
    <MerchantPresenceContext.Provider value={value}>
      <iframe
        src={presenceSrc}
        title=""
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      />
      {children}
    </MerchantPresenceContext.Provider>
  );
}

export function useMerchantPresence() {
  return useContext(MerchantPresenceContext);
}

