'use client';

import { useEffect } from 'react';

import { merchantAppAuthHref } from '../../_lib/public-site-config';
import { safePanelNext } from '../_lib/safe-panel-next';

/**
 * Client fallback if the server redirect in page.tsx is bypassed.
 * Always sends merchants to app.elmenuxfa.com — never a second login UI.
 */
export function PanelLoginClient({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sp = searchParamsPromise ? await searchParamsPromise : {};
      const next = safePanelNext(
        typeof sp.next === 'string' ? sp.next : '',
      );
      if (cancelled) return;
      window.location.replace(merchantAppAuthHref(next));
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParamsPromise]);

  return (
    <p className="p-6 text-sm text-[#5B4B7A]">
      Redirigiendo al inicio de sesión de elmenuxfa.com…
    </p>
  );
}
