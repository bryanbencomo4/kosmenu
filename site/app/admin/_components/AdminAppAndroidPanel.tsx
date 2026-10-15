'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Smartphone, Upload } from 'lucide-react';

import type { CurrentAdmin } from '../_lib/admin-auth';

type Release = {
  versionCode: number;
  versionName: string;
  forceUpdate: boolean;
  notes: string;
  objectPath: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedByEmail: string | null;
  downloadUrl: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo completar la operación.');
  }
  return payload;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminAppAndroidPanel({ admin }: { admin: CurrentAdmin }) {
  const canWrite = admin.permissions.includes('settings.write');
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState('');
  const [versionName, setVersionName] = useState('');
  const [notes, setNotes] = useState('');
  const [forceUpdate, setForceUpdate] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<{ data: { release: Release | null } }>(
        await fetch('/admin/api/app-android', { cache: 'no-store' }),
      );
      setRelease(payload.data.release);
      if (payload.data.release) {
        setVersionCode(String(payload.data.release.versionCode + 1));
        const parts = payload.data.release.versionName.split('.');
        const last = Number(parts[parts.length - 1] ?? '0');
        if (Number.isFinite(last)) {
          parts[parts.length - 1] = String(last + 1);
          setVersionName(parts.join('.'));
        }
      } else {
        setVersionCode('2');
        setVersionName('1.0.1');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishRelease() {
    if (!canWrite) return;
    if (!file) {
      setError('Selecciona un archivo .apk.');
      return;
    }
    const code = Number(versionCode);
    if (!Number.isFinite(code) || code < 1) {
      setError('versionCode inválido.');
      return;
    }
    if (!versionName.trim()) {
      setError('versionName es obligatorio.');
      return;
    }

    setUploading(true);
    setError(null);
    setOkMessage(null);
    try {
      const prepared = await readJson<{
        data: { objectPath: string; uploadUrl: string };
      }>(
        await fetch('/admin/api/app-android', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'prepare',
            versionCode: code,
            versionName: versionName.trim(),
            fileName: file.name,
            fileSize: file.size,
          }),
        }),
      );

      const uploadResponse = await fetch(prepared.data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'x-upsert': 'true',
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(
          `Fallo al subir el APK a storage (${uploadResponse.status}).`,
        );
      }

      const published = await readJson<{ data: { release: Release } }>(
        await fetch('/admin/api/app-android', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'publish',
            versionCode: code,
            versionName: versionName.trim(),
            notes: notes.trim(),
            forceUpdate,
            objectPath: prepared.data.objectPath,
            fileName: file.name,
          }),
        }),
      );

      setRelease(published.data.release);
      setFile(null);
      setOkMessage(
        `APK ${published.data.release.versionName} (${published.data.release.versionCode}) publicado. Las apps más antiguas pedirán actualizar.`,
      );
      setVersionCode(String(published.data.release.versionCode + 1));
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'No se pudo publicar el APK.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-600">
            App Android
          </p>
          <h1 className="mt-1 font-[var(--font-display)] text-2xl font-black tracking-[-0.03em] text-slate-950">
            Actualizaciones del APK
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Publica un nuevo APK de producción. Los clientes con la app instalada deberán
            descargar e instalar esta versión antes de seguir usando el panel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
        >
          <RefreshCw className="h-4 w-4" />
          Recargar
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {okMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {okMessage}
        </div>
      ) : null}

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-800">
          <Smartphone className="h-5 w-5 text-violet-600" />
          <h2 className="text-base font-black">Versión publicada</h2>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Cargando…</p>
        ) : release ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Version name
              </p>
              <p className="mt-1 text-lg font-black text-slate-900">{release.versionName}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Version code
              </p>
              <p className="mt-1 text-lg font-black text-slate-900">{release.versionCode}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3 sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Detalle
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {release.fileName} · {formatBytes(release.fileSize)} ·{' '}
                {release.forceUpdate ? 'Actualización obligatoria' : 'Opcional'} ·{' '}
                {new Date(release.uploadedAt).toLocaleString('es-VE')}
                {release.uploadedByEmail ? ` · ${release.uploadedByEmail}` : ''}
              </p>
              {release.notes ? (
                <p className="mt-2 text-sm text-slate-600">{release.notes}</p>
              ) : null}
              {release.downloadUrl ? (
                <a
                  href={release.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-violet-700"
                >
                  <Download className="h-4 w-4" />
                  Descargar APK actual
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Aún no hay un APK publicado. Sube el primero para activar el control de versiones.
          </p>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-800">
          <Upload className="h-5 w-5 text-violet-600" />
          <h2 className="text-base font-black">Publicar nuevo APK</h2>
        </div>
        {!canWrite ? (
          <p className="mt-4 text-sm text-slate-500">
            Tu rol solo puede consultar. Se requiere permiso <code>settings.write</code>.
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Archivo APK
              </span>
              <input
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-700"
              />
              {file ? (
                <p className="mt-1 text-xs text-slate-500">
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  versionCode (entero)
                </span>
                <input
                  type="number"
                  min={1}
                  value={versionCode}
                  onChange={(event) => setVersionCode(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Debe ser mayor que el actual. Coincide con el <code>+N</code> de Flutter
                  (`1.0.0+N`).
                </p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  versionName
                </span>
                <input
                  type="text"
                  value={versionName}
                  onChange={(event) => setVersionName(event.target.value)}
                  placeholder="1.0.1"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Notas (opcional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Qué cambia en esta versión…"
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={forceUpdate}
                onChange={(event) => setForceUpdate(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Forzar actualización (bloquear app hasta instalar)
            </label>

            <button
              type="button"
              disabled={uploading}
              onClick={() => void publishRelease()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#6D28D9] px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {uploading ? 'Publicando…' : 'Subir y publicar APK'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
