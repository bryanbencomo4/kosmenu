import { getServiceSupabaseClient } from '../../_lib/supabase-server';
import type { BusinessShop } from './auth';
import type { BusinessToolResult } from './tools';

function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Read-only membership snapshot for the business assistant.
 * Uses same tables as merchant billing (subscriptions + plans).
 */
export async function readMembership(shop: BusinessShop): Promise<BusinessToolResult> {
  const sb = getServiceSupabaseClient();
  try {
    const { data: commerce } = await sb
      .from('comercios')
      .select('billing_exempt')
      .eq('id', shop.comercioId)
      .maybeSingle();

    if (commerce?.billing_exempt === true) {
      return {
        text: [
          `Tu negocio *${shop.nombre}* está *exento de cobro* ✨`,
          '',
          'No tienes fecha de corte de membresía. ¿Quieres ver el menú, pedidos o algo más?',
        ].join('\n'),
      };
    }

    const { data: sub, error } = await sb
      .from('subscriptions')
      .select(
        'id,status,current_period_start,current_period_end,grace_period_end,cancel_at_period_end,plan_id',
      )
      .eq('business_id', shop.comercioId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !sub) {
      return {
        text: [
          `Aún no veo una membresía registrada para *${shop.nombre}* 📋`,
          '',
          'Cuando actives el plan te digo aquí mismo cuántos días faltan para el próximo pago.',
          '',
          '¿Revisamos el menú, los pedidos o algo más?',
        ].join('\n'),
      };
    }

    let plan: Record<string, unknown> | null = null;
    const planId = sub.plan_id != null ? String(sub.plan_id) : '';
    if (planId) {
      const { data: planRow } = await sb
        .from('plans')
        .select('code,name,price_amount,price_currency,billing_interval')
        .eq('id', planId)
        .maybeSingle();
      if (planRow) plan = planRow as Record<string, unknown>;
      else {
        const byCode = await sb
          .from('plans')
          .select('code,name,price_amount,price_currency,billing_interval')
          .eq('code', planId)
          .maybeSingle();
        if (byCode.data) plan = byCode.data as Record<string, unknown>;
      }
    }

    return formatMembershipText(shop, sub as Record<string, unknown>, plan);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'membership_error';
    return {
      text: `No pude leer tu membresía ahora 😅 (${msg})\n\n¿Lo intentamos de nuevo? Si sigue fallando, dime *hablar con un humano*.`,
    };
  }
}

function formatMembershipText(
  shop: BusinessShop,
  sub: Record<string, unknown>,
  plan: Record<string, unknown> | null,
): BusinessToolResult {
  const status = String(sub.status || 'pending');
  const periodEnd = sub.current_period_end != null ? String(sub.current_period_end) : null;
  const graceEnd = sub.grace_period_end != null ? String(sub.grace_period_end) : null;
  const days = daysUntil(periodEnd);
  const planName = plan?.name ? String(plan.name) : 'tu plan';
  const price =
    plan?.price_amount != null && Number.isFinite(Number(plan.price_amount))
      ? `${plan.price_amount} ${plan.price_currency || 'USD'}`
      : null;
  const interval = plan?.billing_interval ? String(plan.billing_interval) : 'month';

  const statusLabel =
    status === 'active'
      ? '🟢 activa'
      : status === 'past_due'
        ? '🟠 pago pendiente'
        : status === 'suspended'
          ? '🔴 suspendida'
          : status === 'cancelled'
            ? '⚪️ cancelada'
            : `⚪️ ${status}`;

  const lines = [
    `Membresía de *${shop.nombre}*`,
    '',
    `• Plan: *${planName}*${price ? ` (${price}/${interval === 'year' ? 'año' : 'mes'})` : ''}`,
    `• Estado: ${statusLabel}`,
  ];

  if (periodEnd) {
    lines.push(`• Próximo corte: *${formatDateEs(periodEnd)}*`);
    if (days != null) {
      if (days > 1) lines.push(`• Te quedan *${days} días* para el próximo pago ⏳`);
      else if (days === 1) lines.push(`• Te queda *1 día* para el próximo pago ⏳`);
      else if (days === 0) lines.push(`• El corte es *hoy* ⏰`);
      else lines.push(`• El período venció hace *${Math.abs(days)} día(s)*`);
    }
  } else {
    lines.push('• Aún no tengo fecha de corte cargada.');
  }

  if (graceEnd && status !== 'active') {
    lines.push(`• Gracia hasta: *${formatDateEs(graceEnd)}*`);
  }
  if (sub.cancel_at_period_end === true) {
    lines.push('• Se cancelará al final del período actual.');
  }

  lines.push('', '¿Algo más? Pedidos, menú, precios… aquí mismo 💬');

  return { text: lines.join('\n') };
}
