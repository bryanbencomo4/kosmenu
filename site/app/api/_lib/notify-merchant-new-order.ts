import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  canSendMerchantNewOrderEmail,
  sendMerchantNewOrderEmail,
} from './send-merchant-new-order-email';
import {
  canSendMerchantNewOrderWhatsapp,
  sendMerchantNewOrderWhatsapp,
} from './send-merchant-new-order-whatsapp';

export type NotifyMerchantNewOrderInput = {
  supabase: SupabaseClient;
  comercioId: string;
  pedidoId?: string;
  orderId: string;
  customerName: string;
  totalLabel: string;
  comercioNombreFallback: string;
  appOrderUrl: string;
  skipWhatsapp?: boolean;
};

type MerchantContacts = {
  nombre: string;
  email: string;
  whatsapp: string;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstEmail(...values: unknown[]) {
  for (const value of values) {
    const email = (value ?? '').toString().trim().toLowerCase();
    if (email && emailRegex.test(email)) return email;
  }
  return '';
}

async function loadComercioRow(supabase: SupabaseClient, comercioId: string) {
  const withCorreo = await supabase
    .from('comercios')
    .select('owner_id,nombre,slug,whatsapp,correo')
    .eq('id', comercioId)
    .maybeSingle();

  if (!withCorreo.error) {
    return (withCorreo.data ?? null) as Record<string, unknown> | null;
  }

  const slim = await supabase
    .from('comercios')
    .select('owner_id,nombre,slug,whatsapp')
    .eq('id', comercioId)
    .maybeSingle();

  if (slim.error) {
    throw new Error(slim.error.message);
  }

  return (slim.data ?? null) as Record<string, unknown> | null;
}

function firstPhone(...values: unknown[]) {
  for (const value of values) {
    const phone = (value ?? '').toString().trim();
    if (phone) return phone;
  }
  return '';
}

function ownerPhoneFromAuth(user: {
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined) {
  const metadata = user?.user_metadata ?? {};
  return firstPhone(user?.phone, metadata.whatsapp, metadata.phone, metadata.telefono);
}

export async function resolveMerchantContacts(
  supabase: SupabaseClient,
  comercioId: string,
): Promise<MerchantContacts> {
  const row = await loadComercioRow(supabase, comercioId);
  const ownerId = (row?.owner_id ?? '').toString().trim();
  let ownerEmail = '';
  let ownerWhatsapp = '';

  if (ownerId) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(ownerId);
      if (!error) {
        ownerEmail = firstEmail(data.user?.email);
        ownerWhatsapp = ownerPhoneFromAuth(data.user);
      }
    } catch {
      // Auth lookup is best-effort; fall back to comercio contact fields.
    }
  }

  return {
    nombre: (row?.nombre ?? '').toString().trim(),
    email: firstEmail(ownerEmail, row?.email, row?.correo),
    whatsapp: firstPhone(row?.whatsapp, ownerWhatsapp),
  };
}

async function claimMerchantWhatsappSlot(supabase: SupabaseClient, pedidoId: string) {
  const id = pedidoId.trim();
  if (!id) {
    return true;
  }

  const { error } = await supabase.from('order_notification_dedup').insert({
    pedido_id: id,
    channel: 'whatsapp',
    event_type: 'INSERT',
    status_key: 'merchant-new',
  });

  if (!error) {
    return true;
  }

  if ((error as { code?: string }).code === '23505') {
    return false;
  }

  console.warn('[orders] merchant whatsapp dedup skipped', error.message);
  return true;
}

async function sendMerchantWhatsappOnce(
  input: NotifyMerchantNewOrderInput,
  merchantWhatsapp: string,
  comercioNombre: string,
) {
  const delivered = await sendMerchantNewOrderWhatsapp({
    merchantWhatsapp,
    comercioNombre,
    orderId: input.orderId,
    customerName: input.customerName,
    totalLabel: input.totalLabel,
    appOrderUrl: input.appOrderUrl,
  });

  if (delivered.ok) {
    await claimMerchantWhatsappSlot(input.supabase, input.pedidoId ?? '');
  }

  return delivered;
}

export async function notifyMerchantNewOrder(input: NotifyMerchantNewOrderInput) {
  const contacts = await resolveMerchantContacts(input.supabase, input.comercioId);
  const comercioNombre = contacts.nombre || input.comercioNombreFallback || 'Tu comercio';

  const emailPromise =
    canSendMerchantNewOrderEmail() && contacts.email
      ? sendMerchantNewOrderEmail({
          merchantEmail: contacts.email,
          comercioNombre,
          orderId: input.orderId,
          customerName: input.customerName,
          totalLabel: input.totalLabel,
          appOrderUrl: input.appOrderUrl,
        })
      : Promise.resolve({
          ok: false as const,
          skipped: true as const,
          reason: contacts.email ? 'resend-not-configured' : 'merchant-email-missing',
        });

  const whatsappPromise = input.skipWhatsapp
    ? Promise.resolve({
        ok: true as const,
        skipped: true as const,
        reason: 'merchant-whatsapp-already-sent',
      })
    : canSendMerchantNewOrderWhatsapp() && contacts.whatsapp
      ? sendMerchantWhatsappOnce(input, contacts.whatsapp, comercioNombre)
      : Promise.resolve({
          ok: false as const,
          skipped: true as const,
          reason: contacts.whatsapp ? 'wasender-not-configured' : 'merchant-whatsapp-missing',
        });

  const [email, whatsapp] = await Promise.allSettled([emailPromise, whatsappPromise]);

  const result = {
    email: email.status === 'fulfilled' ? email.value : { ok: false as const, reason: 'email-rejected' },
    whatsapp:
      whatsapp.status === 'fulfilled'
        ? whatsapp.value
        : { ok: false as const, reason: 'whatsapp-rejected' },
  };

  console.info('[orders] merchant new-order notify', {
    orderId: input.orderId,
    comercioId: input.comercioId,
    email:
      'reason' in result.email
        ? { ok: result.email.ok, reason: result.email.reason }
        : { ok: result.email.ok },
    whatsapp:
      'reason' in result.whatsapp
        ? { ok: result.whatsapp.ok, reason: result.whatsapp.reason }
        : { ok: result.whatsapp.ok, recipient: 'recipient' in result.whatsapp ? result.whatsapp.recipient : undefined },
  });

  return result;
}
