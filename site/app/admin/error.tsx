'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] segment error', error?.digest, error?.message);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-16">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-500">
        Error del panel
      </p>
      <h1 className="mt-2 font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] text-slate-950">
        No se pudo cargar esta vista
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        El error quedo registrado. Puedes reintentar o volver al inicio del admin sin
        perder la sesion.
      </p>
      {error?.digest ? (
        <p className="mt-2 text-xs text-slate-400">Digest: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-[1rem] bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500"
        >
          Reintentar
        </button>
        <Link
          href="/admin"
          className="rounded-[1rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
