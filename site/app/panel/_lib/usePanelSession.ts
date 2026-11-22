'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { getBrowserSupabase } from '../../_lib/supabase-browser';

export function usePanelSession(options?: { requireAuth?: boolean }) {
  const requireAuth = options?.requireAuth !== false;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Local/E2E harness only — never set NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER in prod.
    const e2eBearer = (
      process.env.NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER || ''
    ).trim();
    if (e2eBearer) {
      setToken(e2eBearer);
      setEmail('e2e@local');
      setUserId(
        (process.env.NEXT_PUBLIC_CHAT_SUPERVISION_E2E_USER_ID || '').trim() ||
          'e2e-user',
      );
      setReady(true);
      return e2eBearer;
    }
    const sb = getBrowserSupabase();
    if (!sb) {
      setToken(null);
      setUserId(null);
      setReady(true);
      return null;
    }
    const { data } = await sb.auth.getSession();
    const access = data.session?.access_token || null;
    setToken(access);
    setEmail(data.session?.user?.email || null);
    setUserId(data.session?.user?.id || null);
    setReady(true);
    return access;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const access = await refresh();
      if (cancelled) return;
      const e2eBearer = (
        process.env.NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER || ''
      ).trim();
      if (requireAuth && !access && !e2eBearer) {
        const qs = searchParams?.toString();
        const next = `${pathname}${qs ? `?${qs}` : ''}`;
        router.replace(`/panel/login?next=${encodeURIComponent(next)}`);
      }
    })();
    const sb = getBrowserSupabase();
    const { data: sub } = sb
      ? sb.auth.onAuthStateChange((_event, session) => {
          if (
            (process.env.NEXT_PUBLIC_CHAT_SUPERVISION_E2E_BEARER || '').trim()
          ) {
            return;
          }
          setToken(session?.access_token || null);
          setEmail(session?.user?.email || null);
          setUserId(session?.user?.id || null);
        })
      : { data: { subscription: { unsubscribe() {} } } };
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refresh, requireAuth, router, pathname, searchParams]);

  const signOut = useCallback(async () => {
    const sb = getBrowserSupabase();
    await sb?.auth.signOut();
    setToken(null);
    setUserId(null);
    router.replace('/panel/login');
  }, [router]);

  return { token, email, userId, ready, refresh, signOut };
}
