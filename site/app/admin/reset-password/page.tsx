'use client';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { ADMIN_LOGIN_PATH, ADMIN_RESET_PASSWORD_PATH } from '../_lib/admin-routes';

const PASSWORD_MIN_LENGTH = 8;
const RECOVERY_STORAGE_KEY = 'elmenuxfa_admin_recovery';
const RECOVERY_INVALID_MESSAGE =
  'No se pudo validar el enlace de recuperacion. Solicita uno nuevo desde admin.elmenuxfa.com.';
const RECOVERY_UPDATE_ERROR_MESSAGE =
  'No se pudo actualizar la clave. Solicita un nuevo enlace e intenta otra vez.';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let recoveryClient: SupabaseClient | null | undefined;

function getRecoveryClient() {
  if (recoveryClient !== undefined) {
    return recoveryClient;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    recoveryClient = null;
    return recoveryClient;
  }

  recoveryClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: true,
      storageKey: RECOVERY_STORAGE_KEY,
    },
  });

  return recoveryClient;
}

function clearRecoveryUrl() {
  const currentUrl = new URL(window.location.href);

  currentUrl.searchParams.delete('code');
  currentUrl.searchParams.delete('token_hash');
  currentUrl.searchParams.delete('type');
  currentUrl.searchParams.delete('error');
  currentUrl.searchParams.delete('error_code');
  currentUrl.searchParams.delete('error_description');
  currentUrl.hash = '';

  window.history.replaceState(window.history.state, '', currentUrl.toString());
}

async function resolveRecoverySession(client: SupabaseClient): Promise<Session | null> {
  const currentUrl = new URL(window.location.href);
  const code = currentUrl.searchParams.get('code');
  const tokenHash = currentUrl.searchParams.get('token_hash');
  const type = currentUrl.searchParams.get('type');

  if (type === 'recovery' && tokenHash) {
    const { data, error } = await client.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });

    clearRecoveryUrl();

    if (error) {
      throw error;
    }

    return data.session ?? null;
  }

  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    clearRecoveryUrl();

    if (error) {
      throw error;
    }

    return data.session ?? null;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session ?? null;
}

type RecoveryStatus = 'checking' | 'ready' | 'invalid';

async function recordPasswordResetSuccess(client: SupabaseClient) {
  const { data } = await client.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    return;
  }

  await fetch('/admin/api/auth/recover', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
}

export default function AdminResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RecoveryStatus>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRecovery() {
      const client = getRecoveryClient();

      if (!client) {
        if (!cancelled) {
          setStatus('invalid');
          setFormError(RECOVERY_INVALID_MESSAGE);
        }

        return;
      }

      try {
        const session = await resolveRecoverySession(client);

        if (cancelled) {
          return;
        }

        if (!session) {
          setStatus('invalid');
          setFormError(RECOVERY_INVALID_MESSAGE);
          return;
        }

        setStatus('ready');
        setFormError(null);
      } catch {
        if (cancelled) {
          return;
        }

        setStatus('invalid');
        setFormError(RECOVERY_INVALID_MESSAGE);
      }
    }

    void bootstrapRecovery();

    return () => {
      cancelled = true;
    };
  }, []);

  function validatePasswords() {
    if (password.length < PASSWORD_MIN_LENGTH) {
      return 'La nueva clave debe tener al menos 8 caracteres.';
    }

    if (password !== confirmPassword) {
      return 'Las contraseñas no coinciden.';
    }

    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const client = getRecoveryClient();

    if (!client || status !== 'ready') {
      setFormError(RECOVERY_INVALID_MESSAGE);
      return;
    }

    const validationError = validatePasswords();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    startTransition(() => {
      void (async () => {
        const { error } = await client.auth.updateUser({ password });

        if (error) {
          setFormError(RECOVERY_UPDATE_ERROR_MESSAGE);
          return;
        }

        await recordPasswordResetSuccess(client).catch(() => undefined);
        await client.auth.signOut();
        router.replace(`${ADMIN_LOGIN_PATH}?message=password_reset_success`);
      })();
    });
  }

  const isReady = status === 'ready';
  const isChecking = status === 'checking';
  const isSubmitting = isPending;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#7c3aed_0%,rgba(124,58,237,0.18)_22%,transparent_42%),radial-gradient(circle_at_bottom_right,#1d4ed8_0%,rgba(29,78,216,0.16)_16%,transparent_38%),linear-gradient(180deg,#0f1025_0%,#151337_50%,#1b1646_100%)] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,520px)]">
        <section className="space-y-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
            Admin Maestro
          </span>
          <div className="space-y-3">
            <h1 className="max-w-2xl font-[var(--font-display)] text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
              Restablece tu clave de acceso al panel admin.
            </h1>
            <p className="max-w-xl text-sm leading-7 text-violet-100/80 sm:text-base">
              Este flujo corre solo en admin.elmenuxfa.com y usa el cliente anon publico de Supabase para
              validar el recovery link y actualizar la contraseña sin exponer llaves sensibles.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Recovery</p>
              <p className="mt-2 text-sm font-semibold text-white">Token aislado por host</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">
                El enlace de reset se procesa solo en el subdominio admin.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Validacion</p>
              <p className="mt-2 text-sm font-semibold text-white">Clave minima de 8</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">
                Se bloquea el envio si la nueva clave no cumple o no coincide.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-100/72">Seguridad</p>
              <p className="mt-2 text-sm font-semibold text-white">Sin service role</p>
              <p className="mt-2 text-xs leading-6 text-violet-100/72">
                No se imprimen tokens ni se expone ninguna credencial privada.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/12 bg-white/[0.08] p-6 shadow-[0_40px_100px_-50px_rgba(5,8,22,0.88)] backdrop-blur-xl sm:p-8">
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-100/72">
              Password recovery
            </p>
            <h2 className="font-[var(--font-display)] text-2xl font-black tracking-[-0.04em] text-white">
              Elige tu nueva clave
            </h2>
            <p className="text-sm leading-7 text-violet-100/75">
              Usa una clave nueva para continuar. Al guardar, volveras a la pantalla de login del panel.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-violet-50">Nueva clave</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Minimo 8 caracteres"
                className="h-12 w-full rounded-[1rem] border border-white/12 bg-[#12142c]/90 px-4 text-sm text-white outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30"
                disabled={!isReady || isSubmitting}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-violet-50">Confirmar clave</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Repite la nueva clave"
                className="h-12 w-full rounded-[1rem] border border-white/12 bg-[#12142c]/90 px-4 text-sm text-white outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-300/30"
                disabled={!isReady || isSubmitting}
              />
            </label>

            {isChecking ? (
              <div className="rounded-[1rem] border border-white/12 bg-white/8 px-4 py-3 text-sm text-violet-100/85">
                Validando el enlace seguro de recuperacion...
              </div>
            ) : null}

            {formError ? (
              <div className="rounded-[1rem] border border-rose-300/30 bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                {formError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!isReady || isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-[1rem] bg-[#c084fc] px-5 text-sm font-black text-[#120b28] transition hover:bg-[#d8b4fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16183a] disabled:cursor-not-allowed disabled:bg-violet-200/40 disabled:text-[#120b28]/70"
            >
              {isSubmitting ? 'Actualizando clave...' : 'Guardar nueva clave'}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-violet-100/72">
            <p>Hostname interno: {ADMIN_RESET_PASSWORD_PATH}</p>
            <Link
              href={ADMIN_LOGIN_PATH}
              className="font-semibold text-white underline decoration-violet-200/30 underline-offset-4"
            >
              Volver a login
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}