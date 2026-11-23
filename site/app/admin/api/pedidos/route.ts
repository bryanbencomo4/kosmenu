import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../_lib/admin-audit';
import {
  requireAdminAnyPermission,
  requireAdminPermission,
} from '../../_lib/admin-auth';
import {
  listAdminOrders,
  setAdminOrdersArchivedBulk,
} from '../../_lib/admin-orders';

export const dynamic = 'force-dynamic';

const bulkArchiveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  archived: z.boolean(),
});

export async function GET(request: Request) {
  const admin = await requireAdminPermission('orders.read');
  const url = new URL(request.url);

  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const businessIdRaw = (url.searchParams.get('businessId') ?? '').trim();
  const status = (url.searchParams.get('status') ?? 'all').trim().toLowerCase();
  const archivedRaw = (url.searchParams.get('archived') ?? 'active').trim().toLowerCase();
  const archived =
    archivedRaw === 'archived' || archivedRaw === 'all' || archivedRaw === 'active'
      ? archivedRaw
      : 'active';
  const from = (url.searchParams.get('from') ?? '').trim().slice(0, 40);
  const to = (url.searchParams.get('to') ?? '').trim().slice(0, 40);
  const limit = Number(url.searchParams.get('limit') ?? 80);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const businessId =
    businessIdRaw && z.string().uuid().safeParse(businessIdRaw).success
      ? businessIdRaw
      : undefined;

  try {
    const result = await listAdminOrders({
      query,
      businessId,
      status,
      archived,
      from: from || undefined,
      to: to || undefined,
      limit: Number.isFinite(limit) ? limit : 80,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    await logAdminAction({
      action: 'admin.pedidos.read',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      metadata: {
        count: result.orders.length,
        total: result.total,
        query: query || null,
        businessId: businessId ?? null,
        status,
        archived,
        from: from || null,
        to: to || null,
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'No se pudieron cargar los pedidos.',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  // Soft-archive / restore in bulk — never hard-deletes.
  const admin = await requireAdminAnyPermission([
    'orders.write',
    'businesses.write',
  ]);

  let payload: z.infer<typeof bulkArchiveSchema>;
  try {
    payload = bulkArchiveSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? 'Datos invalidos.'
        : 'Datos invalidos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await setAdminOrdersArchivedBulk(payload.ids, payload.archived);

    await logAdminAction({
      action: payload.archived
        ? 'admin.pedidos.archive_bulk'
        : 'admin.pedidos.restore_bulk',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'pedido',
      metadata: {
        requested: payload.ids.length,
        updated: result.updatedIds.length,
        skipped: result.skipped,
        ids: result.updatedIds.slice(0, 50),
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({
      ok: true,
      data: {
        updated: result.updatedIds.length,
        skipped: result.skipped,
        ids: result.updatedIds,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudieron actualizar los pedidos.',
      },
      { status: 500 },
    );
  }
}
