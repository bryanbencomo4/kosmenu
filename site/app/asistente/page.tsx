import Link from 'next/link';

import {
  isDiscoveryAssistantApiEnabled,
  isDiscoveryAssistantUiEnabled,
  normalizeDiscoveryRef,
} from '../_lib/discovery-assistant';
import { normalizeHandoffCode } from '../_lib/business-assistant';
import { DiscoveryAssistantView } from './DiscoveryAssistantView';

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

function sanitizeSeed(raw: string | null, max: number): string | null {
  const v = (raw ?? '').trim().slice(0, max);
  return v || null;
}

export default async function DiscoveryAssistantPage({ searchParams }: PageProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const shareRef = normalizeDiscoveryRef(firstParam(params.ref));
  const handoffCode = normalizeHandoffCode(firstParam(params.h));
  const seedQuery = sanitizeSeed(firstParam(params.q), 120);
  const seedZone = sanitizeSeed(firstParam(params.zone), 80);

  if (!isDiscoveryAssistantUiEnabled()) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Asistente no disponible</h1>
        <p className="text-sm text-slate-600">
          El asistente de descubrimiento está desactivado en este entorno.
        </p>
        <Link
          href="/"
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Ir al inicio
        </Link>
      </main>
    );
  }

  const apiEnabled = isDiscoveryAssistantApiEnabled();

  return (
    <main className="min-h-[100dvh] w-full">
      <DiscoveryAssistantView
        shareRef={shareRef}
        apiEnabled={apiEnabled}
        handoffCode={handoffCode}
        seedQuery={seedQuery}
        seedZone={seedZone}
      />
    </main>
  );
}
