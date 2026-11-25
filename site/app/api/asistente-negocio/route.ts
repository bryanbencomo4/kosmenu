import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { WaHandoffPayload } from '../_lib/wa-handoff';
import { resolveWaHandoffStore } from '../_lib/wa-handoff-store';
import { appCorsPreflight, withAppCors } from '../_lib/app-cors';
import { getUserFromBearerRequest } from '../_lib/supabase-user-auth';
import { consumeRateLimit, getClientIp } from '../_lib/rate-limit';
import {
  BUSINESS_ASSISTANT_APP_HOME,
  BUSINESS_ASSISTANT_CANONICAL_APP_PATH,
  BUSINESS_ASSISTANT_LOGIN_URL,
  isBusinessAssistantApiEnabled,
} from '../../_lib/business-assistant';
import { resolveMembership } from './_lib/auth';
import { getBusinessAssistantRuntimeConfig } from './_lib/config';
import {
  greetingText,
  helpText,
  homeGreetingText,
  multiBusinessText,
  needsAuthText,
  noBusinessText,
  rateLimitText,
} from './_lib/copy';
import { suggestBusinessChips } from './_lib/chips';
import { classifyBusinessTurnWithGemini } from './_lib/gemini-nlu';
import {
  isConcreteBusinessIntent,
  isWriteBusinessIntent,
  parseBusinessIntent,
  parseBusinessIntents,
  type BusinessIntent,
} from './_lib/intents';
import type { BusinessShop } from './_lib/auth';
import { escalateBusinessAssistantToHuman } from './_lib/escalate';
import { readMembership } from './_lib/membership';
import { resolveShopByName } from './_lib/product-match';
import {
  listPaymentMethods,
  listStaff,
  proposeCreateCategory,
  proposeCreateProduct,
  proposeDeleteCategory,
  proposeDeletePayment,
  proposeDeleteProduct,
  proposeDeliveryToggle,
  proposeInviteStaff,
  proposeOrderStatus,
  proposeProductImage,
  proposePromo,
  proposeSetTasa,
  proposeUpdateProfile,
  proposeUpsellBadge,
  proposeUpsertPayment,
  readDeliveryConfig,
} from './_lib/propose-extended';
import {
  applyConfirm,
  guideChangeImage,
  listMenu,
  listCustomers,
  loadShopHomeMetrics,
  proposeAvailability,
  proposeEnLinea,
  proposeHours,
  proposePrice,
  readHomeMetrics,
  readHours,
  readOrderDetail,
  recentOrders,
  type BusinessToolResult,
} from './_lib/tools';

