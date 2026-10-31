import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../_lib/admin-auth';
import {
  getAdminBusinessDetail,
  updateAdminBusiness,
} from '../../../_lib/admin-businesses';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    promovido: z.boolean().optional(),
    mostrar_en_directorio_publico: z.boolean().optional(),
    en_linea: z.boolean().optional(),
    permite_delivery: z.boolean().optional(),
    recibe_pedidos_whatsapp: z.boolean().optional(),
    nombre: z.string().trim().min(2).max(120).optional(),
    categoria: z.string().trim().max(80).nullable().optional(),
    direccion: z.string().trim().max(240).nullable().optional(),
    whatsapp: z.string().trim().max(40).nullable().optional(),
    moneda: z.enum(['USD', 'COP', 'VES']).nullable().optional(),
    exchange_rate_value: z.number().positive().max(1_000_000).nullable().optional(),
    tasa_cambio_pesos: z.number().positive().max(1_000_000).nullable().optional(),
  })
  .refine(
    (value) =>
      Object.values(value).some((entry) => entry !== undefined),
    { message: 'Indica al menos un campo para actualizar.' },
  );

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminPermission('businesses.read');
  const { id } = await context.params;

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de negocio invalido.' }, { status: 400 });
  }

  try {
    const detail = await getAdminBusinessDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
    }

    await logAdminAction({
      action: 'admin.negocios.detail.read',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'comercio',
      entityId: detail.id,
      metadata: { slug: detail.slug },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: detail });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No se pudo cargar el negocio.',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireAdminPermission('businesses.write');
  const { id } = await context.params;

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de negocio invalido.' }, { status: 400 });
  }

  let payload: z.infer<typeof patchSchema>;
  try {
    payload = patchSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const before = await getAdminBusinessDetail(id);
    if (!before) {
      return NextResponse.json({ error: 'Negocio no encontrado.' }, { status: 404 });
    }

    const updated = await updateAdminBusiness(id, payload);
    const after = await getAdminBusinessDetail(id);

    await logAdminAction({
      action: 'admin.negocios.profile.update',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'comercio',
      entityId: updated.id,
      oldData: {
        nombre: before.nombre,
        categoria: before.categoria,
        direccion: before.direccion,
        whatsapp: before.whatsapp,
        moneda: before.moneda,
        en_linea: before.en_linea,
        mostrar_en_directorio_publico: before.mostrar_en_directorio_publico,
        promovido: before.promovido,
        permite_delivery: before.permiteDelivery,
        recibe_pedidos_whatsapp: before.recibePedidosWhatsapp,
        exchange_rate_value: before.exchangeRateValue,
        tasa_cambio_pesos: before.tasaCambioPesos,
      },
      newData: after
        ? {
            nombre: after.nombre,
            categoria: after.categoria,
            direccion: after.direccion,
            whatsapp: after.whatsapp,
            moneda: after.moneda,
            en_linea: after.en_linea,
            mostrar_en_directorio_publico: after.mostrar_en_directorio_publico,
            promovido: after.promovido,
            permite_delivery: after.permiteDelivery,
            recibe_pedidos_whatsapp: after.recibePedidosWhatsapp,
            exchange_rate_value: after.exchangeRateValue,
            tasa_cambio_pesos: after.tasaCambioPesos,
          }
        : updated,
      metadata: {
        slug: updated.slug,
        fields: Object.keys(payload),
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: after ?? updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo actualizar el negocio.';
    const status = message.includes('no encontrado') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
