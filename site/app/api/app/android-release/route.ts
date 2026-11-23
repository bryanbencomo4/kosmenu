import { NextResponse } from 'next/server';

import {
  createAndroidApkDownloadUrl,
  readAndroidReleaseMeta,
} from '../../../admin/_lib/admin-app-android';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public endpoint used by the merchant Android app to detect forced updates. */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`android-release:check:${ip}`, 60, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const meta = await readAndroidReleaseMeta();
    if (!meta) {
      return NextResponse.json({
        ok: true,
        data: {
          updateRequired: false,
          release: null,
        },
      });
    }

    const downloadUrl = await createAndroidApkDownloadUrl(meta.objectPath, 3600);

    return NextResponse.json({
      ok: true,
      data: {
        updateRequired: Boolean(meta.forceUpdate),
        release: {
          platform: meta.platform,
          versionCode: meta.versionCode,
          versionName: meta.versionName,
          forceUpdate: meta.forceUpdate,
          notes: meta.notes,
          fileName: meta.fileName,
          fileSize: meta.fileSize,
          uploadedAt: meta.uploadedAt,
          downloadUrl,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[android-release] check failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  }
}
