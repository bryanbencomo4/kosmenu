import { getServiceSupabaseClient } from './supabase-server';
import {
  hashOrderIdempotencyPayload,
  normalizeIdempotencyKey,
} from './order-idempotency-key';

export type IdempotencyLookup =
  | { status: 'miss' }
  | { status: 'hit'; response: Record<string, unknown> }
  | { status: 'conflict' }
  | { status: 'invalid_key' };

export { hashOrderIdempotencyPayload, normalizeIdempotencyKey };

export async function lookupOrderIdempotency(input: {
  key: string;
  requestHash: string;
}): Promise<IdempotencyLookup> {
  const key = normalizeIdempotencyKey(input.key);
  if (!key) return { status: 'invalid_key' };

  try {
    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from('order_idempotency_keys')
      .select('request_hash,response_json')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      // Table may not exist yet in Preview — treat as miss so checkout still works.
      if ((error.message ?? '').toLowerCase().includes('order_idempotency_keys')) {
        return { status: 'miss' };
      }
      console.error('[orders] idempotency lookup failed');
      return { status: 'miss' };
    }

    if (!data) return { status: 'miss' };

    if ((data.request_hash ?? '') !== input.requestHash) {
      return { status: 'conflict' };
    }

    const response =
      data.response_json && typeof data.response_json === 'object'
        ? (data.response_json as Record<string, unknown>)
        : {};
    return { status: 'hit', response };
  } catch {
    return { status: 'miss' };
  }
}

export async function storeOrderIdempotency(input: {
  key: string;
  requestHash: string;
  orderId: string;
  response: Record<string, unknown>;
}): Promise<void> {
  const key = normalizeIdempotencyKey(input.key);
  if (!key) return;

  try {
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase.from('order_idempotency_keys').upsert(
      {
        idempotency_key: key,
        request_hash: input.requestHash,
        order_id: input.orderId,
        response_json: input.response,
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

    if (error && !(error.message ?? '').toLowerCase().includes('order_idempotency_keys')) {
      console.error('[orders] idempotency store failed');
    }
  } catch {
    // Non-fatal: order already created.
  }
}
