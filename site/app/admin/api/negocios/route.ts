import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../_lib/admin-audit';
import { requireAdminPermission } from '../../_lib/admin-auth';
import { listAdminBusinesses, updateAdminBusiness } from '../../_lib/admin-businesses';

export const dynamic = 'force-dynamic';

const updateSchema = z
  .object({
    id: z.string().uuid(),
    promovido: z.boolean().optional(),
    mostrar_en_directorio_publico: z.boolean().optional(),
    en_linea: z.boolean().optional(),
  })
  .refine(
    (value) =>
      typeof value.promovido === 'boolean' ||
      typeof value.mostrar_en_directorio_publico === 'boolean' ||
      typeof value.en_linea === 'boolean',
    { message: 'Indica al menos un campo para actualizar.' },
  );

export async function GET(request: Request) {
  const admin = await requireAdminPermission('businesses.read');

  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
    const businesses = await listAdminBusinesses({ query, limit: 500 });

    await logAdminAction({
      action: 'admin.negocios.read',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      metadata: { count: businesses.length, query: query || null },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: businesses });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No se pudieron cargar los negocios.',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission('businesses.write');

  let payload: z.infer<typeof updateSchema>;
  try {
    payload = updateSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const updated = await updateAdminBusiness(payload.id, {
      promovido: payload.promovido,
      mostrar_en_directorio_publico: payload.mostrar_en_directorio_publico,
      en_linea: payload.en_linea,
    });

    await logAdminAction({
      action: 'admin.negocios.update',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'comercio',
      entityId: updated.id,
      newData: {
        promovido: updated.promovido,
        mostrar_en_directorio_publico: updated.mostrar_en_directorio_publico,
        en_linea: updated.en_linea,
      },
      metadata: {
        nombre: updated.nombre,
        slug: updated.slug,
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo actualizar el negocio.';
    const status = message.includes('no encontrado') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
