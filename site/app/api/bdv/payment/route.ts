import { NextResponse } from 'next/server';

import { logBdvIngestOutcome, logBdvPaymentEvent } from '../../_lib/bdv-events';
import { ingestBdvPayment, rememberBdvNonce } from '../../_lib/bdv-ingest';
import { verifyBdvRequestHmac } from '../../_lib/bdv-hmac';

export const dynamic = 'force-dynamic';

function readPaymentId(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { payment_id?: unknown }).payment_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyBdvRequestHmac(request.headers, rawBody);
  if (verified.ok === false) {
    await logBdvPaymentEvent({
      eventType: 'hmac_rejected',
      payload: { status: verified.status },
      error: verified.error,
    });
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const nonce = await rememberBdvNonce(verified.nonce);
  if (!nonce.ok) {
    await logBdvPaymentEvent({
      eventType: 'hmac_rejected',
      payload: { reason: 'replayed_nonce', device_id: verified.deviceId },
      error: 'Unauthorized',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await logBdvPaymentEvent({
      eventType: 'error',
      payload: { device_id: verified.deviceId },
      error: 'Invalid JSON',
    });
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const paymentId = readPaymentId(payload);
  await logBdvPaymentEvent({
    eventType: 'hmac_validated',
    paymentId,
    payload: { device_id: verified.deviceId, nonce: verified.nonce },
  });

  try {
    const result = await ingestBdvPayment(payload, { deviceId: verified.deviceId });
    await logBdvIngestOutcome(result);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process payment.';
    await logBdvPaymentEvent({
      eventType: message === 'INVALID_PAYLOAD' ? 'error' : 'activation_failed',
      paymentId,
      error: message,
    });
    if (message === 'INVALID_PAYLOAD') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
