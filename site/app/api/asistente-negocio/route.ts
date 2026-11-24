import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { WaHandoffPayload } from '../_lib/wa-handoff';
import { resolveWaHandoffStore } from '../_lib/wa-handoff-store';
import { appCorsPreflight, withAppCors } from '../_lib/app-cors';
import { getUserFromBearerRequest } from '../_lib/supabase-user-auth';
import { getServiceSupabaseClient } from '../_lib/supabase-server';
import { isBusinessAssistantApiEnabled } from '../../_lib/business-assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  methods: 'POST, OPTIONS',
  headers: 'authorization, content-type, accept',
};

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2000) }))
    .max(40)
    .optional(),
  handoffCode: z.string().trim().max(64).optional(),
  /** peek | consume — consume only after user engages */
  handoffAction: z.enum(['peek', 'consume']).optional(),
  comercioId: z.string().trim().max(64).optional(),
});

function getHandoffStore() {
  return resolveWaHandoffStore();
}

export async function OPTIONS(req: Request) {
  return appCorsPreflight(req, CORS);
}

async function resolveMembership(userId: string, preferredComercioId?: string | null) {
  const sb = getServiceSupabaseClient();
  const { data: owned } = await sb
    .from('comercios')
    .select('id,nombre,slug,moneda,tasa_cambio_pesos')
    .eq('owner_id', userId)
    .limit(20);
  const { data: memberRows } = await sb
    .from('comercio_members')
    .select('comercio_id,role,status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(20);

  const byId = new Map<
    string,
    { comercioId: string; nombre: string; slug: string | null; role: string; moneda: string | null; tasa: string | null }
  >();
  for (const row of owned || []) {
    byId.set(String(row.id), {
      comercioId: String(row.id),
      nombre: String(row.nombre || 'Negocio'),
      slug: row.slug ? String(row.slug) : null,
      role: 'owner',
      moneda: row.moneda ? String(row.moneda) : null,
      tasa: row.tasa_cambio_pesos != null ? String(row.tasa_cambio_pesos) : null,
    });
  }
  for (const m of memberRows || []) {
    const id = String(m.comercio_id);
    if (byId.has(id)) continue;
    const { data: c } = await sb
      .from('comercios')
      .select('id,nombre,slug,moneda,tasa_cambio_pesos')
      .eq('id', id)
      .maybeSingle();
    if (!c) continue;
    byId.set(id, {
      comercioId: id,
      nombre: String(c.nombre || 'Negocio'),
      slug: c.slug ? String(c.slug) : null,
      role: String(m.role || 'member'),
      moneda: c.moneda ? String(c.moneda) : null,
      tasa: c.tasa_cambio_pesos != null ? String(c.tasa_cambio_pesos) : null,
    });
  }
  const list = [...byId.values()];
  const preferred = preferredComercioId
    ? list.find((c) => c.comercioId === preferredComercioId) || null
    : list.length === 1
      ? list[0]
      : null;
  return { list, selected: preferred };
}

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function greeting(payload: WaHandoffPayload | null, authenticated: boolean): string {
  if (payload?.pendingOperation === 'edit_price' || payload?.intent?.includes('edit_price')) {
    const hint = payload.conversationHint || 'el cambio de precio';
    if (!authenticated) {
      return `¡Hola! 😊 Vamos a revisar: ${hint}.\n\nPrimero inicia sesión en tu cuenta de elmenuxfa.com para continuar de forma segura. Tu solicitud ya está preparada.`;
    }
    return `¡Hola! 😊 Continuamos con: ${hint}.\n\nPuedo consultar el menú y preparar la modificación. Para aplicarla te llevaré al formulario del panel con confirmación.`;
  }
  if (payload?.pendingOperation === 'register_business') {
    const name = payload.businessNameDraft ? ` *${payload.businessNameDraft}*` : '';
    return `¡Excelente! 🙌 Continuamos el registro${name}.\n\nPuedo orientarte aquí; la creación de cuenta se completa con autenticación en el panel.`;
  }
  if (payload?.conversationHint) {
    return `¡Hola! 😊 Retomamos: ${payload.conversationHint}.`;
  }
  return '¡Hola! 😊 Soy el asistente para negocios de elmenuxfa.com. ¿Consultamos tu menú, precios o te ayudo a registrar un negocio?';
}

/**
 * POST /api/asistente-negocio — conversational business assistant backend.
 * Flag: BUSINESS_ASSISTANT_ENABLED=1
 */
function json(req: Request, data: unknown, status = 200) {
  return withAppCors(req, NextResponse.json(data, { status }), CORS);
}

export async function POST(req: Request) {
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const allow =
    isBusinessAssistantApiEnabled() ||
    (process.env.NODE_ENV || '') === 'test' ||
    vercelEnv === 'preview' ||
    vercelEnv === '';
  if (!allow) {
    return json(req, { ok: false, error: 'disabled' }, 403);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json(req, { ok: false, error: 'invalid_body' }, 400);
  }

  const user = await getUserFromBearerRequest(req);
  const authenticated = Boolean(user);

  let payload: WaHandoffPayload | null = null;
  let handoffError: string | null = null;
  if (body.handoffCode) {
    const store = getHandoffStore();
    const action = body.handoffAction === 'consume' ? 'consume' : 'peek';
    const result =
      action === 'consume'
        ? await store.redeem({
            code: body.handoffCode,
            destination: 'business_assistant',
          })
        : await store.validate({
            code: body.handoffCode,
            destination: 'business_assistant',
          });
    if (result.ok === false) handoffError = result.error;
    else payload = result.record.payload;
  }

  const membership = user
    ? await resolveMembership(user.id, body.comercioId || payload?.candidateComercioId)
    : { list: [], selected: null };

  const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  const isBoot = !lastUser;

  if (isBoot) {
    return json(req, {
      ok: true,
      authenticated,
      handoffError,
      payload,
      membership: membership.list.map((c) => ({
        comercioId: c.comercioId,
        nombre: c.nombre,
        role: c.role,
      })),
      selectedComercioId: membership.selected?.comercioId ?? null,
      text: handoffError
        ? handoffError === 'expired'
          ? 'Este enlace venció (TTL). No quedó atrapado: escribe de nuevo por WhatsApp y te enviaremos un acceso nuevo. Mientras tanto puedes iniciar sesión y consultar tu menú aquí.'
          : handoffError === 'consumed'
            ? 'Este enlace ya fue usado. Si necesitas continuar, escribe de nuevo por WhatsApp para un acceso nuevo.'
            : 'No pude validar el acceso de WhatsApp. No hay una solicitud preparada. Puedes iniciar sesión o pedir un enlace nuevo.'
        : greeting(payload, authenticated),
      needsAuth: !authenticated && Boolean(payload?.pendingOperation?.startsWith('edit') || payload?.intent?.includes('admin')),
      handoffValid: Boolean(payload) && !handoffError,
      recoveryHint: handoffError === 'expired' || handoffError === 'consumed',
      panelUrl: 'https://app.elmenuxfa.com/',
      registerUrl: 'https://app.elmenuxfa.com/?tab=register',
    });
  }

  if (!authenticated) {
    return json(req, {
      ok: true,
      authenticated: false,
      payload,
      handoffValid: Boolean(payload) && !handoffError,
      text: handoffError
        ? 'Inicia sesión para consultar tu negocio. El enlace de WhatsApp ya no es válido; pide uno nuevo si necesitas retomar esa solicitud.'
        : 'Para consultar tu menú o preparar cambios necesito que inicies sesión en elmenuxfa.com. Tu solicitud de WhatsApp se conserva en este enlace hasta que expire.',
      needsAuth: true,
      panelUrl: 'https://app.elmenuxfa.com/',
      registerUrl: 'https://app.elmenuxfa.com/?tab=register',
    });
  }

  if (!membership.selected && membership.list.length > 1) {
    const list = membership.list.map((c) => `• ${c.nombre}`).join('\n');
    return json(req, {
      ok: true,
      authenticated: true,
      payload,
      membership: membership.list,
      text: `Tienes acceso a varios negocios:\n${list}\n\nDime cuál quieres usar.`,
      needsComercioSelect: true,
    });
  }

  if (!membership.selected) {
    return json(req, {
      ok: true,
      authenticated: true,
      payload,
      text:
        'No encontré un negocio vinculado a esta cuenta. Si quieres registrar uno, continúa aquí:\nhttps://app.elmenuxfa.com/?tab=register',
      registerUrl: 'https://app.elmenuxfa.com/?tab=register',
    });
  }

  const shop = membership.selected;
  const sb = getServiceSupabaseClient();
  const t = fold(lastUser!.text);

  // Read products
  if (/\b(productos|menu|menú|carta|precios|pizza|margarita)\b/.test(t) || payload?.pendingOperation === 'edit_price') {
    const { data: products } = await sb
      .from('productos')
      .select('id,nombre,precio,disponible,categoria')
      .eq('comercio_id', shop.comercioId)
      .limit(40);

    const hint = fold(payload?.conversationHint || lastUser!.text);
    const match =
      (products || []).find((p) => fold(String(p.nombre || '')).includes('margarita')) ||
      (products || []).find((p) => hint.includes(fold(String(p.nombre || '')))) ||
      null;

    if (/\b(cambiar|actualizar|modificar|precio)\b/.test(t) || payload?.pendingOperation === 'edit_price') {
      const label = match ? String(match.nombre) : 'el producto';
      const current = match?.precio != null ? String(match.precio) : '—';
      return json(req, {
        ok: true,
        authenticated: true,
        selectedComercioId: shop.comercioId,
        text: [
          `En *${shop.nombre}* ${match ? `*${match.nombre}*` : 'ese producto'} está en ${current}${shop.moneda ? ` ${shop.moneda}` : ''}.`,
          '',
          'Puedo preparar el cambio, pero aplicarlo requiere el formulario del panel (con tu sesión y confirmación).',
          '',
          `Abrir panel: https://app.elmenuxfa.com/`,
          match ? `(Busca ${label} en productos para editar el precio.)` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        proposal: {
          action: 'edit_price',
          productId: match ? String(match.id) : null,
          productName: match ? String(match.nombre) : null,
          currentPrice: current,
          panelUrl: 'https://app.elmenuxfa.com/',
        },
        productsSample: (products || []).slice(0, 8).map((p) => ({
          nombre: p.nombre,
          precio: p.precio,
          disponible: p.disponible,
        })),
      });
    }

    const lines = (products || [])
      .slice(0, 12)
      .map((p) => `• ${p.nombre}: ${p.precio ?? '—'}${p.disponible === false ? ' (agotado)' : ''}`)
      .join('\n');
    return json(req, {
      ok: true,
      authenticated: true,
      selectedComercioId: shop.comercioId,
      text: `Menú de *${shop.nombre}* (lectura):\n${lines || 'Sin productos visibles.'}\n\nMoneda: ${shop.moneda ?? '—'}${shop.tasa ? ` · tasa: ${shop.tasa}` : ''}`,
    });
  }

  if (/\b(tasa|cambio|moneda|dolar|dólar)\b/.test(t)) {
    return json(req, {
      ok: true,
      authenticated: true,
      selectedComercioId: shop.comercioId,
      text: `*${shop.nombre}* — moneda: ${shop.moneda ?? 'no definida'}${shop.tasa ? `, tasa: ${shop.tasa}` : ''}.\n\nPara actualizarla usa el panel (configuración): https://app.elmenuxfa.com/`,
      panelUrl: 'https://app.elmenuxfa.com/',
    });
  }

  if (/\b(registrar|crear cuenta|nuevo negocio)\b/.test(t)) {
    return json(req, {
      ok: true,
      authenticated: true,
      text: 'Para registrar un negocio adicional usa el flujo seguro del panel:\nhttps://app.elmenuxfa.com/?tab=register',
      registerUrl: 'https://app.elmenuxfa.com/?tab=register',
    });
  }

  if (/\b(agregar|añadir|nuevo producto)\b/.test(t)) {
    return json(req, {
      ok: true,
      authenticated: true,
      selectedComercioId: shop.comercioId,
      text: `Puedo ayudarte a preparar un producto para *${shop.nombre}*, pero la creación se confirma en el panel:\nhttps://app.elmenuxfa.com/\n\nDime nombre y precio tentativos si quieres que deje la nota lista.`,
      panelUrl: 'https://app.elmenuxfa.com/',
    });
  }

  return json(req, {
    ok: true,
    authenticated: true,
    selectedComercioId: shop.comercioId,
    text: `Estoy con *${shop.nombre}*. Puedo consultar productos, precios, moneda/tasa, o prepararte un cambio para confirmarlo en el panel. ¿Qué revisamos?`,
  });
}
