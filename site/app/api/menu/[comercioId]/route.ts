import { NextResponse } from 'next/server';

import { CircuitOpenError } from '../../_lib/supabase-circuit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import {
  isOwnerEmailVerified,
  loadPublicMenuByIdentifier,
  toPublicMenuResponseBody,
} from '../_lib/load-public-menu';

export const runtime = 'edge';
export const maxDuration = 8;

type Params = {
  params: Promise<{ comercioId: string }>;
};

const MENU_UNAVAILABLE =
  'Estamos actualizando el menú. Intenta nuevamente en unos segundos.';

export async function GET(_: Request, { params }: Params) {
  try {
    const { comercioId: rawComercioId } = await params;
    const comercioId = decodeURIComponent(rawComercioId ?? '').trim();

    if (!comercioId) {
      return NextResponse.json({ error: 'Invalid comercioId.' }, { status: 400 });
    }

    const menu = await loadPublicMenuByIdentifier(comercioId);
    if (!menu) {
      return NextResponse.json({ error: 'Comercio not found.' }, { status: 404 });
    }

    if (!menu.isOnline) {
      return NextResponse.json(
        {
          error: 'El menu esta temporalmente en mantenimiento.',
          code: 'MENU_DRAFT_MODE',
        },
        { status: 403 },
      );
    }

    if (menu.ownerId) {
      try {
        const supabase = getServiceSupabaseClient();
        const ownerVerified = await isOwnerEmailVerified(supabase, menu.ownerId);
        if (!ownerVerified) {
          return NextResponse.json(
            {
              error: 'La cuenta propietaria aun no confirma su correo.',
              code: 'OWNER_EMAIL_NOT_VERIFIED',
            },
            { status: 403 },
          );
        }
      } catch {
        // If admin auth is not available, keep serving the menu to avoid false blocks.
      }
    }

    return NextResponse.json(toPublicMenuResponseBody(menu), {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      return NextResponse.json(
        { error: MENU_UNAVAILABLE, code: 'MENU_UNAVAILABLE' },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to load menu.';
    const unavailable = /timeout|aborted|fetch failed/i.test(message);
    return NextResponse.json(
      { error: unavailable ? MENU_UNAVAILABLE : message, code: unavailable ? 'MENU_UNAVAILABLE' : undefined },
      { status: unavailable ? 503 : 500 },
    );
  }
}
