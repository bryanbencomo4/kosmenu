import { NextResponse } from 'next/server';

import {
  appCorsPreflight,
  withAppCors,
} from '../../_lib/app-cors';
import { verifyComprobantePermit } from '../../_lib/comprobante-permit';
import { COMPROBANTE_MAX_BYTES, resolveComprobanteMime } from '../../_lib/comprobante-upload';
import { uploadComprobanteObject } from '../../_lib/comprobante-storage';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';

const CORS = {
  methods: 'POST, OPTIONS',
  headers: 'authorization, content-type, accept, x-comprobante-permit',
} as const;

/**
 * Server-side comprobante upload (service role).
 * Requires a short-lived HMAC permit issued for an online comercio.
 * Returns an opaque storage ref — never a permanent public URL.
 */
export async function OPTIONS(request: Request) {
  return appCorsPreflight(request, CORS);
}

export async function POST(request: Request) {
  return withAppCors(request, await postUpload(request), CORS);
}

async function postUpload(request: Request): Promise<NextResponse> {
  try {
    const ip = getClientIp(request);
    const ipLimit = consumeRateLimit(`comprobantes:upload:${ip}`, 8, 60_000);
    if (ipLimit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } },
      );
    }

    const form = await request.formData();
    const comercioId = String(form.get('comercioId') ?? '').trim();
    const permit = String(form.get('permit') ?? request.headers.get('x-comprobante-permit') ?? '').trim();
    const file = form.get('file');

    if (!comercioId || !permit || !(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const permitCheck = verifyComprobantePermit(permit, comercioId);
    if (permitCheck.ok === false) {
      return NextResponse.json({ error: permitCheck.error }, { status: 403 });
    }

    const comercioLimit = consumeRateLimit(`comprobantes:upload:comercio:${comercioId}`, 6, 60 * 60 * 1000);
    if (comercioLimit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(comercioLimit.retryAfterSec) } },
      );
    }

    if (file.size > COMPROBANTE_MAX_BYTES) {
      return NextResponse.json({ error: 'File too large.' }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    // Camera picks often omit File.type; sniff magic bytes before validating.
    const mimeType = resolveComprobanteMime({ declaredMime: file.type, bytes });
    const uploaded = await uploadComprobanteObject({
      comercioId,
      fileName: file.name,
      mimeType,
      bytes,
    });

    if (uploaded.ok === false) {
      let status = 400;
      if (uploaded.error === 'File too large.') status = 413;
      else if (uploaded.error === 'MIME type not allowed.') status = 415;
      else if (uploaded.error.includes('not allowed')) status = 422;
      return NextResponse.json({ error: uploaded.error }, { status });
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          storageRef: uploaded.storageRef,
          paymentProofUrl: uploaded.storageRef,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable')) {
      console.error('[comprobantes] privileged client unavailable');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[comprobantes] upload request failed');
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
