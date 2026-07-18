import { NextResponse } from 'next/server';

import { COMPROBANTE_MAX_BYTES } from '../../_lib/comprobante-upload';
import { uploadComprobanteObject } from '../../_lib/comprobante-storage';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';

/**
 * Server-side comprobante upload (service role).
 * Returns an opaque storage ref — never a permanent public URL.
 * Bucket must be private in production (see proposed-storage-comprobantes-policies.sql).
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`comprobantes:upload:${ip}`, 20, 60_000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const form = await request.formData();
    const comercioId = String(form.get('comercioId') ?? '').trim();
    const file = form.get('file');

    if (!comercioId || !(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    if (file.size > COMPROBANTE_MAX_BYTES) {
      return NextResponse.json({ error: 'File too large.' }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const uploaded = await uploadComprobanteObject({
      comercioId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
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
          // Compatibility field for checkout until clients stop expecting public URLs.
          paymentProofUrl: uploaded.storageRef,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')) {
      console.error('[comprobantes] privileged client unavailable');
      return NextResponse.json({ error: 'Unavailable.' }, { status: 503 });
    }
    console.error('[comprobantes] upload request failed');
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
