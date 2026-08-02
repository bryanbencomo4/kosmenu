import { NextResponse } from 'next/server';

import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import {
  isOwnerEmailVerified,
  loadPublicMenuByIdentifier,
  toPublicMenuResponseBody,
} from '../_lib/load-public-menu';

type Params = {
  params: Promise<{ comercioId: string }>;
};

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

    return NextResponse.json(toPublicMenuResponseBody(menu), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load menu.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
