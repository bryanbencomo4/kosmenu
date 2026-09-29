import { createHash, timingSafeEqual } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { OrderShortLink } from './order-short-links';

export const COURIER_ORDER_COOKIE = 'elmenuxfa_courier';
/** Short-lived so busy couriers never approach the browser's per-domain cookie cap. */
export const COURIER_ORDER_COOKIE_MAX_AGE_SEC = 60 * 60 * 48;

const COURIER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,160}$/;
const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{10}$/;
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;
const ACTIVE_COURIER_STATUSES = new Set(['accepted', 'arrived']);
const LOOKUP_FAILED = '__lookup_failed__';

export type ShortLinkAudience =
  | { target: 'courier'; token: string }
  | { target: 'customer'; clearCourierCookie?: boolean };

function sha256Hex(value: string) {
  return createHash('sha256').update(value.trim(), 'utf8').digest('hex');
}

function hashesMatch(provided: string, expected: string) {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function customerOrderCookieName(shortCode: string) {
  return `elmenuxfa_order_${shortCode}`;
}

/**
 * Path-scoped to a single `/o/{code}` link so couriers who deliver many orders
 * never grow the Cookie header sent to the rest of the site.
 */
export function courierOrderCookie(shortCode: string, token: string) {
  const code = shortCode.trim();
  const value = token.trim();
  if (!SHORT_CODE_PATTERN.test(code) || !COURIER_TOKEN_PATTERN.test(value)) {
    return null;
  }

  return {
    name: COURIER_ORDER_COOKIE,
    value,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: `/o/${code}`,
    maxAge: COURIER_ORDER_COOKIE_MAX_AGE_SEC,
  };
}

export function expiredCourierOrderCookie(shortCode: string) {
  return {
    name: COURIER_ORDER_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: `/o/${shortCode.trim()}`,
    maxAge: 0,
  };
}

async function loadCourierInvitationStatus(
  supabase: SupabaseClient,
  pedidoId: string,
  token: string,
) {
  const tokenHashes = [sha256Hex(token)];
  const legacyHash = token.toLowerCase();
  if (HEX_64_PATTERN.test(legacyHash)) {
    tokenHashes.push(legacyHash);
  }

  const { data, error } = await supabase
    .from('delivery_invitations')
    .select('status')
    .in('token_hash', tokenHashes)
    .eq('pedido_id', pedidoId)
    .limit(1)
    .maybeSingle();

  if (error) return LOOKUP_FAILED;
  if (!data) return '';
  return (data.status ?? '').toString().trim().toLowerCase();
}

async function customerCookieMatches(
  supabase: SupabaseClient,
  pedidoId: string,
  customerToken: string,
) {
  const token = customerToken.trim();
  if (!token) return false;

  const { data, error } = await supabase
    .from('pedidos')
    .select('detalles')
    .eq('id', pedidoId)
    .maybeSingle();

  if (error || !data) return false;
  const detalles =
    data.detalles && typeof data.detalles === 'object'
      ? (data.detalles as Record<string, unknown>)
      : {};
  const expected = (detalles.customer_access_token_hash ?? '').toString().trim().toLowerCase();
  if (!HEX_64_PATTERN.test(expected)) return false;
  return hashesMatch(sha256Hex(token), expected);
}

/**
 * Decides who opened a `/o/{code}` link. Any lookup failure falls back to the
 * customer view, which is protected by its own cookie/email gate.
 */
export async function resolveShortLinkAudience(input: {
  supabase: SupabaseClient;
  shortLink: Pick<OrderShortLink, 'pedido_id'>;
  courierToken?: string | null;
  customerToken?: string | null;
}): Promise<ShortLinkAudience> {
  const courierToken = (input.courierToken ?? '').trim();
  const pedidoId = (input.shortLink.pedido_id ?? '').toString().trim();
  if (!courierToken) {
    return { target: 'customer' };
  }
  if (!pedidoId || !COURIER_TOKEN_PATTERN.test(courierToken)) {
    return { target: 'customer', clearCourierCookie: true };
  }

  let status: string;
  try {
    status = await loadCourierInvitationStatus(input.supabase, pedidoId, courierToken);
  } catch {
    // Transient failure: keep the cookie, but never block the customer link.
    return { target: 'customer' };
  }

  try {
    if (ACTIVE_COURIER_STATUSES.has(status)) {
      return { target: 'courier', token: courierToken };
    }

    if (status === 'completed') {
      const isCustomer = await customerCookieMatches(
        input.supabase,
        pedidoId,
        input.customerToken ?? '',
      );
      return isCustomer ? { target: 'customer' } : { target: 'courier', token: courierToken };
    }
  } catch {
    return { target: 'customer' };
  }

  return { target: 'customer', clearCourierCookie: status !== LOOKUP_FAILED };
}