async function executeBusinessIntent(params: {
  intent: BusinessIntent;
  userId: string;
  shop: BusinessShop;
  userText: string;
  conversationHint?: string | null;
  geminiReply?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<BusinessToolResult> {
  const { intent, userId, shop, userText, conversationHint, geminiReply, history } =
    params;
  switch (intent.kind) {
    case 'list_menu':
      return listMenu(shop);
    case 'propose_price':
      return proposePrice(userId, shop, {
        productHint: intent.productHint || conversationHint || undefined,
        newPrice: intent.newPrice,
      });
    case 'propose_availability':
      return proposeAvailability(userId, shop, {
        productHint: intent.productHint,
        available: intent.available,
      });
    case 'change_image':
      return guideChangeImage(shop, intent.productHint);
    case 'read_hours':
      return readHours(shop);
    case 'propose_hours':
      return proposeHours(userId, shop, intent.hoursText || userText);
    case 'propose_en_linea':
      return proposeEnLinea(userId, shop, intent.enLinea);
    case 'recent_orders':
      return recentOrders(shop, { filter: intent.filter || 'all' });
    case 'home_metrics':
      return readHomeMetrics(shop, intent.focus || 'all');
    case 'customers':
      return listCustomers(shop);
    case 'order_detail':
      return readOrderDetail(shop, intent.hint || userText);
    case 'currency':
      if (intent.setValue != null) {
        return proposeSetTasa(userId, shop, userText);
      }
      return {
        text: shop.tasa
          ? `💱 En *${shop.nombre}* la tasa está en *${shop.tasa}* (${shop.moneda ?? 'moneda local'}).\n\n¿La actualizamos? Dime el nuevo valor (ej. “tasa 42.5”).`
          : `💱 En *${shop.nombre}* aún no veo tasa cargada (${shop.moneda ?? '—'}).\n\nDime el valor (ej. “tasa 42.5”) y la dejamos lista aquí.`,
      };
    case 'membership':
      return readMembership(shop);
    case 'account': {
      const mode = intent.mode || 'menu';
      if (mode === 'password') {
        return {
          text: `Vamos a cambiar tu *contraseña* 🔐\n\nUsa la tarjetita de abajo — no salgas del chat. Nunca te pediré ni mostraré tokens.`,
          showAccountCard: 'password',
        };
      }
      if (mode === 'email') {
        return {
          text: `Vamos a actualizar tu *email* ✉️\n\nUsa la tarjetita de abajo. Te puede llegar un correo de confirmación.`,
          showAccountCard: 'email',
        };
      }
      return {
        text: `Tu cuenta de acceso 👤\n\nPuedo ayudarte a *cambiar contraseña* o *cambiar email* aquí mismo, con seguridad.\n\n¿Qué quieres actualizar?`,
        showAccountCard: 'menu',
      };
    }
    case 'share_menu': {
      if (shop.slug) {
        const path = `/v/${encodeURIComponent(shop.slug)}`;
        return {
          text: [
            `Aquí tienes el enlace público de *${shop.nombre}* 🔗`,
            '',
            `https://elmenuxfa.com${path}`,
            '',
            'Úsalo en WhatsApp, Instagram o para generar tu QR. No incluye tokens ni datos privados.',
          ].join('\n'),
        };
      }
      return {
        text: `Aún no veo un *slug* público cargado para *${shop.nombre}* 🙈\n\nCuando esté listo te paso el enlace aquí mismo.`,
      };
    }
    case 'refuse_sensitive':
      return {
        text: [
          'Eso no lo puedo compartir 🔒',
          '',
          'Nunca revelo contraseñas, tokens, OTP ni claves API — ni tuyas ni de otro negocio.',
          '',
          'Si quieres *cambiar* tu email o contraseña, dímelo y te abro la tarjeta segura aquí en el chat.',
        ].join('\n'),
      };
    case 'register':
      return {
        text: [
          `Sí — puedes tener *otro menú* para otro negocio 🏪`,
          '',
          `Ahora estás en *${shop.nombre}*. Dime el *nombre* del otro local y lo armamos aquí mismo paso a paso.`,
        ].join('\n'),
      };
    case 'add_product':
      return proposeCreateProduct(userId, shop, userText);
    case 'delete_product':
      return proposeDeleteProduct(userId, shop, intent.productHint || userText);
    case 'create_category':
      return proposeCreateCategory(userId, shop, intent.raw || userText);
    case 'delete_category':
      return proposeDeleteCategory(userId, shop, intent.raw || userText);
    case 'list_payments':
      return listPaymentMethods(shop);
    case 'upsert_payment':
      return proposeUpsertPayment(userId, shop, intent.raw || userText);
    case 'delete_payment':
      return proposeDeletePayment(userId, shop, intent.raw || userText);
    case 'read_delivery':
      return readDeliveryConfig(shop);
    case 'set_delivery':
      return proposeDeliveryToggle(
        userId,
        shop,
        intent.enabled !== false,
        intent.fixedPrice,
      );
    case 'create_promo':
      return proposePromo(userId, shop, intent.raw || userText);
    case 'set_order_status':
      return proposeOrderStatus(userId, shop, intent.raw || userText);
    case 'list_staff':
      return listStaff(shop);
    case 'invite_staff':
      return proposeInviteStaff(userId, shop, intent.raw || userText);
    case 'set_featured':
      return proposeUpsellBadge(userId, shop, intent.raw || userText, intent.clear === true);
    case 'set_product_image':
      return proposeProductImage(
        userId,
        shop,
        intent.productHint || userText,
        intent.imageUrl || '',
      );
    case 'update_profile':
      return proposeUpdateProfile(userId, shop, {
        nombre: intent.nombre,
        descripcionVisual: intent.descripcionVisual,
        whatsapp: intent.whatsapp,
      });
    case 'unsupported': {
      const copy: Record<typeof intent.topic, string> = {
        payments:
          'Para ese detalle de pago necesito más datos 💳. Prueba “métodos de pago” o “agrega zelle”.',
        delivery:
          'Las zonas con polígono se editan mejor en el panel 🛵. Aquí sí activo/desactivo delivery y tarifa fija.',
        promo:
          'Esa promo avanzada (targets/combos) vive en el panel 🏷️. Aquí creo reglas simples de venta.',
        staff:
          'Para roles complejos usa el panel 👥. Aquí listo el equipo e invito por correo.',
        category:
          'Dime el nombre exacto de la categoría 📂.',
        order_status:
          'Indica el pedido y el estado (confirmado / en camino / entregado / cancelado).',
        variations:
          'Variaciones, tamaños y extras usan un editor complejo del panel 🧩. Aquí no los armo todavía para no romper el menú público.',
      };
      return { text: copy[intent.topic] };
    }
    case 'escalate_human':
      return escalateBusinessAssistantToHuman({
        userId,
        shop,
        userText,
        reason: intent.reason || userText,
        history,
      });
    case 'chat':
      return { text: intent.reply };
    case 'select_comercio':
      return {
        text: `Listo, seguimos con *${shop.nombre}* ✅\n\n¿Qué hacemos? Menú, precios, stock u horario.`,
      };
    case 'help':
    default:
      return {
        text: geminiReply?.trim() || helpText(shop.nombre, shop.enLinea),
      };
  }
}

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
  handoffAction: z.enum(['peek', 'consume']).optional(),
  comercioId: z.string().trim().max(64).optional(),
  /** Public URL from /api/asistente-negocio/upload (product-images bucket). */
  imageUrl: z.string().url().max(2000).optional(),
  /** Structured confirm from UI cards (preferred over typing "confirmar"). */
  confirmToken: z.string().trim().min(10).max(4000).optional(),
  confirmAction: z.enum(['apply', 'cancel']).optional(),
});

