'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers3, Plus, RefreshCw, Search, ToggleLeft, ToggleRight } from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';

type BusinessSector = {
  id: string;
  nombre: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type AdminBusinessSectorsPanelProps = {
  admin: CurrentAdmin;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operacion.');
  }
  return payload;
}

export function AdminBusinessSectorsPanel({ admin }: AdminBusinessSectorsPanelProps) {
  const canWrite = admin.permissions.includes('settings.write');
  const [sectors, setSectors] = useState<BusinessSector[]>([]);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorSortOrder, setNewSectorSortOrder] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadSectors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/admin/api/sectores', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await readJson<{ ok: true; data: BusinessSector[] }>(response);
      setSectors(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los sectores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSectors();
  }, [loadSectors]);

  const filteredSectors = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sectors.filter((sector) => {
      if (!showInactive && !sector.is_active) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return sector.nombre.toLowerCase().includes(normalizedQuery);
    });
  }, [query, sectors, showInactive]);

  async function handleCreateSector(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      return;
    }

    const nombre = newSectorName.trim();
    const sortOrder = Number(newSectorSortOrder);

    if (nombre.length < 2) {
      setError('Escribe un nombre de sector valido.');
      return;
    }

    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      setError('El orden debe ser un numero mayor o igual a 0.');
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/admin/api/sectores', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, sort_order: Math.trunc(sortOrder), is_active: true }),
      });
      const payload = await readJson<{ ok: true; data: BusinessSector }>(response);
      setSectors((current) =>
        [...current, payload.data].sort((left, right) => {
          if (left.sort_order !== right.sort_order) {
            return left.sort_order - right.sort_order;
          }
          return left.nombre.localeCompare(right.nombre, 'es');
        }),
      );
      setNewSectorName('');
      setNewSectorSortOrder('0');
      setStatusMessage(`Sector "${payload.data.nombre}" creado.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear el sector.');
    } finally {
      setSaving(false);
    }
  }

  async function updateSector(
    sector: BusinessSector,
    updates: Partial<Pick<BusinessSector, 'nombre' | 'sort_order' | 'is_active'>>,
  ) {
    if (!canWrite) {
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/admin/api/sectores', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sector.id, ...updates }),
      });
      const payload = await readJson<{ ok: true; data: BusinessSector }>(response);
      setSectors((current) =>
        current.map((item) => (item.id === sector.id ? payload.data : item)),
      );
      setStatusMessage(`Sector "${payload.data.nombre}" actualizado.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'No se pudo actualizar el sector.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSector(sector: BusinessSector) {
    if (!canWrite || !sector.is_active) {
      return;
    }

    if (!window.confirm(`Desactivar el sector "${sector.nombre}"? Dejara de aparecer en el onboarding.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch('/admin/api/sectores', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sector.id }),
      });
      const payload = await readJson<{ ok: true; data: BusinessSector }>(response);
      setSectors((current) =>
        current.map((item) => (item.id === sector.id ? payload.data : item)),
      );
      setStatusMessage(`Sector "${payload.data.nombre}" desactivado.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'No se pudo desactivar el sector.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-violet-200/80 bg-[linear-gradient(135deg,#1b1140_0%,#31106a_45%,#5b21b6_100%)] p-6 text-white shadow-[0_30px_90px_-48px_rgba(91,33,182,0.7)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
              <Layers3 className="h-3.5 w-3.5" />
              Catalogo operativo
            </span>
            <div className="space-y-2">
              <h1 className="font-[var(--font-display)] text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                Sectores de negocio
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-violet-100/82 sm:text-base">
                Estas opciones alimentan el selector de sector en el onboarding de app.elmenuxfa.com.
                Los negocios existentes conservan el texto guardado en su perfil aunque renombres un sector.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadSectors()}
            disabled={loading || saving}
            className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </section>

      {(error || statusMessage) && (
        <div
          className={[
            'rounded-[1.35rem] border px-4 py-3 text-sm font-medium',
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          ].join(' ')}
        >
          {error ?? statusMessage}
        </div>
      )}

      {canWrite ? (
        <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
          <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
            Agregar sector
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Los sectores activos aparecen en la app. Usa el orden para priorizar rubros frecuentes.
          </p>

          <form className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_160px_auto]" onSubmit={handleCreateSector}>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Nombre</span>
              <input
                value={newSectorName}
                onChange={(event) => setNewSectorName(event.target.value)}
                placeholder="Ej. Cafeteria"
                maxLength={80}
                className="mt-2 w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Orden</span>
              <input
                value={newSectorSortOrder}
                onChange={(event) => setNewSectorSortOrder(event.target.value)}
                inputMode="numeric"
                className="mt-2 w-full rounded-[1rem] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 inline-flex items-center justify-center gap-2 self-end rounded-[1rem] bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60 lg:mt-auto"
            >
              <Plus className="h-4 w-4" />
              Crear sector
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-[1.35rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu rol solo puede consultar este catalogo. Los cambios requieren permiso de configuracion.
        </section>
      )}

      <section className="rounded-[1.8rem] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-[var(--font-display)] text-xl font-black tracking-[-0.03em] text-slate-950">
              Catalogo actual
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {filteredSectors.length} de {sectors.length} sectores visibles en esta vista.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar sector"
                className="w-full rounded-[1rem] border border-slate-200 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none ring-violet-200 transition focus:ring-4"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowInactive((current) => !current)}
              className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {showInactive ? <ToggleRight className="h-4 w-4 text-violet-600" /> : <ToggleLeft className="h-4 w-4" />}
              {showInactive ? 'Mostrando inactivos' : 'Solo activos'}
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[1.35rem] border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-4 py-3">Estado</th>
                  {canWrite ? <th className="px-4 py-3">Acciones</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={canWrite ? 4 : 3} className="px-4 py-8 text-center text-slate-500">
                      Cargando sectores...
                    </td>
                  </tr>
                ) : filteredSectors.length === 0 ? (
                  <tr>
                    <td colSpan={canWrite ? 4 : 3} className="px-4 py-8 text-center text-slate-500">
                      No hay sectores que coincidan con el filtro.
                    </td>
                  </tr>
                ) : (
                  filteredSectors.map((sector) => (
                    <SectorRow
                      key={sector.id}
                      sector={sector}
                      canWrite={canWrite}
                      saving={saving}
                      onUpdate={updateSector}
                      onDeactivate={deactivateSector}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function SectorRow({
  sector,
  canWrite,
  saving,
  onUpdate,
  onDeactivate,
}: {
  sector: BusinessSector;
  canWrite: boolean;
  saving: boolean;
  onUpdate: (
    sector: BusinessSector,
    updates: Partial<Pick<BusinessSector, 'nombre' | 'sort_order' | 'is_active'>>,
  ) => Promise<void>;
  onDeactivate: (sector: BusinessSector) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(sector.nombre);
  const [sortOrder, setSortOrder] = useState(String(sector.sort_order));

  useEffect(() => {
    setNombre(sector.nombre);
    setSortOrder(String(sector.sort_order));
  }, [sector.id, sector.nombre, sector.sort_order]);

  const hasPendingChanges =
    nombre.trim() !== sector.nombre || Number(sortOrder) !== sector.sort_order;

  return (
    <tr className={sector.is_active ? 'text-slate-800' : 'bg-slate-50 text-slate-500'}>
      <td className="px-4 py-3">
        {canWrite ? (
          <input
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            maxLength={80}
            className="w-full min-w-[220px] rounded-[0.9rem] border border-slate-200 px-3 py-2 text-sm outline-none ring-violet-200 transition focus:ring-4"
          />
        ) : (
          sector.nombre
        )}
      </td>
      <td className="px-4 py-3">
        {canWrite ? (
          <input
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            inputMode="numeric"
            className="w-24 rounded-[0.9rem] border border-slate-200 px-3 py-2 text-sm outline-none ring-violet-200 transition focus:ring-4"
          />
        ) : (
          sector.sort_order
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={[
            'inline-flex rounded-full px-3 py-1 text-xs font-bold',
            sector.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600',
          ].join(' ')}
        >
          {sector.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      {canWrite ? (
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {hasPendingChanges ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void onUpdate(sector, {
                    nombre: nombre.trim(),
                    sort_order: Math.trunc(Number(sortOrder)),
                  })
                }
                className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                Guardar
              </button>
            ) : null}

            {!sector.is_active ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onUpdate(sector, { is_active: true })}
                className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
              >
                Activar
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onDeactivate(sector)}
                className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                Desactivar
              </button>
            )}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
