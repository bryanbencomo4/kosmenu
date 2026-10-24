import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  computeKitProductTotalUsd,
  KIT_EXTRAS_MAX,
  KIT_EXTRAS_UNIT_USD,
  KIT_GIFT_QTY,
  kitOrderPublicCode,
  resolveKitStatus,
} from '../../../_lib/kit-shipments';
import {
  canSendKitShipmentEmail,
  notifyOpsKitShipment,
  sendKitShipmentEmail,
} from '../../_lib/send-kit-shipment-email';
import { appCorsPreflight, withAppCors } from '../../_lib/app-cors';
import { consumeRateLimit, getClientIp } from '../../_lib/rate-limit';
import { getServiceSupabaseClient } from '../../_lib/supabase-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS = {
  methods: 'POST, OPTIONS',
  headers: 'authorization, content-type, accept',
};

export async function OPTIONS(request: Request) {
  return appCorsPreflight(request, CORS);
}

function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function text(value: unknown, max = 200) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max);
}

/**
 * Authenticated merchant claims Kit Portamenú shipping (Zoom) during checkout.
 * Upserts one open shipment per business (pending_payment / pending_ship).
 */
export async function POST(request: Request) {
  return withAppCors(request, await postMerchantShip(request), CORS);
}

async function postMerchantShip(request: Request): Promise<NextResponse> {
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit(`kit:merchant-ship:${ip}`, 20, 60 * 60 * 1000);
    if (limit.ok === false) {
      return NextResponse.json(
        { error: 'Demasiados intentos.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anon) {
      return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 });
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Sesión inválida.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
    }

    const recipientName = text((body as Record<string, unknown>).recipientName, 120);
    const phone = text((body as Record<string, unknown>).phone, 40);
    const email = text((body as Record<string, unknown>).email, 160).toLowerCase();
    const deliveryModeRaw = text((body as Record<string, unknown>).deliveryMode, 20).toLowerCase();
    const deliveryMode =
      deliveryModeRaw === 'support' || deliveryModeRaw === 'manual' || deliveryModeRaw === 'zoom'
        ? deliveryModeRaw
        : 'zoom';
    const deliveryNotes = text((body as Record<string, unknown>).deliveryNotes, 500);
    let ci = text((body as Record<string, unknown>).ci, 40);
    let estado = text((body as Record<string, unknown>).estado, 80);
    let ciudad = text((body as Record<string, unknown>).ciudad, 80);
    let zoomOffice = text((body as Record<string, unknown>).zoomOffice, 240);
    const extrasRaw = Number((body as Record<string, unknown>).extrasQty ?? 0);
    const extrasQty = Number.isFinite(extrasRaw)
      ? Math.max(0, Math.min(KIT_EXTRAS_MAX, Math.floor(extrasRaw)))
      : 0;

    if (recipientName.length < 2) {
      return NextResponse.json({ error: 'Nombre del destinatario requerido.' }, { status: 400 });
    }
    if (phone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Teléfono inválido.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Correo inválido.' }, { status: 400 });
    }

    if (deliveryMode === 'zoom') {
      if (ci.length < 5 || zoomOffice.length < 3 || (!estado && !ciudad)) {
        return NextResponse.json({ error: 'Completa los datos de envío Zoom.' }, { status: 400 });
      }
      // Zoom ASL frequently omits state; keep NOT NULL columns filled.
      if (!estado && ciudad) estado = ciudad;
      if (!ciudad && estado) ciudad = estado;
    } else if (deliveryMode === 'manual') {
      if (deliveryNotes.length < 8 && zoomOffice.length < 8) {
        return NextResponse.json(
          { error: 'Describe cómo quieres recibir el kit.' },
          { status: 400 },
        );
      }
      if (!ci) ci = 'POR_DEFINIR';
      if (!estado) estado = 'Por definir';
      if (!ciudad) ciudad = 'Por definir';
      if (!zoomOffice) zoomOffice = deliveryNotes || 'Entrega manual';
    } else {
      // support — arrange via WhatsApp; keep DB NOT NULL columns filled.
      if (!ci) ci = 'POR_DEFINIR';
      if (!estado) estado = 'Por definir';
      if (!ciudad) ciudad = 'Por definir';
      zoomOffice = 'Acordar con soporte elmenuxfa (WhatsApp)';
    }

    const service = getServiceSupabaseClient();
    const { data: comercio, error: comercioError } = await service
      .from('comercios')
      .select('id, slug, nombre')
      .eq('owner_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (comercioError || !comercio) {
      return NextResponse.json(
        { error: 'No encontramos tu negocio para asociar el envío.' },
        { status: 404 },
      );
    }

    const productTotalUsd = computeKitProductTotalUsd(extrasQty);
    const status = resolveKitStatus(extrasQty);

    const { data: existing } = await service
      .from('kit_shipments')
      .select('id')
      .eq('business_id', comercio.id)
      .in('status', ['pending_payment', 'pending_ship'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = {
      gift_qty: KIT_GIFT_QTY,
      extras_qty: extrasQty,
      extras_unit_price_usd: KIT_EXTRAS_UNIT_USD,
      product_total_usd: productTotalUsd,
      recipient_name: recipientName,
      phone,
      email,
      ci,
      estado,
      ciudad,
      zoom_office: zoomOffice,
      delivery_mode: deliveryMode,
      delivery_notes: deliveryNotes || null,
      business_id: comercio.id as string,
      business_slug: (comercio.slug as string | null) ?? null,
      status,
      declared_currency: extrasQty > 0 ? 'VES' : null,
    };

    // Prefer new delivery_* columns; fall back if migration not applied yet.
    const legacyRow = { ...row } as Record<string, unknown>;
    delete legacyRow.delivery_mode;
    delete legacyRow.delivery_notes;

    async function writeShipment(payload: Record<string, unknown>) {
      if (existing?.id) {
        return service
          .from('kit_shipments')
          .update(payload)
          .eq('id', existing.id)
          .select('id, status')
          .single();
      }
      return service.from('kit_shipments').insert(payload).select('id, status').single();
    }

    let shipmentId: string;
    {
      let { data, error } = await writeShipment(row as Record<string, unknown>);
      if (error && /delivery_mode|delivery_notes/i.test(error.message ?? '')) {
        ({ data, error } = await writeShipment(legacyRow));
      }
      if (error || !data) {
        console.error('[kit/merchant-ship] write', error?.message);
        return NextResponse.json(
          { error: existing?.id ? 'No se pudo actualizar el envío.' : 'No se pudo guardar el envío.' },
          { status: 500 },
        );
      }
      shipmentId = data.id as string;
    }

    if (!existing?.id) {

      if (canSendKitShipmentEmail()) {
        const payload = {
          kind: 'received' as const,
          toEmail: email,
          recipientName,
          shipmentId,
          giftQty: KIT_GIFT_QTY,
          extrasQty,
          productTotalUsd,
          status,
          estado,
          ciudad,
          zoomOffice,
        };
        await Promise.allSettled([
          sendKitShipmentEmail(payload),
          notifyOpsKitShipment(payload),
        ]);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: shipmentId,
        code: kitOrderPublicCode(shipmentId),
        status,
        giftQty: KIT_GIFT_QTY,
        extrasQty,
        productTotalUsd,
        businessName: comercio.nombre ?? null,
      },
    });
  } catch (err) {
    console.error('[kit/merchant-ship]', err);
    return NextResponse.json({ error: 'Error al guardar el envío.' }, { status: 500 });
  }
}
