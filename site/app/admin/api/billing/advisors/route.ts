import { NextResponse } from 'next/server';
import { z } from 'zod';

import { canManageAdvisors } from '../../../_lib/admin-billing';
import { logAdminAction } from '../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  full_name: z.string().trim().min(3).max(80),
  code: z
    .string()
    .trim()
    .min(4)
    .max(16)
    .regex(/^[A-Za-z0-9-]+$/, 'El codigo solo puede tener letras, numeros y guiones.'),
  phone: z.string().trim().max(32).optional(),
  note: z.string().trim().max(240).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().trim().min(3).max(80).optional(),
  phone: z.string().trim().max(32).optional().nullable(),
  note: z.string().trim().max(240).optional().nullable(),
  is_active: z.boolean().optional(),
});

export async function GET() {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageAdvisors(admin.role) && admin.role !== 'finance' && admin.role !== 'support') {
    return NextResponse.json({ error: 'No puedes ver los asesores.' }, { status: 403 });
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('sales_advisors')
    .select('id, full_name, code, phone, is_active, note, created_at')
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageAdvisors(admin.role)) {
    return NextResponse.json({ error: 'No puedes crear asesores.' }, { status: 403 });
  }

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('sales_advisors')
    .insert({
      full_name: payload.full_name,
      code: payload.code.trim().toUpperCase(),
      phone: payload.phone || null,
      note: payload.note || null,
      created_by: admin.authUserId,
    })
    .select('id, full_name, code, phone, is_active, note, created_at')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message?.includes('duplicate') ? 'Ese codigo de asesor ya existe.' : error?.message ?? 'No se pudo crear.' },
      { status: error?.message?.includes('duplicate') ? 409 : 500 },
    );
  }

  await logAdminAction({
    action: 'admin.sales_advisors.create',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'sales_advisors',
    entityId: data.id,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission('subscriptions.read');
  if (!canManageAdvisors(admin.role)) {
    return NextResponse.json({ error: 'No puedes editar asesores.' }, { status: 403 });
  }

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? 'Datos invalidos.' : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (payload.full_name !== undefined) updates.full_name = payload.full_name;
  if (payload.phone !== undefined) updates.phone = payload.phone;
  if (payload.note !== undefined) updates.note = payload.note;
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('sales_advisors')
    .update(updates)
    .eq('id', payload.id)
    .select('id, full_name, code, phone, is_active, note, created_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo actualizar.' }, { status: 500 });
  }

  await logAdminAction({
    action: 'admin.sales_advisors.update',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'sales_advisors',
    entityId: data.id,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}
