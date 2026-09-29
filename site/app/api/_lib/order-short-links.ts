import { randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

const SHORT_CODE_LENGTH = 10;
const MAX_CREATE_ATTEMPTS = 4;

export type OrderShortLink = {
  code: string;
  pedido_id: string;
  order_id: string;
  comercio_id: string;
  tracking_token_hash: string;
};

function generateCode() {
  return randomBytes(8).toString('base64url').slice(0, SHORT_CODE_LENGTH);
}

export async function createOrderShortLink(input: {
  supabase: SupabaseClient;
  pedidoId: string;
  orderId: string;
  comercioId: string;
  trackingTokenHash: string;
}) {
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt += 1) {
    const code = generateCode();
    const { data, error } = await input.supabase
      .from('order_short_links')
      .insert({
        code,
        pedido_id: input.pedidoId,
        order_id: input.orderId,
        comercio_id: input.comercioId,
        tracking_token_hash: input.trackingTokenHash,
      })
      .select('code,pedido_id,order_id,comercio_id,tracking_token_hash')
      .maybeSingle();

    if (!error && data) {
      return data as OrderShortLink;
    }

    if ((error as { code?: string } | null)?.code !== '23505') {
      throw new Error(error?.message ?? 'Unable to create order short link.');
    }
  }

  throw new Error('Unable to allocate a unique order short link.');
}

export async function findOrderShortLink(
  supabase: SupabaseClient,
  code: string,
) {
  const normalizedCode = code.trim();
  if (!/^[A-Za-z0-9_-]{10}$/.test(normalizedCode)) return null;

  const { data, error } = await supabase
    .from('order_short_links')
    .select('code,pedido_id,order_id,comercio_id,tracking_token_hash')
    .eq('code', normalizedCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as OrderShortLink | null) ?? null;
}

export async function findOrderShortLinkByPedidoId(
  supabase: SupabaseClient,
  pedidoId: string,
) {
  const id = pedidoId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('order_short_links')
    .select('code,pedido_id,order_id,comercio_id,tracking_token_hash')
    .eq('pedido_id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as OrderShortLink | null) ?? null;
}

/** Public shareable URL — never includes ?t= bearer tokens. */
export function publicOrderShortUrl(code: string, origin: string) {
  const base = origin.replace(/\/$/, '');
  return `${base}/o/${encodeURIComponent(code.trim())}`;
}

export function extractOrderShortCodeFromUrl(rawUrl: string): string {
  const raw = rawUrl.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://elmenuxfa.com');
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length === 2 &&
      segments[0] === 'o' &&
      /^[A-Za-z0-9_-]{10}$/.test(segments[1] ?? '')
    ) {
      return segments[1] ?? '';
    }
  } catch {
    // Ignore malformed URLs.
  }
  return '';
}
