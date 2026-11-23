'use client';

import { useEffect, useMemo, useState } from 'react';

import { KioskImage } from '../../v/[id]/_components/kiosk/KioskImage';

/**
 * Local visual harness for KioskImage timeout / placeholder / category change / retry.
 * Only served in development (`page.tsx` returns 404 in production).
 */
export function DevKioskImageClient() {
  const [scenario, setScenario] = useState<'hang' | 'ok' | 'missing'>('hang');
  const [categoryKey, setCategoryKey] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Short budgets so visual verification finishes in a few seconds.
    (window as Window & {
      __KOS_IMAGE_BUDGET_MS?: number;
      __KOS_IMAGE_PHASE_MS?: Record<string, number>;
    }).__KOS_IMAGE_BUDGET_MS = 4_000;
    (window as Window & {
      __KOS_IMAGE_PHASE_MS?: Record<string, number>;
    }).__KOS_IMAGE_PHASE_MS = { cold: 2_500, hot: 1_000, original: 1_000 };
    setReady(true);
  }, []);

  const src = useMemo(() => {
    if (scenario === 'hang') return `/api/dev/hang-image?k=${categoryKey}`;
    if (scenario === 'missing') return `https://example.invalid/missing-${categoryKey}.webp`;
    return `https://picsum.photos/seed/kosmenu-${categoryKey}/360/360`;
  }, [scenario, categoryKey]);

  if (!ready) {
    return <main className="p-6 text-sm">Preparando lab…</main>;
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 font-sans">
      <h1 className="text-lg font-semibold">KioskImage lab</h1>
      <p className="text-sm text-neutral-600">
        Presupuesto de prueba: 4s (cold 2.5s). Producción usa 22s.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded border px-2 py-1 text-sm" onClick={() => setScenario('hang')}>
          Hang
        </button>
        <button type="button" className="rounded border px-2 py-1 text-sm" onClick={() => setScenario('missing')}>
          404
        </button>
        <button type="button" className="rounded border px-2 py-1 text-sm" onClick={() => setScenario('ok')}>
          OK
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={() => setCategoryKey((k) => k + 1)}
        >
          Cambiar categoría
        </button>
      </div>
      <div
        className="relative h-48 w-full overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100"
        data-testid="kiosk-frame"
      >
        <KioskImage key={`${scenario}-${categoryKey}`} src={src} className="h-full w-full" priority />
      </div>
      <p className="text-xs text-neutral-500" data-testid="scenario-label">
        scenario={scenario} key={categoryKey}
      </p>
    </main>
  );
}
