import { NextResponse } from 'next/server';

import { appCorsPreflight, withAppCors } from '../_lib/app-cors';
import {
  analyzeImage,
  ASSISTANT_MEDIA_MAX_AUDIO_BYTES,
  ASSISTANT_MEDIA_MAX_IMAGE_BYTES,
  classifyMediaMime,
  isAssistantMediaEnabled,
  transcribeAudio,
  type AssistantMediaAudience,
} from '../_lib/assistant-media';
import { consumeRateLimit, getClientIp } from '../_lib/rate-limit';
import { getUserFromBearerRequest } from '../_lib/supabase-user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

const CORS = {
  methods: 'POST, OPTIONS',
  headers: 'authorization, content-type, accept',
};

export async function OPTIONS(req: Request) {
  return appCorsPreflight(req, CORS);
}

function json(req: Request, data: unknown, status = 200) {
  return withAppCors(req, NextResponse.json(data, { status }), CORS);
}

/**
 * POST /api/assistant-media  (multipart: file, audience=business|discovery)
 *  - audio → { kind:'audio', transcript }
 *  - image → { kind:'image', analysis }
 * Business audience requires a Bearer session; discovery is public but rate-limited.
 */
export async function POST(req: Request) {
  if (!isAssistantMediaEnabled()) return json(req, { ok: false, error: 'disabled' }, 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(req, { ok: false, error: 'invalid_form' }, 400);
  }
  const audience: AssistantMediaAudience =
    String(form.get('audience') || '') === 'business' ? 'business' : 'discovery';

  let limitKey = `assistant-media:ip:${getClientIp(req)}`;
  let limit = 10;
  if (audience === 'business') {
    const user = await getUserFromBearerRequest(req);
    if (!user) return json(req, { ok: false, error: 'unauthorized' }, 401);
    limitKey = `assistant-media:user:${user.id}`;
    limit = 30;
  }
  if (!consumeRateLimit(limitKey, limit, 60_000).ok) {
    return json(req, { ok: false, error: 'rate_limited' }, 429);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return json(req, { ok: false, error: 'missing_file' }, 400);
  const kind = classifyMediaMime(file.type);
  if (!kind) return json(req, { ok: false, error: 'unsupported_type' }, 415);

  const bytes = Buffer.from(await file.arrayBuffer());
  const max = kind === 'audio' ? ASSISTANT_MEDIA_MAX_AUDIO_BYTES : ASSISTANT_MEDIA_MAX_IMAGE_BYTES;
  if (bytes.length < 200 || bytes.length > max) {
    return json(req, { ok: false, error: 'file_size' }, 413);
  }

  if (kind === 'audio') {
    const transcript = await transcribeAudio({ bytes, mime: file.type });
    if (!transcript) return json(req, { ok: false, error: 'not_understood' }, 200);
    return json(req, { ok: true, kind: 'audio', transcript });
  }
  const analysis = await analyzeImage({ bytes, mime: file.type, audience });
  if (!analysis) return json(req, { ok: false, error: 'not_understood' }, 200);
  return json(req, { ok: true, kind: 'image', analysis });
}
