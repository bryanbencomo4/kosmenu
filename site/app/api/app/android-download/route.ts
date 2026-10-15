import { NextResponse } from 'next/server';

import {
  createAndroidApkDownloadUrl,
  readAndroidReleaseMeta,
} from '../../../admin/_lib/admin-app-android';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Stable public link that redirects to a fresh signed APK URL. */
export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`android-download:${ip}`, 30, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const meta = await readAndroidReleaseMeta();
    if (!meta) {
      return NextResponse.json(
        { error: 'No hay una versión Android publicada todavía.' },
        { status: 404 },
      );
    }

    const downloadUrl = await createAndroidApkDownloadUrl(meta.objectPath, 600);
    return NextResponse.redirect(downloadUrl, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[android-download] failed');
    return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
  }
}
