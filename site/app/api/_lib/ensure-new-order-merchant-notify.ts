import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  dispatchOrderNotification,
  merchantWhatsappDelivered,
} from './dispatch-order-notification';
import { notifyMerchantNewOrder } from './notify-merchant-new-order';
import { merchantPanelOrderHref } from '../../_lib/public-site-config';

export type EnsureNewOrderMerchantNotifyInput = {
  supabase: SupabaseClient;
  record?: Record<string, unknown> | null;
  comercioId: string;
  orderId: string;
  customerName: string;
  totalLabel: string;
  comercioNombreFallback: string;
  appOrderUrl?: string;
};

function totalLabelFromRecord(record: Record<string, unknown>, fallback: string) {
  const detalles =
    record.detalles && typeof record.detalles === 'object'
      ? (record.detalles as Record<string, unknown>)
      : {};
  const currency = (detalles.moneda_checkout ?? '').toString().trim().toUpperCase();
  const totalRaw = detalles.total_moneda_checkout ?? detalles.total ?? record.total;
  const total = typeof totalRaw === 'number' ? totalRaw : Number(totalRaw);
  if (!Number.isFinite(total)) {
    return fallback;
  }
  const symbol = currency === 'USD' ? 'US$' : currency === 'VES' ? 'Bs.' : currency || '';
  return `${symbol} ${total.toFixed(2)}`.trim();
}

async function loadPedidoRecord(
  supabase: SupabaseClient,
  comercioId: string,
  orderId: string,
) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .eq('comercio_id', comercioId)
    .eq('detalles->>order_id', orderId)
    .maybeSingle();

  if (error) {
    console.error('[orders] merchant notify pedido lookup failed', {
      orderId,
      message: error.message,
    });
    return null;
  }

  return (data ?? null) as Record<string, unknown> | null;
}

export async function ensureNewOrderMerchantNotify(input: EnsureNewOrderMerchantNotifyInput) {
  try {
    const record =
      input.record ?? (await loadPedidoRecord(input.supabase, input.comercioId, input.orderId));

    if (!record) {
      console.error('[orders] merchant notify skipped, pedido missing', {
        orderId: input.orderId,
        comercioId: input.comercioId,
      });
      return { delivered: false as const, reason: 'pedido-missing' };
    }

    const pedidoId = (record.id ?? '').toString().trim();
    const dispatchResult = await dispatchOrderNotification({
      type: 'INSERT',
      record,
    });

    if (!dispatchResult.ok) {
      console.error('[orders] notify-order dispatch failed', {
        orderId: input.orderId,
        reason: dispatchResult.reason,
        status: dispatchResult.status,
      });
    }

    const edgeDelivered = merchantWhatsappDelivered(dispatchResult);
    const merchantResult = await notifyMerchantNewOrder({
      supabase: input.supabase,
      comercioId: input.comercioId,
      pedidoId,
      orderId: input.orderId,
      customerName: input.customerName || (record.nombre_cliente ?? '').toString(),
      totalLabel: input.totalLabel || totalLabelFromRecord(record, '—'),
      comercioNombreFallback: input.comercioNombreFallback,
      appOrderUrl: input.appOrderUrl ?? merchantPanelOrderHref(input.orderId),
      skipWhatsapp: edgeDelivered,
    });

    const delivered = edgeDelivered || merchantResult.whatsapp.ok === true;
    if (!delivered) {
      console.error('[orders] merchant WhatsApp was not delivered', {
        orderId: input.orderId,
        dispatch: dispatchResult.body,
        fallback: 'reason' in merchantResult.whatsapp ? merchantResult.whatsapp.reason : undefined,
      });
    }

    return { delivered, dispatchResult, merchantResult };
  } catch (error) {
    console.error('[orders] merchant notify crashed', {
      orderId: input.orderId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { delivered: false as const, reason: 'notify-crashed' };
  }
}
