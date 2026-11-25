import Link from 'next/link';

import {
  BUSINESS_ASSISTANT_CANONICAL_APP_PATH,
  isBusinessAssistantUiEnabled,
  normalizeHandoffCode,
} from '../_lib/business-assistant';
import { BusinessAssistantView } from './BusinessAssistantView';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<
    string,
    string | string[] | undefined
  >;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Business assistant (Next fallback). Login stays at app.elmenuxfa.com/;
 * authenticated chat lives at app.elmenuxfa.com/asistente.
 */
export default async function BusinessAssistantPage({ searchParams }: PageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const handoffCode = normalizeHandoffCode(firstParam(params.h));

  if (!isBusinessAssistantUiEnabled()) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Asistente no disponible</h1>
        <p className="text-sm text-slate-600">
          El asistente para negocios está desactivado en este entorno (flag).
        </p>
        <p className="text-xs text-slate-500">
          Destino canónico previsto: {BUSINESS_ASSISTANT_CANONICAL_APP_PATH}
        </p>
        <Link
          href="https://app.elmenuxfa.com/"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Ir al panel
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] w-full">
      <BusinessAssistantView initialHandoffCode={handoffCode} />
    </main>
  );
}
