'use client';

import { useState } from 'react';

import { getBrowserSupabase } from '../_lib/supabase-browser';

type Mode = 'login' | 'register';

type BusinessAuthCardProps = {
  onAuthed: (accessToken: string) => void;
};

/**
 * In-chat login / register — merchant never leaves the assistant thread.
 */
export function BusinessAuthCard({ onAuthed }: BusinessAuthCardProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    const sb = getBrowserSupabase();
    if (!sb) {
      setError('No pude conectar el login aquí. Revisa la configuración.');
      return;
    }
    const mail = email.trim();
    const pass = password;
    if (!mail || pass.length < 6) {
      setError('Email y contraseña (mín. 6) por favor 🙂');
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        const { data, error: err } = await sb.auth.signInWithPassword({
          email: mail,
          password: pass,
        });
        if (err) throw err;
        const token = data.session?.access_token;
        if (!token) throw new Error('Sin sesión');
        onAuthed(token);
        return;
      }
      const { data, error: err } = await sb.auth.signUp({
        email: mail,
        password: pass,
      });
      if (err) throw err;
      const token = data.session?.access_token;
      if (token) {
        onAuthed(token);
        return;
      }
      setInfo('Te envié un correo para confirmar ✉️ Luego entra aquí con tu clave.');
      setMode('login');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No pude entrar';
      setError(msg.includes('Invalid login') ? 'Email o clave incorrectos 🙈' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-1.5 w-full max-w-[min(92%,22rem)] overflow-hidden rounded-xl border border-[var(--chat-card-border)] bg-[var(--chat-card)] p-3 shadow-sm"
      data-business-auth-card="1"
    >
      <p className="text-[13px] font-semibold text-[var(--chat-text)]">
        {mode === 'login' ? '🔐 Entrar' : '✨ Crear cuenta'}
      </p>
      <p className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
        Aquí mismo, sin salir del chat
      </p>

      <div className="mt-2.5 flex gap-1 rounded-lg bg-[var(--chat-input)] p-0.5">
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold ${
            mode === 'login'
              ? 'bg-[var(--chat-card)] text-[var(--chat-text)] shadow-sm'
              : 'text-[var(--chat-text-muted)]'
          }`}
          onClick={() => setMode('login')}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold ${
            mode === 'register'
              ? 'bg-[var(--chat-card)] text-[var(--chat-text)] shadow-sm'
              : 'text-[var(--chat-text-muted)]'
          }`}
          onClick={() => setMode('register')}
        >
          Registrarme
        </button>
      </div>

      <label className="mt-2.5 block text-[11px] font-medium text-[var(--chat-text-muted)]">
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[14px] text-[var(--chat-text)] outline-none focus:ring-2 focus:ring-[var(--chat-send)]"
          placeholder="tu@correo.com"
          data-testid="business-auth-email"
        />
      </label>
      <label className="mt-2 block text-[11px] font-medium text-[var(--chat-text-muted)]">
        Contraseña
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          className="mt-1 w-full rounded-lg border border-[var(--chat-card-border)] bg-[var(--chat-input)] px-3 py-2 text-[14px] text-[var(--chat-text)] outline-none focus:ring-2 focus:ring-[var(--chat-send)]"
          placeholder="••••••••"
          data-testid="business-auth-password"
        />
      </label>

      {error ? (
        <p className="mt-2 text-[12px] text-rose-500" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-2 text-[12px] text-[var(--chat-text-muted)]">{info}</p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[var(--chat-send)] px-3 py-2.5 text-[13px] font-semibold text-[var(--chat-send-fg)] disabled:opacity-50"
        data-testid="business-auth-submit"
      >
        {busy ? 'Un segundo…' : mode === 'login' ? 'Entrar 🚀' : 'Crear cuenta ✨'}
      </button>
    </div>
  );
}
