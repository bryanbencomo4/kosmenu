import { NextResponse } from 'next/server';

import { appSiteUrl } from '../../../_lib/public-site-config';
import {
  comercioIdFromObjectPath,
  ensureImageVariants,
  parseVariantsSecret,
  userCanManageComercio,
} from '../../_lib/image-variants';
import { parsePublicStorageUrl } from '../../../_lib/optimize-storage-image';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getUserFromBearerRequest } from '../../_lib/supabase-user-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function corsHeaders(request: Request): HeadersInit {
  const origin = (request.headers.get('origin') ?? '').trim();
  const allowed = new Set([
    appSiteUrl,
    'https://app.elmenuxfa.com',
    'http://localhost:5000',
    'http://localhost:8080',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:8080',
  ]);
  if (!origin || !allowed.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-image-variants-secret',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * Ensure cold WebP/AVIF variants exist for a public Storage image.
 * Auth: merchant Bearer (owns path comercio) OR IMAGE_VARIANTS_SECRET / CRON_SECRET.
 * Public lazy ensure also allowed (strict rate limit) so menus can self-heal on 404.
 */
export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const ip = getClientIp(request);

  let body: { imageUrl?: string; force?: boolean; lazy?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400, headers });
  }

  const imageUrl = (body.imageUrl ?? '').trim();
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required.' }, { status: 400, headers });
  }

  const parsed = parsePublicStorageUrl(imageUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'Unsupported image URL.' }, { status: 400, headers });
  }

  const secretOk = parseVariantsSecret(request);
  const user = secretOk ? null : await getUserFromBearerRequest(request);
  const lazyPublic = Boolean(body.lazy) && !secretOk && !user;

  if (lazyPublic) {
    const limit = consumeRateLimit(`images:variants:lazy:${ip}`, 12, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) } },
      );
    }
  } else if (!secretOk) {
    const limit = consumeRateLimit(`images:variants:${ip}`, 30, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) } },
      );
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
    }
    const comercioId = comercioIdFromObjectPath(parsed.objectPath);
    if (!comercioId || !(await userCanManageComercio(user.id, comercioId))) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers });
    }
  }

  try {
    const result = await ensureImageVariants({
      imageUrl,
      force: Boolean(body.force) && secretOk,
    });
    if (result.ok === false) {
      return NextResponse.json({ error: result.error }, { status: 422, headers });
    }
    return NextResponse.json({ ok: true, data: result }, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503, headers });
    }
    console.error('[images/variants] failed');
    return NextResponse.json({ error: 'Variant generation failed.' }, { status: 500, headers });
  }
}
