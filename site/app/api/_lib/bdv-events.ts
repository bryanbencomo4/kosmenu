import 'server-only';

import { randomUUID } from 'crypto';

import type { BdvIngestResult } from './bdv-ingest';
import { getServiceSupabaseClient } from './supabase-server';

export const BDV_EVENT_PROVIDER = 'bdv_pago_movil';

export type BdvEventType =
  | 'hmac_validated'
  | 'hmac_rejected'
  | 'payment_received'
  | 'matching_found'
  | 'matching_missed'
  | 'activation_completed'
  | 'activation_failed'
  | 'admin_reprocess'
  | 'admin_assign'
  | 'admin_reject'
  | 'error';

export async function logBdvPaymentEvent(input: {
  eventType: BdvEventType;
  paymentId?: string | null;
  paymentRowId?: string | null;
  payload?: Record<string, unknown>;
  error?: string | null;
  processed?: boolean;
}) {
  try {
    const client = getServiceSupabaseClient();
    const paymentId = input.paymentId?.trim() || 'unknown';
    const { error } = await client.from('payment_events').insert({
      provider: BDV_EVENT_PROVIDER,
      provider_event_id: `${paymentId}:${input.eventType}:${randomUUID()}`,
      event_type: input.eventType,
      payload: {
        payment_id: input.paymentId ?? null,
        payment_row_id: input.paymentRowId ?? null,
        ...(input.payload ?? {}),
      },
      processed: input.processed ?? !input.error,
      processed_at: new Date().toISOString(),
      processing_error: input.error ?? null,
    });
    if (error) {
      console.error('bdv payment event insert error', error);
    }
  } catch (error) {
    console.error('bdv payment event log failed', error);
  }
}

export async function logBdvIngestOutcome(result: BdvIngestResult) {
  await logBdvPaymentEvent({
    eventType: 'payment_received',
    paymentId: result.payment_id,
    payload: { status: result.status, idempotent: result.idempotent ?? false },
  });

  if (result.match_reason) {
    await logBdvPaymentEvent({
      eventType: 'matching_found',
      paymentId: result.payment_id,
      payload: {
        reason: result.match_reason,
        business_id: result.matched_business_id ?? null,
      },
    });
  } else if (result.status === 'RECEIVED' && !result.idempotent) {
    await logBdvPaymentEvent({
      eventType: 'matching_missed',
      paymentId: result.payment_id,
    });
  }

  if (result.status === 'CONFIRMED' && !result.idempotent) {
    await logBdvPaymentEvent({
      eventType: 'activation_completed',
      paymentId: result.payment_id,
      payload: { business_id: result.matched_business_id ?? null },
    });
  }
}
