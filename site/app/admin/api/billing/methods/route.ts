import { NextResponse } from 'next/server';
import { z } from 'zod';

import { canManageBillingCatalog, normalizeAccountFields } from '../../../_lib/admin-billing';
import { logAdminAction } from '../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
  tagline: z.string().trim().max(160).optional(),
  instructions: z.string().trim().max(2000).optional(),
  review_sla_minutes: z.number().int().min(5).max(10080).optional(),
  brand_color: z
    .string()
    .trim()
    .regex(/^#?[0-9A-Fa-f]{6}$/, 'Color invalido.')
    .optional()
    .nullable(),
  logo_url: z.string().url().optional().nullable().or(z.literal('')),
  account_fields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(160),
        copyable: z.boolean().optional(),
      }),
    )
    .max(12)
    .optional(),
});

export async function GET() {
  await requireAdminPermission('subscriptions.read');
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select(
      'id, code, name, tagline, verification, kind, is_active, sort_order, country_code, local_currency, logo_url, brand_color, instructions, account_fields, requires_reference, requires_receipt, requires_advisor_code, review_sla_minutes, updated_at',
    )
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageBillingCatalog(admin.role)) {
    return NextResponse.json({ error: 'No puedes editar el catalogo de pagos.' }, { status: 403 });
  }

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;
  if (payload.tagline !== undefined) updates.tagline = payload.tagline;
  if (payload.instructions !== undefined) updates.instructions = payload.instructions;
  if (payload.review_sla_minutes !== undefined) updates.review_sla_minutes = payload.review_sla_minutes;
  if (payload.brand_color !== undefined) {
    updates.brand_color = payload.brand_color
      ? payload.brand_color.startsWith('#')
        ? payload.brand_color
        : `#${payload.brand_color}`
      : null;
  }
  if (payload.logo_url !== undefined) {
    updates.logo_url = payload.logo_url ? payload.logo_url : null;
  }
  if (payload.account_fields !== undefined) {
    updates.account_fields = normalizeAccountFields(payload.account_fields);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para guardar.' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('id', payload.id)
    .maybeSingle();

  if (currentError || !current) {
    return NextResponse.json({ error: currentError?.message ?? 'Metodo no encontrado.' }, { status: current ? 500 : 404 });
  }

  const { data, error } = await supabase
    .from('payment_methods')
    .update(updates)
    .eq('id', payload.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo guardar el metodo.' }, { status: 500 });
  }

  await logAdminAction({
    action: 'admin.payment_methods.update',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'payment_methods',
    entityId: data.id,
    oldData: current,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}
