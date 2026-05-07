import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

import { getServerSupabaseClient } from '../../../_lib/supabase-server';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,160}$/;

type JsonRecord = Record<string, unknown>;

type DeliveryInvitationRow = {
  id: string;
  pedido_id?: string | null;
  comercio_id?: string | null;
  order_id?: string | null;
  status?: string | null;
  invited_phone?: string | null;
  invited_note?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  arrived_at?: string | null;
  completed_at?: string | null;
  revoked_at?: string | null;
  last_seen_at?: string | null;
  accepted_by_name?: string | null;
  metadata?: JsonRecord | null;
};

type PedidoRow = {
  id: string;
  estado?: string | null;
  detalles?: JsonRecord | null;
  nombre_cliente?: string | null;
  telefono_cliente?: string | null;
  cliente_email?: string | null;
  comercio_id?: string | null;
  created_at?: string | null;
};

type ComercioRow = {
  id: string;
  nombre?: string | null;
  slug?: string | null;
  direccion?: string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
  whatsapp?: string | null;
  telefono?: string | null;
  telefonos?: string | null;
  celular?: string | null;
  logo_url?: string | null;
};

type InvitationContext = {
  invitation: DeliveryInvitationRow;
  pedido: PedidoRow | null;
  comercio: ComercioRow | null;
};

type DeliveryRequestBody = {
  action?: unknown;
  acceptedByName?: unknown;
};

type SupabaseErrorWithCode = {
  code?: string;
  message?: string;
};

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {};
}

function normalizeStatus(value: unknown) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return 'pending';
  if (raw === 'accepted' || raw === 'arrived' || raw === 'completed' || raw === 'expired' || raw === 'revoked') {
    return raw;
  }
  return 'pending';
}

function normalizeOrderStatus(value: unknown) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return 'pendiente';
  if (['pendiente', 'confirmado', 'preparando', 'en_camino', 'entregado', 'cancelado'].includes(raw)) {
    return raw;
  }
  if (raw === 'rechazado' || raw === 'anulado') return 'cancelado';
  return 'pendiente';
}

function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function parseDelivery(detalles: unknown) {
  const detallesRecord = asRecord(detalles);
  const delivery = asRecord(detallesRecord.delivery);
  const coordinates = asRecord(delivery.coordinates);
  const lat = Number(
    coordinates.lat ?? delivery.lat ?? delivery.latitude ?? delivery.latitud,
  );
  const lng = Number(
    coordinates.lng ?? delivery.lng ?? delivery.longitude ?? delivery.longitud,
  );

  return {
    mode: (delivery.mode ?? 'pickup').toString().trim().toLowerCase(),
    address: (delivery.address ?? '').toString().trim(),
    reference: (delivery.reference ?? '').toString().trim(),
    instructions: (delivery.instructions ?? '').toString().trim(),
    coordinates:
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null,
  };
}

function invitedStatePayload(message: string, code: string, status = 410) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message,
    },
    { status },
  );
}

async function updatePedidoDelegateSnapshot(
  supabase: ReturnType<typeof getServerSupabaseClient>,
  pedido: PedidoRow,
  invitation: DeliveryInvitationRow,
  patch: Record<string, unknown>,
) {
  const currentDetalles =
    pedido?.detalles && typeof pedido.detalles === 'object'
      ? { ...(pedido.detalles as Record<string, unknown>) }
      : {};
  const currentDelegate =
    currentDetalles.delivery_delegate && typeof currentDetalles.delivery_delegate === 'object'
      ? { ...(currentDetalles.delivery_delegate as Record<string, unknown>) }
      : {};

  const nextDelegate = {
    ...currentDelegate,
    invitation_id: invitation.id,
    status: normalizeStatus(patch.status ?? invitation.status),
    invited_phone: invitation.invited_phone ?? currentDelegate.invited_phone ?? null,
    invited_note: invitation.invited_note ?? currentDelegate.invited_note ?? null,
    expires_at: invitation.expires_at ?? currentDelegate.expires_at ?? null,
    accepted_at: invitation.accepted_at ?? currentDelegate.accepted_at ?? null,
    arrived_at: invitation.arrived_at ?? currentDelegate.arrived_at ?? null,
    completed_at: invitation.completed_at ?? currentDelegate.completed_at ?? null,
    updated_at: new Date().toISOString(),
    ...patch,
  };

  const nextDetalles = {
    ...currentDetalles,
    delivery_delegate: nextDelegate,
  };

  await supabase.from('pedidos').update({ detalles: nextDetalles }).eq('id', pedido.id);
}

