import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../_lib/admin-audit';
import { requireAdminPermission } from '../../_lib/admin-auth';
import { getAdminSupabaseClient } from '../../_lib/admin-supabase';

export const dynamic = 'force-dynamic';

const sectorNameSchema = z
  .string()
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres.')
  .max(80, 'El nombre no puede superar 80 caracteres.');

const createSectorSchema = z.object({
  nombre: sectorNameSchema,
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});

const updateSectorSchema = z.object({
  id: z.string().uuid(),
  nombre: sectorNameSchema.optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});

const deleteSectorSchema = z.object({
  id: z.string().uuid(),
});

type BusinessSectorRow = {
  id: string;
  nombre: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function normalizeSectorName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

async function listSectors() {
  const supabase = getAdminSupabaseClient();

  const { data, error } = await supabase
    .from('sectores_negocio')
    .select('id, nombre, sort_order, is_active, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('nombre', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as BusinessSectorRow[];
}

export async function GET(request: Request) {
  const admin = await requireAdminPermission('settings.read');

  try {
    const sectors = await listSectors();

    await logAdminAction({
      action: 'admin.sectores.read',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      metadata: { count: sectors.length },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: sectors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron cargar los sectores.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission('settings.write');

  let payload: z.infer<typeof createSectorSchema>;

  try {
    payload = createSectorSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const nombre = normalizeSectorName(payload.nombre);
  const supabase = getAdminSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from('sectores_negocio')
    .select('id, nombre')
    .ilike('nombre', nombre)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(
      { error: `Ya existe un sector llamado "${existing.nombre}".` },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from('sectores_negocio')
    .insert({
      nombre,
      sort_order: payload.sort_order ?? 0,
      is_active: payload.is_active ?? true,
    })
    .select('id, nombre, sort_order, is_active, created_at, updated_at')
    .single<BusinessSectorRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'No se pudo crear el sector.' },
      { status: 500 },
    );
  }

  await logAdminAction({
    action: 'admin.sectores.create',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'sectores_negocio',
    entityId: data.id,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission('settings.write');

  let payload: z.infer<typeof updateSectorSchema>;

  try {
    payload = updateSectorSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (payload.nombre !== undefined) {
    updates.nombre = normalizeSectorName(payload.nombre);
  }
  if (payload.sort_order !== undefined) {
    updates.sort_order = payload.sort_order;
  }
  if (payload.is_active !== undefined) {
    updates.is_active = payload.is_active;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay cambios para guardar.' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();

  const { data: current, error: currentError } = await supabase
    .from('sectores_negocio')
    .select('id, nombre, sort_order, is_active, created_at, updated_at')
    .eq('id', payload.id)
    .maybeSingle<BusinessSectorRow>();

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  if (!current) {
    return NextResponse.json({ error: 'Sector no encontrado.' }, { status: 404 });
  }

  if (typeof updates.nombre === 'string') {
    const { data: duplicate, error: duplicateError } = await supabase
      .from('sectores_negocio')
      .select('id, nombre')
      .ilike('nombre', updates.nombre)
      .neq('id', payload.id)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    }

    if (duplicate) {
      return NextResponse.json(
        { error: `Ya existe otro sector llamado "${duplicate.nombre}".` },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabase
    .from('sectores_negocio')
    .update(updates)
    .eq('id', payload.id)
    .select('id, nombre, sort_order, is_active, created_at, updated_at')
    .single<BusinessSectorRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'No se pudo actualizar el sector.' },
      { status: 500 },
    );
  }

  await logAdminAction({
    action: 'admin.sectores.update',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'sectores_negocio',
    entityId: data.id,
    oldData: current,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(request: Request) {
  const admin = await requireAdminPermission('settings.write');

  let payload: z.infer<typeof deleteSectorSchema>;

  try {
    payload = deleteSectorSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();

  const { data: current, error: currentError } = await supabase
    .from('sectores_negocio')
    .select('id, nombre, sort_order, is_active, created_at, updated_at')
    .eq('id', payload.id)
    .maybeSingle<BusinessSectorRow>();

  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }

  if (!current) {
    return NextResponse.json({ error: 'Sector no encontrado.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('sectores_negocio')
    .update({ is_active: false })
    .eq('id', payload.id)
    .select('id, nombre, sort_order, is_active, created_at, updated_at')
    .single<BusinessSectorRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'No se pudo desactivar el sector.' },
      { status: 500 },
    );
  }

  await logAdminAction({
    action: 'admin.sectores.deactivate',
    actorUserId: admin.authUserId,
    actorEmail: admin.email,
    entityType: 'sectores_negocio',
    entityId: data.id,
    oldData: current,
    newData: data,
    requestHeaders: request.headers,
  });

  return NextResponse.json({ ok: true, data });
}
