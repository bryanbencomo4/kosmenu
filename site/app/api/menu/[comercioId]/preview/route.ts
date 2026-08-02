import { NextResponse } from 'next/server';

import { getUserFromBearerRequest } from '../../../_lib/supabase-user-auth';
import {
  loadPublicMenuByIdentifier,
  toPublicMenuResponseBody,
} from '../../_lib/load-public-menu';

type Params = {
  params: Promise<{ comercioId: string }>;
};

/**
 * Owner-only menu preview. Same DTO as the public menu, but skips en_linea /
 * email-verified gates so onboarding can show the real Next.js UI before publish.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const user = await getUserFromBearerRequest(request);
    if (!user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized.', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    const { comercioId: rawComercioId } = await params;
    const comercioId = decodeURIComponent(rawComercioId ?? '').trim();
    if (!comercioId) {
      return NextResponse.json({ error: 'Invalid comercioId.' }, { status: 400 });
    }

    const menu = await loadPublicMenuByIdentifier(comercioId);
    if (!menu) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    if (!menu.ownerId || menu.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden.', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    return NextResponse.json(toPublicMenuResponseBody(menu), { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load menu preview.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
