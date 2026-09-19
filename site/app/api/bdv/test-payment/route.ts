import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logBdvIngestOutcome, logBdvPaymentEvent } from '../../_lib/bdv-events';
import { ingestBdvPayment, rememberBdvNonce } from '../../_lib/bdv-ingest';
import { verifyBdvRequestHmac } from '../../_lib/bdv-hmac';

export const dynamic = 'force-dynamic';

const testSchema = z.object({
  amount: z.number().nonnegative(),
  reference: z.string().trim().min(4).max(64),
  sender_phone: z.string().trim().max(32).optional(),
  sender_name: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifyBdvRequestHmac(request.headers, rawBody);
  if (verified.ok === false) {
    await logBdvPaymentEvent({
      eventType: 'hmac_rejected',
      payload: { status: verified.status, source: 'test-payment' },
      error: verified.error,
    });
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }

  const nonce = await rememberBdvNonce(verified.nonce);
  if (!nonce.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof testSchema>;
  try {
    parsed = testSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const paymentId = `bdv-test-${randomUUID()}`;
  await logBdvPaymentEvent({
    eventType: 'hmac_validated',
    paymentId,
    payload: { device_id: verified.deviceId || 'BDV-TEST', source: 'test-payment' },
  });

  try {
    const result = await ingestBdvPayment(
      {
        event: 'payment_received',
        payment_id: paymentId,
        amount: parsed.amount,
        currency: 'VES',
        reference: parsed.reference,
        operation_number: null,
        sender_name: parsed.sender_name ?? null,
        sender_phone: parsed.sender_phone ?? null,
        raw_text: `Pago de prueba ElMenúXFA por Bs.${parsed.amount} Ref: ${parsed.reference}`,
        bank_date: null,
        bank_time: null,
        source_package: 'elmenuxfa.test',
      },
      { deviceId: verified.deviceId || 'BDV-TEST' },
    );
    await logBdvIngestOutcome(result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process payment.';
    await logBdvPaymentEvent({
      eventType: 'error',
      paymentId,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
