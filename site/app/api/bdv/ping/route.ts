import { NextResponse } from 'next/server';

import { rememberBdvNonce } from '../../_lib/bdv-ingest';
import { verifyBdvRequestHmac } from '../../_lib/bdv-hmac';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyBdvRequestHmac(request.headers, rawBody);
  if (verified.ok === false) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const nonce = await rememberBdvNonce(verified.nonce);
  if (!nonce.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    service: 'elmenuxfa',
    device: verified.deviceId,
  });
}