async function loadInvitationContext(supabase: ReturnType<typeof getServerSupabaseClient>, token: string) {
  const tokenHash = sha256Hex(token);
  let { data: invitation, error } = await supabase
    .from('delivery_invitations')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  // Backward-compat path: some clients may share token_hash directly in URL.
  if (!invitation && !error && /^[a-f0-9]{64}$/i.test(token)) {
    const fallback = await supabase
      .from('delivery_invitations')
      .select('*')
      .eq('token_hash', token.toLowerCase())
      .maybeSingle();
    invitation = fallback.data;
    error = fallback.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!invitation) {
    return null;
  }

  const [{ data: pedido, error: pedidoError }, { data: comercio, error: comercioError }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('id,estado,detalles,nombre_cliente,telefono_cliente,cliente_email,comercio_id,created_at')
      .eq('id', invitation.pedido_id)
      .maybeSingle(),
    supabase
      .from('comercios')
      .select('id,nombre,slug,direccion,latitud,longitud,whatsapp,telefonos,logo_url')
      .eq('id', invitation.comercio_id)
      .maybeSingle(),
  ]);

  if (pedidoError) {
    throw new Error(pedidoError.message);
  }

  if (comercioError) {
    throw new Error(comercioError.message);
  }

  return {
    invitation: invitation as DeliveryInvitationRow,
    pedido: (pedido as PedidoRow | null) ?? null,
    comercio: (comercio as ComercioRow | null) ?? null,
  } satisfies InvitationContext;
}