function getHandoffStore() {
  return resolveWaHandoffStore();
}

export async function OPTIONS(req: Request) {
  return appCorsPreflight(req, CORS);
}

function json(req: Request, data: unknown, status = 200) {
  return withAppCors(req, NextResponse.json(data, { status }), CORS);
}

function withResult(
  base: Record<string, unknown>,
  result: BusinessToolResult,
): Record<string, unknown> {
  return {
    ...base,
    text: result.text,
    proposal: result.proposal ?? null,
    productsSample: result.productsSample,
    menuView: result.menuView ?? null,
    showAccountCard: result.showAccountCard ?? null,
    ordersView: result.ordersView ?? null,
    metricsView: result.metricsView ?? null,
    customersView: result.customersView ?? null,
    auditId: result.auditId,
  };
}

/**
 * POST /api/asistente-negocio — merchant admin assistant.
 * Flag: BUSINESS_ASSISTANT_ENABLED=1 (also allowed in test/preview/local empty VERCEL_ENV).
 */
export async function POST(req: Request) {
  const cfg = getBusinessAssistantRuntimeConfig();
  const vercelEnv = (process.env.VERCEL_ENV || '').trim().toLowerCase();
  const allow =
    isBusinessAssistantApiEnabled() ||
    (process.env.NODE_ENV || '') === 'test' ||
    vercelEnv === 'preview' ||
    vercelEnv === '';
  if (!allow) {
    return json(req, { ok: false, error: 'disabled' }, 403);
  }

  const ip = getClientIp(req);
  const ipRate = consumeRateLimit(
    `business-assistant:ip:${ip}`,
    cfg.rateLimitPerIpPerMinute,
    60_000,
  );
  if (!ipRate.ok) {
    return json(
      req,
      {
        ok: true,
        text: rateLimitText(),
      },
      429,
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json(req, { ok: false, error: 'invalid_body' }, 400);
  }

  const user = await getUserFromBearerRequest(req);
  const authenticated = Boolean(user);

  if (user) {
    const userRate = consumeRateLimit(
      `business-assistant:user:${user.id}`,
      cfg.rateLimitPerUserPerMinute,
      60_000,
    );
    if (!userRate.ok) {
      return json(
        req,
        {
          ok: true,
          authenticated: true,
          text: rateLimitText(),
        },
        429,
      );
    }
  }

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
    : { list: [] as Awaited<ReturnType<typeof resolveMembership>>['list'], selected: null as Awaited<ReturnType<typeof resolveMembership>>['selected'] };
  let selectedShop = membership.selected;

  const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  const isBoot = !lastUser && !body.confirmToken;

  const baseAuth = {
    ok: true as const,
    authenticated,
    handoffError,
    payload,
    membership: membership.list.map((c) => ({
      comercioId: c.comercioId,
      nombre: c.nombre,
      role: c.role,
    })),
    selectedComercioId: selectedShop?.comercioId ?? null,
    handoffValid: Boolean(payload) && !handoffError,
    recoveryHint: handoffError === 'expired' || handoffError === 'consumed',
    panelUrl: cfg.panelUrl,
    loginUrl: cfg.loginUrl || BUSINESS_ASSISTANT_LOGIN_URL,
    registerUrl: cfg.registerUrl,
    appHomeUrl: BUSINESS_ASSISTANT_APP_HOME,
    canonicalAppUrl: BUSINESS_ASSISTANT_CANONICAL_APP_PATH,
  };

  if (isBoot) {
    let bootText: string;
    let bootMetrics: Awaited<ReturnType<typeof loadShopHomeMetrics>> = null;
    let chipPhase: 'auth' | 'boot' | 'multi_shop' | 'no_shop' = 'boot';

    if (handoffError) {
      bootText =
        handoffError === 'expired'
          ? 'Este enlace de WhatsApp ya venció ⏰\n\nEntra aquí abajo y seguimos igual 💪'
          : handoffError === 'consumed'
            ? 'Ese enlace ya se usó 🙂\n\nEntra aquí abajo y continuamos 💬'
            : 'No pude leer el enlace de WhatsApp 😅\n\nEntra aquí abajo y arrancamos de cero ✨';
      chipPhase = authenticated ? 'boot' : 'auth';
    } else if (
      authenticated &&
      selectedShop &&
      !payload?.pendingOperation &&
      !payload?.conversationHint
    ) {
      bootMetrics = await loadShopHomeMetrics(selectedShop);
      bootText = homeGreetingText(selectedShop, bootMetrics);
      chipPhase = 'boot';
    } else if (authenticated && !selectedShop && membership.list.length > 1) {
      bootText = multiBusinessText(membership.list.map((c) => c.nombre));
      chipPhase = 'multi_shop';
    } else if (authenticated && !selectedShop) {
      bootText = noBusinessText();
      chipPhase = 'no_shop';
    } else {
      bootText = greetingText(payload, authenticated);
      chipPhase = authenticated ? 'boot' : 'auth';
    }

    return json(req, {
      ...baseAuth,
      text: bootText,
      needsAuth: !authenticated,
      showAuthCard: !authenticated,
      needsComercioSelect: Boolean(authenticated && !selectedShop && membership.list.length > 1),
      chips: suggestBusinessChips({
        phase: chipPhase,
        shop: selectedShop,
        metrics: bootMetrics,
        shopNames: membership.list.map((c) => c.nombre),
        shops: membership.list.map((c) => ({
          comercioId: c.comercioId,
          nombre: c.nombre,
        })),
        handoffPending: payload?.pendingOperation || null,
      }),
    });
  }

  // Structured confirm from UI (does not require last user text).
  if (body.confirmToken && body.confirmAction === 'cancel') {
    return json(req, {
      ...baseAuth,
      text: 'Listo, cancelado ❌ No toqué nada.',
      proposal: null,
      chips: suggestBusinessChips({ phase: 'after_cancel', shop: selectedShop }),
    });
  }

  if (body.confirmToken && body.confirmAction === 'apply') {
    if (!user) {
      return json(req, {
        ...baseAuth,
        text: needsAuthText(false),
        needsAuth: true,
        showAuthCard: true,
        chips: suggestBusinessChips({ phase: 'auth' }),
      });
    }
    const result = await applyConfirm({
      userId: user.id,
      shops: membership.list,
      token: body.confirmToken,
    });
    return json(
      req,
      withResult(
        {
          ...baseAuth,
          selectedComercioId: selectedShop?.comercioId ?? null,
          chips: suggestBusinessChips({
            phase: 'after_apply',
            shop: selectedShop,
            result,
          }),
        },
        result,
      ),
    );
  }

  if (!authenticated || !user) {
    return json(req, {
      ...baseAuth,
      text: needsAuthText(Boolean(handoffError)),
      needsAuth: true,
      showAuthCard: true,
      chips: suggestBusinessChips({ phase: 'auth' }),
    });
  }

  if (!selectedShop && membership.list.length > 1) {
    const byName = resolveShopByName(membership.list, lastUser!.text);
    if (byName) selectedShop = byName;
    if (!selectedShop) {
      const intent = parseBusinessIntent(lastUser!.text);
      if (intent.kind === 'select_comercio') {
        selectedShop = resolveShopByName(membership.list, intent.nameHint);
      }
    }
    if (!selectedShop) {
      return json(req, {
        ...baseAuth,
        text: multiBusinessText(membership.list.map((c) => c.nombre)),
        needsComercioSelect: true,
        chips: suggestBusinessChips({
          phase: 'multi_shop',
          shops: membership.list.map((c) => ({
            comercioId: c.comercioId,
            nombre: c.nombre,
          })),
        }),
      });
    }
    // Fresh selection: greet that shop, persist id for the client.
    if (!body.comercioId || body.comercioId !== selectedShop.comercioId) {
      const bootMetrics = await loadShopHomeMetrics(selectedShop);
      return json(req, {
        ...baseAuth,
        selectedComercioId: selectedShop.comercioId,
        text: homeGreetingText(selectedShop, bootMetrics),
        needsComercioSelect: false,
        chips: suggestBusinessChips({
          phase: 'boot',
          shop: selectedShop,
          metrics: bootMetrics,
        }),
      });
    }
  }

  if (!selectedShop) {
    return json(req, {
      ...baseAuth,
      text: noBusinessText(),
      showAuthCard: false,
      chips: suggestBusinessChips({ phase: 'no_shop' }),
    });
  }

  const shop = selectedShop;
  const pendingOp = payload?.pendingOperation;
  const multiIntents = parseBusinessIntents(lastUser!.text, { pendingOp });
  let intent = multiIntents[0]!;
  let geminiReply: string | undefined;

  // Attached image from chat → propose product photo (never auto-apply).
  if (body.imageUrl) {
    intent = {
      kind: 'set_product_image',
      productHint: lastUser?.text || '',
      imageUrl: body.imageUrl,
    };
  }

  // Gemini only for ambiguous turns — never replaces confirm/cancel or clear chip intents.
  if (multiIntents.length < 2 && !isConcreteBusinessIntent(intent)) {
    const gemini = await classifyBusinessTurnWithGemini({
      shopName: shop.nombre,
      enLinea: shop.enLinea,
      userText: lastUser!.text,
      history: (body.messages || []).slice(-8),
    });
    if (gemini) {
      intent = gemini.intent;
      geminiReply = gemini.reply;
    }
  }

  if (intent.kind === 'confirm_apply') {
    return json(req, {
      ...baseAuth,
      selectedComercioId: shop.comercioId,
      text: 'Toca *Confirmar* en la tarjetita de arriba ✅ (o pide el cambio otra vez).',
      chips: [
        { id: 'cancel', label: '❌ Cancelar', text: 'cancelar' },
        { id: 'menu', label: '📋 Ver menú', text: 'ver menú' },
        { id: 'orders', label: '🧾 Pedidos', text: 'pedidos' },
      ],
    });
  }
  if (intent.kind === 'cancel_confirm') {
    return json(req, {
      ...baseAuth,
      selectedComercioId: shop.comercioId,
      text: 'Listo, cancelado ❌ No toqué nada.',
      proposal: null,
      chips: suggestBusinessChips({ phase: 'after_cancel', shop }),
    });
  }

  // Safe multi: reads first, at most one write (confirm). No new orchestrator.
  let result: BusinessToolResult;
  if (multiIntents.length >= 2) {
    const writes = multiIntents.filter(isWriteBusinessIntent);
    const reads = multiIntents.filter((i) => !isWriteBusinessIntent(i));
    const ordered = [...reads, ...writes.slice(0, 1)].slice(0, 2);
    const parts: BusinessToolResult[] = [];
    for (const step of ordered) {
      parts.push(
        await executeBusinessIntent({
          intent: step,
          userId: user.id,
          shop,
          userText: lastUser!.text,
          conversationHint: payload?.conversationHint,
          history: body.messages || [],
        }),
      );
    }
    const extraWrite =
      writes.length > 1
        ? '\n\nLa segunda modificación la hacemos después de confirmar la primera ✅'
        : '';
    result = {
      text: parts.map((p) => p.text).join('\n\n') + extraWrite,
      proposal: parts.find((p) => p.proposal)?.proposal,
      productsSample: parts.find((p) => p.productsSample)?.productsSample,
      menuView: parts.find((p) => p.menuView)?.menuView,
      showAccountCard: parts.find((p) => p.showAccountCard)?.showAccountCard,
      ordersView: parts.find((p) => p.ordersView)?.ordersView,
      metricsView: parts.find((p) => p.metricsView)?.metricsView,
      customersView: parts.find((p) => p.customersView)?.customersView,
      auditId: parts.find((p) => p.auditId)?.auditId,
    };
    intent = ordered[ordered.length - 1] || intent;
  } else {
    result = await executeBusinessIntent({
      intent,
      userId: user.id,
      shop,
      userText: lastUser!.text,
      conversationHint: payload?.conversationHint,
      geminiReply,
      history: body.messages || [],
    });
  }

  const chipIntent: BusinessIntent =
    intent.kind === 'chat' ||
    intent.kind === 'escalate_human' ||
    intent.kind === 'help' ||
    intent.kind === 'refuse_sensitive'
      ? { kind: 'help' }
      : intent;

  return json(
    req,
    withResult(
      {
        ...baseAuth,
        selectedComercioId: shop.comercioId,
        chips: suggestBusinessChips({
          phase: 'turn',
          shop,
          intent: chipIntent,
          result,
        }),
      },
      result,
    ),
  );
}
