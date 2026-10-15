import 'server-only';

import { getAdminSupabaseClient } from './admin-supabase';

export const APP_RELEASES_BUCKET = 'app-releases';
export const ANDROID_LATEST_META_PATH = 'android/latest.json';
export const ANDROID_MAX_APK_BYTES = 100 * 1024 * 1024;

export type AndroidReleaseMeta = {
  platform: 'android';
  versionCode: number;
  versionName: string;
  forceUpdate: boolean;
  notes: string;
  objectPath: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedByEmail: string | null;
};

export function isAndroidReleaseMeta(value: unknown): value is AndroidReleaseMeta {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.platform === 'android' &&
    typeof row.versionCode === 'number' &&
    Number.isFinite(row.versionCode) &&
    row.versionCode >= 1 &&
    typeof row.versionName === 'string' &&
    row.versionName.trim().length > 0 &&
    typeof row.forceUpdate === 'boolean' &&
    typeof row.objectPath === 'string' &&
    row.objectPath.trim().length > 0 &&
    typeof row.fileName === 'string' &&
    typeof row.fileSize === 'number' &&
    typeof row.uploadedAt === 'string'
  );
}

export function androidApkObjectPath(versionCode: number) {
  return `android/elmenuxfa-admin-${Math.trunc(versionCode)}.apk`;
}

export async function readAndroidReleaseMeta(): Promise<AndroidReleaseMeta | null> {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(APP_RELEASES_BUCKET)
    .download(ANDROID_LATEST_META_PATH);

  if (error || !data) {
    return null;
  }

  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as unknown;
    return isAndroidReleaseMeta(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeAndroidReleaseMeta(meta: AndroidReleaseMeta) {
  const supabase = getAdminSupabaseClient();
  const body = JSON.stringify(meta, null, 2);
  const { error } = await supabase.storage.from(APP_RELEASES_BUCKET).upload(
    ANDROID_LATEST_META_PATH,
    new Blob([body], { type: 'application/json' }),
    {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '60',
    },
  );
  if (error) {
    throw new Error(error.message || 'No se pudo guardar la metadata del APK.');
  }
}

export async function createAndroidApkUploadUrl(objectPath: string) {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(APP_RELEASES_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: true });

  if (error || !data?.signedUrl) {
    throw new Error(
      error?.message ||
        'No se pudo preparar la subida. ¿Existe el bucket app-releases?',
    );
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  };
}

export async function createAndroidApkDownloadUrl(objectPath: string, expiresIn = 3600) {
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(APP_RELEASES_BUCKET)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'No se pudo firmar la descarga del APK.');
  }

  return data.signedUrl;
}

export async function assertAndroidApkExists(objectPath: string) {
  const supabase = getAdminSupabaseClient();
  const folder = objectPath.includes('/')
    ? objectPath.slice(0, objectPath.lastIndexOf('/'))
    : '';
  const fileName = objectPath.includes('/')
    ? objectPath.slice(objectPath.lastIndexOf('/') + 1)
    : objectPath;

  const { data, error } = await supabase.storage.from(APP_RELEASES_BUCKET).list(folder, {
    search: fileName,
    limit: 20,
  });

  if (error) {
    throw new Error(error.message || 'No se pudo verificar el APK subido.');
  }

  const match = (data ?? []).find((item) => item.name === fileName);
  if (!match) {
    throw new Error('El APK no aparece en storage. Vuelve a subirlo.');
  }

  return {
    fileSize: typeof match.metadata?.size === 'number' ? match.metadata.size : 0,
  };
}
