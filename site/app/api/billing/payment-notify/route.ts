import { NextResponse } from 'next/server';
import { z } from 'zod';

import { appCorsPreflight, withAppCors } from '../../_lib/app-cors';
import { notifyBillingPaymentStatus } from '../../_lib/notify-billing-payment';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import { getUserFromBearerRequest } from '../../_lib/supabase-user-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  kind: z.enum(['received']).default('received'),
});

export async function OPTIONS(request: Request) {
  return appCorsPreflight(request, {
    methods: 'POST, OPTIONS',
    headers: 'authorization, content-type, accept',
  });
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearerRequest(request);
    if (!user) {
      return withAppCors(
        request,
        NextResponse.json({ error: 'No autenticado.' }, { status: 401 }),
      );
    }

    let payload: z.infer<typeof bodySchema>;
    try {
      payload = bodySchema.parse(await request.json());
    } catch {
      return withAppCors(
        request,
        NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 }),
      );
    }

    const admin = getServiceSupabaseClient();
    const { data: submission, error } = await admin
      .from('payment_submissions')
      .select('id, user_id, status')
      .eq('id', payload.submissionId)
      .maybeSingle();

    if (error || !submission) {
      return withAppCors(
        request,
        NextResponse.json({ error: 'Solicitud no encontrada.' }, { status: 404 }),
      );
    }
    if (submission.user_id !== user.id) {
      return withAppCors(
        request,
        NextResponse.json({ error: 'No autorizado.' }, { status: 403 }),
      );
    }
    if (submission.status !== 'pending') {
      return withAppCors(
        request,
        NextResponse.json({ ok: true, skipped: true, reason: 'not-pending' }),
      );
    }

    const result = await notifyBillingPaymentStatus({
      supabase: admin,
      submissionId: payload.submissionId,
      kind: 'received',
    });

    return withAppCors(request, NextResponse.json({ ok: true, email: result }));
  } catch (err) {
    console.error('[payment-notify]', err);
    return withAppCors(
      request,
      NextResponse.json({ error: 'No se pudo notificar.' }, { status: 500 }),
    );
  }
}
