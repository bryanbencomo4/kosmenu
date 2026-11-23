import { NextResponse } from 'next/server';

import {
  ensureImageVariants,
  listStorageImageUrlsForBackfill,
  parseVariantsSecret,
} from '../../../_lib/image-variants';
import { consumeRateLimit, getClientIp } from '../../../_lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Batch-generate cold variants for existing product/category images.
 * Auth: IMAGE_VARIANTS_SECRET or CRON_SECRET only.
 */
export async function POST(request: Request) {
  if (!parseVariantsSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = consumeRateLimit(`images:variants:backfill:${ip}`, 20, 60_000);
  if (limit.ok === false) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  let body: { limit?: number; offset?: number } = {};
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const pageLimit = Math.min(40, Math.max(1, Number(body.limit) || 20));
  const offset = Math.max(0, Number(body.offset) || 0);

  try {
    const urls = await listStorageImageUrlsForBackfill({ limit: pageLimit, offset });
    const results: Array<{ url: string; ok: boolean; generated?: number; error?: string }> = [];

    for (const url of urls) {
      const ensured = await ensureImageVariants({ imageUrl: url });
      if (ensured.ok === true) {
        results.push({ url, ok: true, generated: ensured.generated.length });
      } else {
        results.push({ url, ok: false, error: ensured.error });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        offset,
        limit: pageLimit,
        count: urls.length,
        generatedTotal: results.reduce((sum, row) => sum + (row.generated ?? 0), 0),
        results,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[images/variants/backfill] failed');
    return NextResponse.json({ error: 'Backfill failed.' }, { status: 500 });
  }
}
