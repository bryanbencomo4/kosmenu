import { NextResponse } from 'next/server';
import { z } from 'zod';

import { newsletterSource } from '../../_lib/public-site-config';
import { getServerSupabaseClient } from '../_lib/supabase-server';

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
  source: z.string().trim().min(1).max(80).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Envía un correo válido para suscribirte.' },
      { status: 400 },
    );
  }

  const parsedRequest = requestSchema.safeParse(payload);

  if (!parsedRequest.success) {
    return NextResponse.json(
      { message: 'Envía un correo válido para suscribirte.' },
      { status: 400 },
    );
  }

  const email = parsedRequest.data.email.trim().toLowerCase();
  const source = parsedRequest.data.source?.trim() || newsletterSource;
  const supabase = getServerSupabaseClient();

  const { error } = await supabase.rpc('subscribe_consumer_newsletter', {
    p_email: email,
    p_source: source,
    p_metadata: {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      userAgent: request.headers.get('user-agent'),
    },
  });

  if (error) {
    console.error('newsletter subscription error', error);

    return NextResponse.json(
      { message: 'No pudimos registrar tu correo en este momento.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    message: 'Listo. Te avisaremos cuando haya promociones y novedades cerca de ti.',
  });
}