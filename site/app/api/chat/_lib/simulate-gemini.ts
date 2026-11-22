/**
 * Local-only Gemini simulator for Phase 3.1 visual / integration tests.
 * Enabled with CHATBOT_SIMULATE_GEMINI=1. Never calls Google. Never creates orders.
 */
import type { ChatCartAction, ChatProductCard } from './cart-proposals';
import {
  prepareCartLineProposal,
  proposeRemoveFromSnapshot,
  summarizeCartSnapshot,
  type ChatCartSnapshotLine,
} from './cart-proposals';
import { getDeliveryConditions } from './delivery-conditions';
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';
import { executeChatTool } from './tools';

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function isGeminiSimulationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if ((env.NODE_ENV || '').trim() === 'production') return false;
  const raw = (env.CHATBOT_SIMULATE_GEMINI ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export type SimulatedChatResult = {
  text: string;
  model: 'simulated';
  tokensInput: number;
  tokensOutput: number;
  toolCalls: number;
  geminiHttpCalls: 0;
  cartActions: ChatCartAction[];
  productCards: ChatProductCard[];
  skippedLlm: true;
};

export function runSimulatedChat(params: {
  menu: LoadedPublicMenu;
  commerceId: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  cartSnapshot?: ChatCartSnapshotLine[];
}): SimulatedChatResult {
  const last =
    [...params.messages].reverse().find((m) => m.role === 'user')?.text || '';
  const q = norm(last);
  const cart = params.cartSnapshot || [];
  const actions: ChatCartAction[] = [];
  const cards: ChatProductCard[] = [];
  let toolCalls = 0;

  const pushReady = (input: {
    product_name: string;
    quantity?: number;
    option_labels?: string[];
  }) => {
    toolCalls += 1;
    const r = prepareCartLineProposal(params.menu, params.commerceId, input);
    if (r.status === 'ready') {
      actions.push(r.action);
      cards.push(r.action.product_card);
      return r;
    }
    if (r.status === 'needs_options') {
      cards.push(r.product_card);
      return r;
    }
    return r;
  };

  // Scenario A: two Hawaianas with sizes (also covers voice STT compound orders
  // that mention an unavailable drink like Coca-Cola — propose pizzas first).
  if (
    /hawaiana/.test(q) &&
    (/dos|2/.test(q) || (/grande/.test(q) && /normal/.test(q)))
  ) {
    const a = pushReady({
      product_name: 'Hawaiana',
      quantity: 1,
      option_labels: ['Grande'],
    });
    const b = pushReady({
      product_name: 'Hawaiana',
      quantity: 1,
      option_labels: ['Normal'],
    });
    if (a.status === 'ready' && b.status === 'ready') {
      const missingCoke = /coca/.test(q);
      let drinkNote = '';
      if (missingCoke) {
        toolCalls += 1;
        const coke = prepareCartLineProposal(params.menu, params.commerceId, {
          product_name: 'Coca-Cola',
          quantity: 1,
        });
        if (coke.status === 'ready') {
          actions.push(coke.action);
          cards.push(coke.action.product_card);
        } else {
          const drinks = executeChatTool(
            { menu: params.menu, commerceId: params.commerceId },
            'search_products',
            { category: 'BEBIDAS', available_only: true, limit: 6 },
          ) as { results: Array<{ name: string }> };
          const names = (drinks.results || []).map((d) => d.name);
          drinkNote =
            names.length > 0
              ? ` Coca-Cola no está en el menú; bebidas disponibles: ${names.slice(0, 4).join(', ')}.`
              : ' Coca-Cola no está disponible en el menú.';
        }
      }
      return {
        text: missingCoke
          ? `Perfecto: preparé dos Hawaianas — una Grande y una Normal. Confirma cada tarjeta para agregarlas al carrito.${drinkNote}`
          : 'Perfecto: preparé dos Hawaianas — una Grande y una Normal. Confirma cada tarjeta para agregarlas al carrito.',
        model: 'simulated',
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls,
        geminiHttpCalls: 0,
        cartActions: actions,
        productCards: cards,
        skippedLlm: true,
      };
    }
  }

  // Single Hawaiana without size
  if (/hawaiana/.test(q) && !/grande|normal/.test(q)) {
    const r = pushReady({ product_name: 'Hawaiana', quantity: 1 });
    if (r.status === 'needs_options') {
      return {
        text: `¡Claro! ¿La prefieres ${r.missing_groups[0]?.choices.join(' o ') || 'Normal o Grande'}?`,
        model: 'simulated',
        tokensInput: 0,
        tokensOutput: 0,
        toolCalls,
        geminiHttpCalls: 0,
        cartActions: [],
        productCards: cards,
        skippedLlm: true,
      };
    }
  }

  // Scenario B: add a drink (skip when the turn already asked for pizzas/hawaiana)
  if (
    /bebida|refresco|coca|agua/.test(q) &&
    !/quita|sacar|elimina/.test(q) &&
    !/hawaiana|pizza/.test(q)
  ) {
    toolCalls += 1;
    const drinks = executeChatTool(
      { menu: params.menu, commerceId: params.commerceId },
      'search_products',
      { category: 'BEBIDAS', available_only: true, limit: 8 },
    ) as { results: Array<{ id: string; name: string; price_min: number }> };
    if (/coca/.test(q)) {
      const r = pushReady({ product_name: 'Coca-Cola', quantity: 1 });
      if (r.status === 'ready') {
        return {
          text: 'Listo: Coca-Cola. Confirma para agregarla.',
          model: 'simulated',
          tokensInput: 0,
          tokensOutput: 0,
          toolCalls,
          geminiHttpCalls: 0,
          cartActions: actions,
          productCards: cards,
          skippedLlm: true,
        };
      }
    }
    const names = (drinks.results || []).map((d) => d.name);
    const catalogProducts = params.menu.productos as Array<{
      id?: string | null;
    }>;
    for (const d of drinks.results || []) {
      const p = catalogProducts.find((x) => x.id === d.id);
      if (p?.id) {
        const card = prepareCartLineProposal(params.menu, params.commerceId, {
          product_id: p.id,
          quantity: 1,
        });
        if (card.status === 'ready') cards.push(card.action.product_card);
        else if ('product_card' in card && card.product_card)
          cards.push(card.product_card);
      }
    }
    return {
      text:
        names.length > 1
          ? `Tenemos varias bebidas: ${names.join(', ')}. ¿Cuál deseas?`
          : names.length === 1
            ? `Puedo agregar ${names[0]}. ¿La confirmas?`
            : 'No encontré bebidas disponibles ahora.',
      model: 'simulated',
      tokensInput: 0,
      tokensOutput: 0,
      toolCalls,
      geminiHttpCalls: 0,
      cartActions: actions,
      productCards: cards,
      skippedLlm: true,
    };
  }

  // Scenario C: remove grande pizza
  if (/quita|sacar|elimina|remover/.test(q) && /grande|pizza|hawaiana/.test(q)) {
    toolCalls += 1;
    const rem = proposeRemoveFromSnapshot(
      params.menu,
      params.commerceId,
      cart,
      /grande/.test(q) ? 'Hawaiana' : last,
    );
    // Prefer matching Grande line if present
    const summary = summarizeCartSnapshot(params.menu, params.commerceId, cart);
    const grande = summary.lines.find((l) => /grande/i.test(l.label) || /grande/i.test(l.name));
    if (grande) {
      actions.push({
        type: 'propose_remove',
        requires_confirmation: true,
        proposal_id: `rm_${grande.cart_key}`,
        catalog_fingerprint: null,
        cart_key: grande.cart_key,
        product_id: grande.product_id,
        label: `Quitar ${grande.label}`,
      });
    } else if (!('error' in rem)) {
      actions.push(rem);
    }
    return {
      text: actions.length
        ? '¿Confirmas quitar esa pizza del carrito?'
        : 'No encontré esa pizza en tu carrito actual.',
      model: 'simulated',
      tokensInput: 0,
      tokensOutput: 0,
      toolCalls,
      geminiHttpCalls: 0,
      cartActions: actions,
      productCards: [],
      skippedLlm: true,
    };
  }

  // Delivery (before generic “cuánto” so “cuánto cuesta el delivery” does not hit cart)
  if (/delivery|domicilio|envio|env[ií]o/.test(q)) {
    toolCalls += 1;
    const d = getDeliveryConditions(params.menu);
    const overview = (d.fee_overview || []).slice(0, 4).join('; ');
    const text = d.delivery_enabled
      ? [
          'Sí, tenemos delivery.',
          overview
            ? `Referencia (${d.tariff_currency}): ${overview}.`
            : null,
          d.requires_customer_address
            ? 'El cargo exacto depende de tu dirección/zona y se confirma en el checkout.'
            : d.exact_fee_label
              ? `Tarifa: ${d.exact_fee_label}.`
              : null,
          !d.currencies_match
            ? `Menú en ${d.menu_currency}; delivery en ${d.tariff_currency} (no se suman directamente).`
            : null,
        ]
          .filter(Boolean)
          .join(' ')
      : 'Delivery no está habilitado ahora. Puedes elegir para llevar.';
    return {
      text,
      model: 'simulated',
      tokensInput: 0,
      tokensOutput: 0,
      toolCalls,
      geminiHttpCalls: 0,
      cartActions: [],
      productCards: [],
      skippedLlm: true,
    };
  }

  // Scenario D: how much spent
  if (/gastado|subtotal|total del carrito|cu[aá]nto llevo|cu[aá]nto gasto/.test(q)) {
    toolCalls += 1;
    const snap = summarizeCartSnapshot(params.menu, params.commerceId, cart);
    return {
      text:
        snap.lines.length === 0
          ? 'Tu carrito está vacío.'
          : `Llevas ${snap.item_count} ítem(s). Subtotal ${snap.subtotal_label} (moneda del menú). El delivery, si aplica, se confirma en checkout.`,
      model: 'simulated',
      tokensInput: 0,
      tokensOutput: 0,
      toolCalls,
      geminiHttpCalls: 0,
      cartActions:
        snap.lines.length > 0
          ? [
              {
                type: 'open_checkout',
                requires_confirmation: true,
                proposal_id: 'checkout_1',
                catalog_fingerprint: null,
                label: 'Continuar con mi pedido',
              },
            ]
          : [],
      productCards: [],
      skippedLlm: true,
    };
  }

  // Scenario E: place order / checkout
  if (/pedido|pagar|checkout|continuar/.test(q)) {
    return {
      text: '¡Perfecto! Ya puedes revisar y continuar con el pago en el checkout.',
      model: 'simulated',
      tokensInput: 0,
      tokensOutput: 0,
      toolCalls: 0,
      geminiHttpCalls: 0,
      cartActions: [
        {
          type: 'open_checkout',
          requires_confirmation: true,
          proposal_id: 'checkout_open',
          catalog_fingerprint: null,
          label: 'Continuar con mi pedido',
        },
      ],
      productCards: [],
      skippedLlm: true,
    };
  }

  return {
    text: 'Puedo ayudarte a armar tu pedido. Prueba con “dos Hawaianas, una Grande y otra Normal” o “agrega una bebida”.',
    model: 'simulated',
    tokensInput: 0,
    tokensOutput: 0,
    toolCalls: 0,
    geminiHttpCalls: 0,
    cartActions: [],
    productCards: [],
    skippedLlm: true,
  };
}
