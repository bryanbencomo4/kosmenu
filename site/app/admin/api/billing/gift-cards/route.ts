import { NextResponse } from 'next/server';
import { z } from 'zod';

import { canManageBillingCatalog } from '../../../_lib/admin-billing';
import { logAdminAction } from '../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

const issueSchema = z.object({
  count: z.number().int().min(1).max(50),
  months: z.number().int().min(1).max(24),
  batch_label: z.string().trim().max(80).optional(),
  note: z.string().trim().max(240).optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

const voidSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(240).optional(),
});

export async function GET() {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageBillingCatalog(admin.role)) {
    return NextResponse.json({ error: 'No puedes ver las tarjetas de regalo.' }, { status: 403 });
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('gift_cards')
    .select(
      'id, code_hint, months, status, batch_label, note, expires_at, redeemed_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(120);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageBillingCatalog(admin.role)) {
    return NextResponse.json({ error: 'No puedes emitir tarjetas de regalo.' }, { status: 403 });
  }

  let payload: z.infer<typeof issueSchema>;
  try {
    payload = issueSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.rpc('issue_gift_cards', {
    p_count: payload.count,
    p_months: payload.months,
    p_batch_label: payload.batch_label ?? null,
    p_expires_at: payload.expires_at ?? null,
    p_note: payload.note ?? null,
    p_plan_code: 'menu_monthly',
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const cards = Array.isArray((data as { cards?: unknown })?.cards)
    ? ((data as { cards: Array<{ id: string; code: string }> }).cards)
    : [];
  const ids = cards.map((card) => card.id).filter(Boolean);
  if (ids.length > 0) {
    await supabase.from('gift_cards').update({ created_by: admin.authUserId }).in('id', ids);
  }

  await logAdminAction({
    action: 'admin.gift_cards.issue',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'gift_cards',
    newData: { count: payload.count, months: payload.months, batch: payload.batch_label },
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data: cards });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageBillingCatalog(admin.role)) {
    return NextResponse.json({ error: 'No puedes anular tarjetas de regalo.' }, { status: 403 });
  }

  let payload: z.infer<typeof voidSchema>;
  try {
    payload = voidSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.rpc('void_gift_card', {
    p_gift_card_id: payload.id,
    p_note: payload.note ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAdminAction({
    action: 'admin.gift_cards.void',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'gift_cards',
    entityId: payload.id,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true });
}
