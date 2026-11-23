'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getBrowserSupabase } from '../../_lib/supabase-browser';
import { appSiteUrl } from '../../_lib/public-site-config';
import { safePanelNext } from '../_lib/safe-panel-next';

export function PanelLoginClient({
  searchParamsPromise,
}: {
  searchParamsPromise?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const router = useRouter();
  const [nextPath, setNextPath] = useState('/panel/conversaciones');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sp = searchParamsPromise ? await searchParamsPromise : {};
      const next = safePanelNext(
        typeof sp.next === 'string' ? sp.next : '',
      );
      if (!cancelled) setNextPath(next);

      const sb = getBrowserSupabase();
      if (!sb) return;
      const { data } = await sb.auth.getSession();
      if (!cancelled && data.session?.access_token) {
        router.replace(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParamsPromise, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getBrowserSupabase();
    if (!sb) {
      setBusy(false);
      setError('Supabase no está configurado en este entorno.');
      return;
    }
    const { data, error: authError } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError || !data.session) {
      setError(authError?.message || 'No se pudo iniciar sesión.');
      return;
    }
    router.replace(nextPath);
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold">Acceso a conversaciones</h2>
      <p className="mt-2 text-sm text-stone-600">
        Usa la misma cuenta del panel del restaurante. Si prefieres el panel
        completo, entra en{' '}
        <a className="underline" href={appSiteUrl}>
          app.elmenuxfa.com
        </a>
        .
      </p>
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm">
          <span className="font-medium">Correo</span>
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Clave</span>
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[#c45c26] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