function buildPayload(context: InvitationContext) {
  const invitation = context.invitation;
  const pedido = context.pedido;
  const comercio = context.comercio;
  const detalles = asRecord(pedido?.detalles);
  const delivery = parseDelivery(detalles);
  const orderStatus = normalizeOrderStatus(pedido?.estado);
  const invitationStatus = normalizeStatus(invitation?.status);

  const nowMs = Date.now();
  const expiresAtMs = Date.parse((invitation?.expires_at ?? '').toString());
  const isExpired = Number.isFinite(expiresAtMs) ? expiresAtMs <= nowMs : false;
  const orderBlocked = orderStatus === 'cancelado' || orderStatus === 'entregado';
  const isDeliveryOrder = delivery.mode === 'delivery';

  const canAccept = invitationStatus === 'pending' && !isExpired && !orderBlocked && isDeliveryOrder;
  const canMarkArrived =
    (invitationStatus === 'accepted' || invitationStatus === 'arrived') &&
    !orderBlocked &&
    isDeliveryOrder;

  return {
    ok: true,
    data: {
      invitation: {
        id: invitation.id,
        status: invitationStatus,
        invitedPhone: invitation.invited_phone ?? null,
        invitedNote: invitation.invited_note ?? null,
        expiresAt: invitation.expires_at ?? null,
        acceptedAt: invitation.accepted_at ?? null,
        arrivedAt: invitation.arrived_at ?? null,
        completedAt: invitation.completed_at ?? null,
        revokedAt: invitation.revoked_at ?? null,
        lastSeenAt: invitation.last_seen_at ?? null,
      },
      order: {
        id: pedido?.id ?? null,
        orderId:
          (detalles?.order_id ?? detalles?.codigo_orden ?? invitation.order_id ?? '')
            .toString()
            .trim(),
        status: orderStatus,
        clientName:
          (pedido?.nombre_cliente ?? detalles?.cliente_nombre ?? '').toString().trim(),
        clientPhone:
          (pedido?.telefono_cliente ?? detalles?.telefono_cliente ?? '').toString().trim(),
        clientEmail: (pedido?.cliente_email ?? detalles?.cliente_email ?? '').toString().trim(),
        total: Number(detalles?.total_moneda_checkout ?? detalles?.total ?? 0) || 0,
        currency: (detalles?.moneda_checkout ?? 'COP').toString().trim().toUpperCase(),
        items: Array.isArray(detalles?.items) ? detalles.items : [],
        notes: (detalles?.order_notes ?? '').toString().trim(),
        createdAt: pedido?.created_at ?? null,
      },
      delivery: {
        mode: delivery.mode,
        address: delivery.address,
        reference: delivery.reference,
        instructions: delivery.instructions,
        coordinates: delivery.coordinates,
      },
      comercio: {
        id: comercio?.id ?? null,
        name: (comercio?.nombre ?? '').toString().trim(),
        slug: (comercio?.slug ?? '').toString().trim(),
        address: (comercio?.direccion ?? '').toString().trim(),
        lat: Number(comercio?.latitud),
        lng: Number(comercio?.longitud),
        phone:
          (comercio?.whatsapp ?? comercio?.telefono ?? comercio?.telefonos ?? comercio?.celular ?? '')
            .toString()
            .trim(),
        logoUrl: (comercio?.logo_url ?? '').toString().trim(),
      },
      actions: {
        canAccept,
        canMarkArrived,
      },
    },
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token: rawToken } = await params;
    const token = decodeURIComponent(rawToken ?? '').trim();

    if (!TOKEN_PATTERN.test(token)) {
      return invitedStatePayload('El enlace de delivery no es valido.', 'INVALID_TOKEN', 400);
    }

    const supabase = getServerSupabaseClient();
    const context = await loadInvitationContext(supabase, token);

    if (!context) {
      return invitedStatePayload('Este enlace no existe o fue invalidado.', 'TOKEN_NOT_FOUND', 404);
    }

    const invitationStatus = normalizeStatus(context.invitation.status);
    const expiresAtMs = Date.parse((context.invitation.expires_at ?? '').toString());
    const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();

    if (invitationStatus === 'pending' && isExpired) {
      const { data: expiredInvitation } = await supabase
        .from('delivery_invitations')
        .update({
          status: 'expired',
          metadata: {
            ...(context.invitation.metadata ?? {}),
            reason: 'expired_by_access',
          },
        })
        .eq('id', context.invitation.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

      if (expiredInvitation) {
        context.invitation = expiredInvitation;
        if (context.pedido) {
          await updatePedidoDelegateSnapshot(supabase, context.pedido, expiredInvitation, {
            status: 'expired',
          });
        }

        await supabase.rpc('log_delivery_invitation_event', {
          p_invitation_id: expiredInvitation.id,
          p_pedido_id: expiredInvitation.pedido_id,
          p_order_id: expiredInvitation.order_id,
          p_event_type: 'expired',
          p_actor: 'system',
          p_payload: { reason: 'access_after_expiration' },
        });
      }
    }

    if (!context.pedido) {
      return invitedStatePayload('Este pedido ya no esta disponible.', 'ORDER_NOT_FOUND', 404);
    }

    return NextResponse.json(buildPayload(context), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la invitacion.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token: rawToken } = await params;
    const token = decodeURIComponent(rawToken ?? '').trim();
    if (!TOKEN_PATTERN.test(token)) {
      return invitedStatePayload('El enlace de delivery no es valido.', 'INVALID_TOKEN', 400);
    }

    const body = (await request.json().catch(() => ({}))) as DeliveryRequestBody;
    const action = (body?.action ?? '').toString().trim().toLowerCase();
    const acceptedByName = (body?.acceptedByName ?? '').toString().trim().slice(0, 80);

    if (action !== 'accept' && action !== 'arrived') {
      return NextResponse.json({ ok: false, error: 'Accion no soportada.' }, { status: 400 });
    }

    const supabase = getServerSupabaseClient();
    const context = await loadInvitationContext(supabase, token);

    if (!context || !context.pedido) {
      return invitedStatePayload('La invitacion no existe o el pedido no esta disponible.', 'INVITATION_NOT_FOUND', 404);
    }

    const invitation = context.invitation;
    const orderStatus = normalizeOrderStatus(context.pedido.estado);
    const delivery = parseDelivery(context.pedido.detalles ?? {});
    const nowIso = new Date().toISOString();

    if (delivery.mode !== 'delivery') {
      return NextResponse.json(
        { ok: false, code: 'ORDER_NOT_DELIVERY', error: 'Este pedido no corresponde a delivery.' },
        { status: 409 },
      );
    }

    if (orderStatus === 'cancelado' || orderStatus === 'entregado') {
      return NextResponse.json(
        { ok: false, code: 'ORDER_LOCKED', error: 'Este pedido ya no admite acciones de repartidor.' },
        { status: 409 },
      );
    }

    if (action === 'accept') {
      const expiresAtMs = Date.parse((invitation.expires_at ?? '').toString());
      if (normalizeStatus(invitation.status) === 'pending' && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return NextResponse.json(
          { ok: false, code: 'INVITATION_EXPIRED', error: 'La invitacion expiro. Solicita un nuevo enlace.' },
          { status: 410 },
        );
      }

      if (normalizeStatus(invitation.status) === 'accepted' || normalizeStatus(invitation.status) === 'arrived') {
        await supabase.from('delivery_invitations').update({ last_seen_at: nowIso }).eq('id', invitation.id);
        return NextResponse.json(buildPayload(context), { status: 200 });
      }

      if (normalizeStatus(invitation.status) !== 'pending') {
        return NextResponse.json(
          { ok: false, code: 'INVITATION_NOT_PENDING', error: 'Esta invitacion ya no esta disponible.' },
          { status: 409 },
        );
      }

      const { data: acceptedInvitation, error: acceptError } = await supabase
        .from('delivery_invitations')
        .update({
          status: 'accepted',
          accepted_at: nowIso,
          accepted_by_name: acceptedByName || null,
          last_seen_at: nowIso,
        })
        .eq('id', invitation.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

      if (acceptError) {
        const code = (acceptError as SupabaseErrorWithCode | null)?.code ?? '';
        if (code === '23505') {
          return NextResponse.json(
            { ok: false, code: 'ORDER_ALREADY_ASSIGNED', error: 'Otro repartidor ya acepto esta entrega.' },
            { status: 409 },
          );
        }
        throw new Error(acceptError.message);
      }

      if (!acceptedInvitation) {
        return NextResponse.json(
          { ok: false, code: 'INVITATION_RACE_CONDITION', error: 'No fue posible aceptar el delivery. Intenta actualizar.' },
          { status: 409 },
        );
      }

      await updatePedidoDelegateSnapshot(supabase, context.pedido, acceptedInvitation, {
        status: 'accepted',
        accepted_at: acceptedInvitation.accepted_at,
        accepted_by_name: acceptedInvitation.accepted_by_name,
      });

      const acceptedOrderStatus = normalizeOrderStatus(context.pedido.estado);
      if (acceptedOrderStatus !== 'en_camino') {
        const { data: updatedPedido } = await supabase
          .from('pedidos')
          .update({ estado: 'en_camino' })
          .eq('id', context.pedido.id)
          .neq('estado', 'cancelado')
          .neq('estado', 'entregado')
          .select('id,estado,detalles,nombre_cliente,telefono_cliente,cliente_email,comercio_id,created_at')
          .maybeSingle();
        if (updatedPedido) {
          context.pedido = updatedPedido;
        }
      }

      await supabase.rpc('log_delivery_invitation_event', {
        p_invitation_id: acceptedInvitation.id,
        p_pedido_id: acceptedInvitation.pedido_id,
        p_order_id: acceptedInvitation.order_id,
        p_event_type: 'accepted',
        p_actor: acceptedByName || 'guest_courier',
        p_payload: { accepted_at: acceptedInvitation.accepted_at },
      });

      context.invitation = acceptedInvitation;
      return NextResponse.json(buildPayload(context), { status: 200 });
    }

    const currentStatus = normalizeStatus(invitation.status);
    if (currentStatus !== 'accepted' && currentStatus !== 'arrived') {
      return NextResponse.json(
        { ok: false, code: 'INVITATION_NOT_ACTIVE', error: 'Debes aceptar la entrega antes de marcar llegada.' },
        { status: 409 },
      );
    }

    if (currentStatus === 'arrived') {
      await supabase.from('delivery_invitations').update({ last_seen_at: nowIso }).eq('id', invitation.id);
      return NextResponse.json(buildPayload(context), { status: 200 });
    }

    const { data: arrivedInvitation, error: arrivedError } = await supabase
      .from('delivery_invitations')
      .update({
        status: 'arrived',
        arrived_at: nowIso,
        last_seen_at: nowIso,
      })
      .eq('id', invitation.id)
      .eq('status', 'accepted')
      .select('*')
      .maybeSingle();

    if (arrivedError) {
      throw new Error(arrivedError.message);
    }

    if (!arrivedInvitation) {
      return NextResponse.json(
        { ok: false, code: 'ARRIVED_CONFLICT', error: 'No fue posible marcar llegada. Actualiza el estado.' },
        { status: 409 },
      );
    }

    await updatePedidoDelegateSnapshot(supabase, context.pedido, arrivedInvitation, {
      status: 'arrived',
      arrived_at: arrivedInvitation.arrived_at,
    });

    const arrivedOrderStatus = normalizeOrderStatus(context.pedido.estado);
    if (arrivedOrderStatus !== 'en_camino') {
      const { data: updatedPedido } = await supabase
        .from('pedidos')
        .update({ estado: 'en_camino' })
        .eq('id', context.pedido.id)
        .neq('estado', 'cancelado')
        .neq('estado', 'entregado')
        .select('id,estado,detalles,nombre_cliente,telefono_cliente,cliente_email,comercio_id,created_at')
        .maybeSingle();
      if (updatedPedido) {
        context.pedido = updatedPedido;
      }
    }

    await supabase.rpc('log_delivery_invitation_event', {
      p_invitation_id: arrivedInvitation.id,
      p_pedido_id: arrivedInvitation.pedido_id,
      p_order_id: arrivedInvitation.order_id,
      p_event_type: 'arrived',
      p_actor: (arrivedInvitation.accepted_by_name ?? 'guest_courier').toString(),
      p_payload: { arrived_at: arrivedInvitation.arrived_at },
    });

    context.invitation = arrivedInvitation;
    return NextResponse.json(buildPayload(context), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo procesar la accion del repartidor.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
