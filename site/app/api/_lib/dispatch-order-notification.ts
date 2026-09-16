import 'server-only';

export type OrderNotificationEventType = 'INSERT' | 'UPDATE';

export type OrderNotificationPayload = {
  type: OrderNotificationEventType;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

export type DispatchOrderNotificationResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status?: number;
  body?: unknown;
};

function resolveNotifyOrderUrl(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!supabaseUrl) {
    return null;
  }

  return `${supabaseUrl}/functions/v1/notify-order`;
}

/**
 * Primary notification dispatch: invokes the notify-order edge function with
 * service-role credentials. Used after order insert and status changes so we
 * do not rely solely on the pg_net database trigger.
 */
export async function dispatchOrderNotification(
  payload: OrderNotificationPayload,
): Promise<DispatchOrderNotificationResult> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = resolveNotifyOrderUrl();

  if (!url || !serviceKey) {
    return { ok: false, skipped: true, reason: 'notify-order-config-missing' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        type: payload.type,
        table: 'pedidos',
        schema: 'public',
        record: payload.record,
        old_record: payload.old_record ?? null,
      }),
    });

    const rawBody = await response.text();
    let body: unknown = rawBody;

    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = rawBody;
    }

    if (!response.ok) {
      console.error('[dispatch-order-notification] notify-order failed', {
        status: response.status,
        type: payload.type,
        orderId: extractOrderCode(payload.record),
      });
      return {
        ok: false,
        status: response.status,
        body,
        reason: 'notify-order-http-error',
      };
    }

    return { ok: true, status: response.status, body };
  } catch (error) {
    console.error('[dispatch-order-notification] request error', {
      type: payload.type,
      orderId: extractOrderCode(payload.record),
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { ok: false, reason: 'notify-order-network-error' };
  }
}

export function extractOrderCode(record: Record<string, unknown>): string {
  const detalles =
    record.detalles && typeof record.detalles === 'object'
      ? (record.detalles as Record<string, unknown>)
      : null;
  const fromDetalles = (detalles?.order_id ?? detalles?.codigo_orden ?? '').toString().trim();
  if (fromDetalles) {
    return fromDetalles;
  }

  return (record.id ?? '').toString().trim();
}
