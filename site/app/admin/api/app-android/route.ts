import { NextResponse } from 'next/server';

import { requireAdminPermission } from '../../_lib/admin-auth';
import {
  ANDROID_MAX_APK_BYTES,
  androidApkObjectPath,
  assertAndroidApkExists,
  createAndroidApkDownloadUrl,
  createAndroidApkUploadUrl,
  readAndroidReleaseMeta,
  writeAndroidReleaseMeta,
  type AndroidReleaseMeta,
} from '../../_lib/admin-app-android';
import { logAdminAction } from '../../_lib/admin-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseVersionCode(raw: unknown) {
  const value = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(value) || value < 1 || value > 2_147_483_647) {
    return null;
  }
  return Math.trunc(value);
}

export async function GET() {
  try {
    await requireAdminPermission('settings.read');
    const meta = await readAndroidReleaseMeta();
    if (!meta) {
      return NextResponse.json({ ok: true, data: { release: null } });
    }

    let downloadUrl: string | null = null;
    try {
      downloadUrl = await createAndroidApkDownloadUrl(meta.objectPath, 900);
    } catch {
      downloadUrl = null;
    }

    return NextResponse.json({
      ok: true,
      data: {
        release: {
          ...meta,
          downloadUrl,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission('settings.write');
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? '').trim();

    if (action === 'prepare') {
      const versionCode = parseVersionCode(body.versionCode);
      const versionName = String(body.versionName ?? '').trim();
      const fileName = String(body.fileName ?? '').trim() || `elmenuxfa-admin-${versionCode}.apk`;
      const fileSize = Number(body.fileSize ?? 0);

      if (versionCode == null) {
        return NextResponse.json({ error: 'versionCode inválido.' }, { status: 400 });
      }
      if (!versionName) {
        return NextResponse.json({ error: 'versionName es obligatorio.' }, { status: 400 });
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 });
      }
      if (fileSize > ANDROID_MAX_APK_BYTES) {
        return NextResponse.json(
          { error: 'El APK supera el máximo de 100 MB.' },
          { status: 413 },
        );
      }
      if (!fileName.toLowerCase().endsWith('.apk')) {
        return NextResponse.json({ error: 'Solo se permiten archivos .apk.' }, { status: 415 });
      }

      const current = await readAndroidReleaseMeta();
      if (current && versionCode <= current.versionCode) {
        return NextResponse.json(
          {
            error: `El versionCode debe ser mayor que el actual (${current.versionCode}).`,
          },
          { status: 409 },
        );
      }

      const objectPath = androidApkObjectPath(versionCode);
      const upload = await createAndroidApkUploadUrl(objectPath);

      return NextResponse.json({
        ok: true,
        data: {
          objectPath,
          uploadUrl: upload.signedUrl,
          token: upload.token,
          maxBytes: ANDROID_MAX_APK_BYTES,
        },
      });
    }

    if (action === 'publish') {
      const versionCode = parseVersionCode(body.versionCode);
      const versionName = String(body.versionName ?? '').trim();
      const notes = String(body.notes ?? '').trim();
      const forceUpdate = body.forceUpdate !== false;
      const objectPath = String(body.objectPath ?? '').trim();
      const fileName = String(body.fileName ?? '').trim() || `elmenuxfa-admin-${versionCode}.apk`;

      if (versionCode == null || !versionName || !objectPath) {
        return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });
      }
      if (objectPath !== androidApkObjectPath(versionCode)) {
        return NextResponse.json({ error: 'Ruta de APK inválida.' }, { status: 400 });
      }

      const existing = await assertAndroidApkExists(objectPath);
      const meta: AndroidReleaseMeta = {
        platform: 'android',
        versionCode,
        versionName,
        forceUpdate,
        notes,
        objectPath,
        fileName,
        fileSize: existing.fileSize,
        uploadedAt: new Date().toISOString(),
        uploadedByEmail: admin.email,
      };

      await writeAndroidReleaseMeta(meta);
      await logAdminAction({
        actorUserId: admin.authUserId,
        actorEmail: admin.email,
        action: 'app_android.release_published',
        entityType: 'app_release',
        entityId: String(versionCode),
        newData: {
          versionName,
          forceUpdate,
          objectPath,
          fileSize: existing.fileSize,
        },
      });

      const downloadUrl = await createAndroidApkDownloadUrl(objectPath, 900);
      return NextResponse.json({
        ok: true,
        data: {
          release: {
            ...meta,
            downloadUrl,
          },
        },
      });
    }

    return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    if (message.toLowerCase().includes('bucket') || message.includes('app-releases')) {
      return NextResponse.json(
        {
          error:
            'Bucket app-releases no disponible. Ejecuta supabase/sql/app-releases-bucket.sql.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
