import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../../_lib/admin-auth';
import {
  adminGrantMembershipPeriod,
  adminSetMembershipPeriodEnd,
  adminSetMembershipStatus,
} from '../../../../_lib/admin-business-ops';
import { getAdminBusinessDetail } from '../../../../_lib/admin-businesses';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('renew'),
    planCode: z.string().trim().min(1).max(80),
    months: z.number().int().min(1).max(24),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({
    action: z.literal('set_period_end'),
    periodEnd: z.string().trim().min(8).max(40),
    reactivate: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('set_status'),
    status: z.enum(['active', 'suspended', 'cancelled']),
    takeOffline: z.boolean().optional(),
  }),
]);

export async function POST(request: Request, context: RouteContext) {
  const admin = await requireAdminPermission('subscriptions.write');
  const { id } = await context.params;

  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID de negocio invalido.' }, { status: 400 });
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
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

    let result: Record<string, unknown>;
    if (payload.action === 'renew') {
      result = await adminGrantMembershipPeriod({
        businessId: id,
        planCode: payload.planCode,
        months: payload.months,
        note: payload.note,
      });
    } else if (payload.action === 'set_period_end') {
      result = await adminSetMembershipPeriodEnd({
        businessId: id,
        periodEndIso: payload.periodEnd,
        reactivate: payload.reactivate,
      });
    } else {
      result = await adminSetMembershipStatus({
        businessId: id,
        status: payload.status,
        takeOffline: payload.takeOffline,
      });
    }

    const after = await getAdminBusinessDetail(id);

    await logAdminAction({
      action: `admin.negocios.membership.${payload.action}`,
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'comercio',
      entityId: id,
      oldData: before.subscription,
      newData: after?.subscription ?? null,
      metadata: {
        slug: before.slug,
        action: payload.action,
        result,
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: after, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo actualizar la membresia.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
