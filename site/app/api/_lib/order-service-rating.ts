import type { getServiceSupabaseClient } from './supabase-server';

export type OrderServiceRatingSummary = {
  average: number;
  count: number;
};

function normalizeCustomerPhone(value: unknown) {
  let digits = (value ?? '').toString().replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^0?4\d{9}$/.test(digits)) return `58${digits.replace(/^0/, '')}`;
  if (/^3\d{9}$/.test(digits)) return `57${digits}`;
  return digits;
}

export async function createCustomerRatingKey(phone: unknown): Promise<string | null> {
  const digits = normalizeCustomerPhone(phone);
  if (digits.length < 10 || digits.length > 15) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;

  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(serviceKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`order-service-rating:v1:${digits}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isRateableOrderStatus(value: unknown, deliveryStatus?: unknown): boolean {
  const status = (value ?? '').toString().trim().toLowerCase();
  const normalizedDeliveryStatus = (deliveryStatus ?? '').toString().trim().toLowerCase();
  return (
    status === 'entregado' ||
    status === 'cancelado' ||
    status === 'rechazado' ||
    status === 'anulado' ||
    normalizedDeliveryStatus === 'completed'
  );
}

export function normalizeRatingSummary(value: unknown): OrderServiceRatingSummary {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const average = Number(raw.average ?? raw.comercio_average ?? raw.customer_average ?? 0);
  const count = Number(raw.count ?? raw.comercio_count ?? raw.customer_count ?? 0);
  return {
    average: Number.isFinite(average) ? Math.max(0, Math.min(5, average)) : 0,
    count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
  };
}

export async function loadOrderServiceRatingSummary(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  comercioId: string,
  customerKey: string | null = null,
) {
  if (!comercioId) {
    return {
      comercio: { average: 0, count: 0 },
      customer: { average: 0, count: 0 },
    };
  }

  try {
    const { data, error } = await supabase.rpc('get_order_service_rating_summary', {
      p_comercio_id: comercioId,
      p_customer_key: customerKey,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const result = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      comercio: normalizeRatingSummary({
        average: result.comercio_average,
        count: result.comercio_count,
      }),
      customer: normalizeRatingSummary({
        average: result.customer_average,
        count: result.customer_count,
      }),
    };
  } catch {
    return {
      comercio: { average: 0, count: 0 },
      customer: { average: 0, count: 0 },
    };
  }
}