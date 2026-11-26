import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { appCorsPreflight, withAppCors } from '../../_lib/app-cors';
import { ensureImageVariants } from '../../_lib/image-variants';
import { getUserFromBearerRequest } from '../../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import { isBusinessAssistantApiEnabled } from '../../../_lib/business-assistant';
import { resolveMembership } from '../_lib/auth';
import { canManageCatalog, denied } from '../_lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  methods: 'POST, OPTIONS',
  headers: 'authorization, content-type, accept',
};

const BUCKET = 'product-images';

export async function OPTIONS(req: Request) {
  return appCorsPreflight(req, CORS);
}

function json(req: Request, data: unknown, status = 200) {
  return withAppCors(req, NextResponse.json(data, { status }), CORS);
}

/**
 * Upload product image to the same bucket Flutter uses (`product-images`).
 * Path: `{comercioId}/product_{ts}_{rand}.jpg`
 */
export async function POST(req: Request) {
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const allow =
    isBusinessAssistantApiEnabled() ||
    (process.env.NODE_ENV || '') === 'test' ||
    vercelEnv === 'preview' ||
    vercelEnv === '';
  if (!allow) return json(req, { ok: false, error: 'disabled' }, 403);

  const user = await getUserFromBearerRequest(req);
  if (!user) return json(req, { ok: false, error: 'unauthorized' }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { ok: false, error: 'invalid_form' }, 400);
  }

  const comercioId = String(form.get('comercioId') || '').trim();
  const file = form.get('file');
  if (!comercioId || !(file instanceof File)) {
    return json(req, { ok: false, error: 'missing_file_or_comercio' }, 400);
  }

  const membership = await resolveMembership(user.id, comercioId);
  const shop = membership.selected;
  if (!shop || shop.comercioId !== comercioId) {
    return json(req, { ok: false, error: 'forbidden_shop' }, 403);
  }
  if (!canManageCatalog(shop)) {
    return json(req, { ok: false, error: 'forbidden_role', text: denied('subir fotos', shop) }, 403);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 32 || bytes.length > 8_000_000) {
    return json(req, { ok: false, error: 'file_size' }, 400);
  }
  const contentType = file.type || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    return json(req, { ok: false, error: 'not_image' }, 400);
  }

  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${comercioId}/product_${Date.now()}_${randomBytes(4).toString('hex')}.${ext}`;
  const sb = getServiceSupabaseClient();
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (upErr) return json(req, { ok: false, error: upErr.message }, 500);

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) return json(req, { ok: false, error: 'public_url_missing' }, 500);

  // Same as Flutter ProductImageVariantsClient.ensureInBackground — non-blocking.
  let variants: { ok: boolean; generated?: string[]; error?: string } | null = null;
  try {
    const result = await ensureImageVariants({ imageUrl: publicUrl });
    variants =
      result.ok === true
        ? { ok: true, generated: result.generated }
        : { ok: false, error: result.error };
  } catch (err) {
    variants = {
      ok: false,
      error: err instanceof Error ? err.message : 'variants_failed',
    };
  }

  // AI generation (generate-product-images-ai) stays on product attach when
  // the merchant asks for it — requires edge function + credits; not auto-fired on upload.

  return json(req, {
    ok: true,
    imageUrl: publicUrl,
    path,
    bucket: BUCKET,
    variants,
  });
}
