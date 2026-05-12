'use client';

import { useState, type FormEvent } from 'react';

import { newsletterApiPath, newsletterSource } from '../../app/_lib/public-site-config';

type SubmissionState = 'idle' | 'submitting' | 'success' | 'error';

const defaultMessage = 'No spam. Puedes darte de baja cuando quieras.';

export function ConsumerNewsletterForm() {
  const [email, setEmail] = useState('');
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [message, setMessage] = useState(defaultMessage);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setSubmissionState('error');
      setMessage('Ingresa un correo válido para continuar.');
      return;
    }

    setSubmissionState('submitting');
    setMessage('Registrando tu correo...');

    try {
      const response = await fetch(newsletterApiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          source: newsletterSource,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos registrar tu correo en este momento.');
      }

      setEmail('');
      setSubmissionState('success');
      setMessage(
        payload?.message ?? 'Listo. Te avisaremos cuando haya promociones y novedades cerca de ti.',
      );
    } catch (error) {
      setSubmissionState('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos registrar tu correo en este momento.',
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <label className="block flex-1">
        <span className="sr-only">Correo para recibir promociones</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          placeholder="Ingresa tu correo electrónico"
          className="h-11 w-full rounded-[0.85rem] border border-white/10 bg-[#050c18] px-4 text-sm text-white outline-none transition-all duration-300 placeholder:text-slate-500 focus:border-violet-400/45"
        />
      </label>

      <button
        type="submit"
        aria-label="Suscribirme al boletín de promociones"
        disabled={submissionState === 'submitting'}
        className="inline-flex h-11 w-full items-center justify-center rounded-[0.85rem] bg-[#FACC15] px-5 text-sm font-black text-[#0B1120] transition-all duration-300 hover:bg-[#fde047] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submissionState === 'submitting' ? 'Registrando...' : 'Suscribirme'}
      </button>

      <p
        aria-live="polite"
        className={`mt-2 text-[11px] ${
          submissionState === 'error'
            ? 'text-rose-300'
            : submissionState === 'success'
              ? 'text-emerald-300'
              : 'text-slate-500'
        }`}
      >
        {message}
      </p>
    </form>
  );
}