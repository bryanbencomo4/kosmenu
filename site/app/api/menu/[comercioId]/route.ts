import { NextResponse } from 'next/server';

import {
  appCorsPreflight,
  withAppCors,
} from '../../_lib/app-cors';
import { userCanOperateComercio } from '../../_lib/comercio-staff-access';
import { CircuitOpenError } from '../../_lib/supabase-circuit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import { getUserFromBearerRequest } from '../../_lib/supabase-user-auth';
import {
  isOwnerEmailVerified,
  loadPublicMenuByIdentifier,
  toPublicMenuResponseBody,
} from '../_lib/load-public-menu';

export const maxDuration = 8;

type Params = {
  params: Promise<{ comercioId: string }>;
};

const MENU_UNAVAILABLE =
  'Estamos actualizando el menú. Intenta nuevamente en unos segundos.';

const MENU_CORS = {
  methods: 'GET, OPTIONS',
  headers: 'authorization, content-type, accept',
} as const;

function json(
  request: Request,
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  return withAppCors(request, NextResponse.json(body, init), MENU_CORS);
}

export async function OPTIONS(request: Request) {
  return appCorsPreflight(request, MENU_CORS);
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { comercioId: rawComercioId } = await params;
    const comercioId = decodeURIComponent(rawComercioId ?? '').trim();

    if (!comercioId) {
      return json(request, { error: 'Invalid comercioId.' }, { status: 400 });
    }

    const menu = await loadPublicMenuByIdentifier(comercioId);
    if (!menu) {
      return json(request, { error: 'Comercio not found.' }, { status: 404 });
    }

    const user = await getUserFromBearerRequest(request);
    const staffAccess =
      user?.id != null
        ? await userCanOperateComercio(user.id, menu.resolvedComercioId)
        : false;

    if (!menu.isOnline && !staffAccess) {
      return json(
        request,
        {
          error: 'El menu esta temporalmente en mantenimiento.',
          code: 'MENU_DRAFT_MODE',
        },
        { status: 403 },
      );
    }

    if (menu.ownerId && !staffAccess) {
      try {
        const supabase = getServiceSupabaseClient();
        const ownerVerified = await isOwnerEmailVerified(supabase, menu.ownerId);
        if (!ownerVerified) {
          return json(
            request,
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

    return json(request, toPublicMenuResponseBody(menu), {
      status: 200,
      headers: {
        'Cache-Control': staffAccess
          ? 'private, no-store'
          : 'public, s-maxage=5, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      return json(
        request,
        { error: MENU_UNAVAILABLE, code: 'MENU_UNAVAILABLE' },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to load menu.';
    const unavailable = /timeout|aborted|fetch failed/i.test(message);
    return json(
      request,
      {
        error: unavailable ? MENU_UNAVAILABLE : message,
        code: unavailable ? 'MENU_UNAVAILABLE' : undefined,
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
