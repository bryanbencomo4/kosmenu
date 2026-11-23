import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../../_lib/admin-audit';
import {
  requireAdminAnyPermission,
  requireAdminPermission,
} from '../../../_lib/admin-auth';
import { setAdminOrderArchived } from '../../../_lib/admin-ops';
import { getAdminOrderDetail } from '../../../_lib/admin-orders';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  archived: z.boolean(),
});

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireAdminPermission('orders.read');
  const { id } = await context.params;

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de pedido invalido.' }, { status: 400 });
  }

  try {
    const detail = await getAdminOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }

    await logAdminAction({
      action: 'admin.pedidos.detail.read',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'pedido',
      entityId: detail.id,
      metadata: {
        comercioId: detail.comercioId,
        code: detail.code,
        currency: detail.currency,
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: detail });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No se pudo cargar el pedido.',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  // Soft-archive only — never hard-deletes. Mirrors merchant archived_at semantics.
  const admin = await requireAdminAnyPermission([
    'orders.write',
    'businesses.write',
  ]);
  const { id } = await context.params;

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de pedido invalido.' }, { status: 400 });
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
    const result = await setAdminOrderArchived(id, payload.archived);
    const detail = await getAdminOrderDetail(id);

    await logAdminAction({
      action: payload.archived ? 'admin.pedidos.archive' : 'admin.pedidos.restore',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'pedido',
      entityId: id,
      oldData: {
        archived_at: result.before.archived_at ?? null,
        estado: result.before.estado ?? null,
      },
      newData: {
        archived_at: result.after.archived_at ?? null,
        estado: result.after.estado ?? null,
      },
      metadata: {
        comercioId: result.after.comercio_id ?? null,
        customer: result.after.nombre_cliente ?? null,
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({
      ok: true,
      data: detail ?? {
        id: result.after.id,
        isArchived: Boolean(result.after.archived_at),
        archivedAt: result.after.archived_at ?? null,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo archivar el pedido.';
    const status = message.includes('no encontrado') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
