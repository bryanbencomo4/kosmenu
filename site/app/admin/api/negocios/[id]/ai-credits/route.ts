import { NextResponse } from 'next/server';
import { z } from 'zod';

import { logAdminAction } from '../../../../_lib/admin-audit';
import { requireAdminPermission } from '../../../../_lib/admin-auth';
import { adminGrantAiCredits } from '../../../../_lib/admin-business-ops';
import { getAdminBusinessDetail } from '../../../../_lib/admin-businesses';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z.object({
  amount: z.number().int().min(1).max(10_000),
  reason: z.string().trim().max(120).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const admin = await requireAdminPermission('ai_credits.write');
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

    const result = await adminGrantAiCredits({
      businessId: id,
      amount: payload.amount,
      reason: payload.reason,
    });

    const after = await getAdminBusinessDetail(id);

    await logAdminAction({
      action: 'admin.negocios.ai_credits.grant',
      actorUserId: admin.authUserId,
      actorEmail: admin.email,
      entityType: 'comercio',
      entityId: id,
      oldData: { balance: before.aiCredits.balance },
      newData: { balance: after?.aiCredits.balance ?? result.balance },
      metadata: {
        slug: before.slug,
        amount: result.amount,
        reason: result.reason,
      },
      requestHeaders: request.headers,
    });

    return NextResponse.json({ ok: true, data: after, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudieron recargar creditos.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
