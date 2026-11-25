'use client';

import { useState } from 'react';

import { getBrowserSupabase } from '../_lib/supabase-browser';

export type AccountCardMode = 'password' | 'email' | 'menu';

type BusinessAccountCardProps = {
  mode: AccountCardMode;
  onDone?: (message: string) => void;
  onPickMode?: (mode: 'password' | 'email') => void;
};

/**
 * In-chat secure account updates — never displays tokens/secrets.
 */
export function BusinessAccountCard({ mode, onDone, onPickMode }: BusinessAccountCardProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextEmail, setNextEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (mode === 'menu') {
    return (
      <div
        className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
        data-business-account-card="menu"
      >
        <p className="text-[13px] font-semibold text-[var(--chat-text)]">🔐 Tu cuenta</p>
        <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
          Cambia email o contraseña aquí — sin salir del chat
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onPickMode?.('password')}
            className="rounded-lg bg-[var(--chat-send)] px-2 py-2 text-[12px] font-semibold text-[var(--chat-send-fg)]"
          >
            Contraseña
          </button>
          <button
            type="button"
            onClick={() => onPickMode?.('email')}
            className="rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-2 py-2 text-[12px] font-semibold text-[var(--chat-text)]"
          >
            Email
          </button>
        </div>
      </div>
    );
  }

  async function submitPassword() {
    const sb = getBrowserSupabase();
    if (!sb) {
      setError('No pude conectar con la sesión.');
      return;
    }
    if (nextPassword.trim().length < 6) {
      setError('La nueva clave debe tener al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data: userData } = await sb.auth.getUser();
      const email = userData.user?.email;
      if (!email) throw new Error('Sin email en la sesión');
      if (currentPassword) {
        const { error: reauthErr } = await sb.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (reauthErr) throw new Error('La contraseña actual no coincide');
      }
      const { error: updErr } = await sb.auth.updateUser({ password: nextPassword });
      if (updErr) throw updErr;
      setCurrentPassword('');
      setNextPassword('');
      setInfo('Listo ✅ Contraseña actualizada.');
      onDone?.('¡Listo! Tu contraseña quedó actualizada 🔐');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cambiar la contraseña');
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail() {
    const sb = getBrowserSupabase();
    if (!sb) {
      setError('No pude conectar con la sesión.');
      return;
    }
    const mail = nextEmail.trim();
    if (!mail || !mail.includes('@')) {
      setError('Pon un email válido 🙂');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: updErr } = await sb.auth.updateUser({ email: mail });
      if (updErr) throw updErr;
      setNextEmail('');
      setInfo('Te enviamos confirmación al email nuevo (si aplica).');
      onDone?.(
        'Email actualizado ✉️ Si pide confirmación, revisa tu bandeja. No compartiré tokens ni claves.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude cambiar el email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
      data-business-account-card={mode}
    >
      <p className="text-[13px] font-semibold text-[var(--chat-text)]">
        {mode === 'password' ? '🔐 Nueva contraseña' : '✉️ Nuevo email'}
      </p>
      <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
        Aquí mismo, seguro — nunca muestro tokens
      </p>
      <div className="mt-2.5 space-y-2">
        {mode === 'password' ? (
          <>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña actual"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[13px] text-[var(--chat-text)] outline-none"
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Nueva contraseña (mín. 6)"
              value={nextPassword}
              onChange={(e) => setNextPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[13px] text-[var(--chat-text)] outline-none"
            />
          </>
        ) : (
          <input
            type="email"
            autoComplete="email"
            placeholder="nuevo@email.com"
            value={nextEmail}
            onChange={(e) => setNextEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[13px] text-[var(--chat-text)] outline-none"
          />
        )}
        {error ? <p className="text-[12px] text-red-500">{error}</p> : null}
        {info ? <p className="text-[12px] text-[var(--chat-send)]">{info}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void (mode === 'password' ? submitPassword() : submitEmail())}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--chat-send)] px-3 py-2 text-[12px] font-semibold text-[var(--chat-send-fg)] disabled:opacity-60"
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
