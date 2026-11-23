import { Suspense } from 'react';

import { PanelLoginClient } from './PanelLoginClient';

export default function PanelLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-stone-500">Cargando…</p>}>
      <PanelLoginClient searchParamsPromise={searchParams} />
    </Suspense>
  );
}
