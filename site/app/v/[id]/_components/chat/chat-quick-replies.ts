/**
 * Deterministic contextual quick replies for the chat composer strip.
 * Never invents product options — only labels from catalog / close-sale / intents.
 */
import type { ChatCatalogSnapshot } from './chat-catalog';
import type { ChatCloseSalePrompt, ChatMessage } from './chat-types';
import {
  buildSuggestedReplies,
  type ChatSuggestedAction,
  type ChatSuggestedChip,
} from './ChatSuggestedReplies';
import { matchContactIntent } from './chat-contact';

export type ChatQuickReplyContextKind =
  | 'idle'
  | 'size_or_flavor'
  | 'close_sale'
  | 'discovery'
  | 'claim'
  | 'checkout_ready';

export type ChatQuickReplyContext = {
  id: string;
  kind: ChatQuickReplyContextKind;
  productId?: string | null;
  createdAt: number;
};

export type ChatContextualChip = ChatSuggestedChip & {
  /** When set, chip is only actionable while this context is active. */
  contextId?: string;
};

const MAX_VISIBLE = 4;
const OPTION_CHIP_CAP = 3;

function newContextId(kind: string): string {
  return `qr_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function chip(
  id: string,
  label: string,
  action: ChatSuggestedAction,
  contextId: string,
): ChatContextualChip {
  return { id, label, action, contextId };
}

/** Parse “Normal o Grande” style questions into chip labels. */
export function extractChoiceLabelsFromAssistantText(text: string): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  const orMatch = t.match(
    /(?:prefieres|elige|elige entre|quieres)?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.\- ]+?)\s+o\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.\- ]+?)(?:\s*\?|$)/i,
  );
  if (orMatch) {
    return [orMatch[1]!.trim(), orMatch[2]!.trim()].filter(
      (x) => x.length > 0 && x.length <= 24,
    );
  }
  return [];
}

export function extractLabelsFromOptionHints(
  hints: string[] | undefined,
): string[] {
  if (!hints?.length) return [];
  const out: string[] = [];
  for (const h of hints) {
    const m = h.match(/:\s*(.+?)(?:\s*\(|$)/);
    const body = (m?.[1] || h).trim();
    for (const part of body.split(/[/|,]/)) {
      const label = part.replace(/\(.*?\)/g, '').trim();
      if (label && label.length <= 28 && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

/**
 * Build contextual chips. Structured conversation state wins over idle catalog chips.
 */
export function buildContextualQuickReplies(input: {
  catalog?: ChatCatalogSnapshot | null;
  cartCount: number;
  messages: ChatMessage[];
  activeCategoryId?: string | null;
  hasPaymentMethods?: boolean;
  hasBusinessLocation?: boolean;
  hasBusinessHours?: boolean;
  hasWhatsApp?: boolean;
  /** Session: user declined complements */
  suppressComplements?: boolean;
}): {
  chips: ChatContextualChip[];
  context: ChatQuickReplyContext | null;
} {
  const {
    catalog,
    cartCount,
    messages,
    suppressComplements = false,
  } = input;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  // Claim / human support — no commercial chips
  if (lastUser && matchContactIntent(lastUser.text)) {
    const contextId = newContextId('claim');
    const chips: ChatContextualChip[] = [];
    if (input.hasWhatsApp) {
      chips.push(
        chip(
          'contact-wa',
          'Contactar restaurante',
          { type: 'contact' },
          contextId,
        ),
      );
    }
    chips.push(
      chip(
        'contact-info',
        'Ver atención',
        { type: 'text', text: 'Quiero el WhatsApp del local' },
        contextId,
      ),
    );
    return {
      chips: chips.slice(0, MAX_VISIBLE),
      context: {
        id: contextId,
        kind: 'claim',
        createdAt: Date.now(),
      },
    };
  }

  // Pending close-sale on latest assistant message
  const closeSaleMsg = [...messages]
    .reverse()
    .find(
      (m) =>
        m.role === 'assistant' &&
        m.closeSale &&
        (m.closeSale.status === 'pending' ||
          m.closeSale.status === 'answered_more'),
    );
  const closeSale: ChatCloseSalePrompt | undefined =
    closeSaleMsg?.closeSale ?? undefined;
  if (closeSale && closeSale.status === 'pending') {
    const contextId = closeSale.id || newContextId('close');
    const chips: ChatContextualChip[] = [
      chip(
        'pay',
        'Estoy listo para pagar',
        { type: 'text', text: 'Estoy listo para pagar' },
        contextId,
      ),
    ];
    if (!suppressComplements) {
      chips.push(
        chip(
          'more',
          'Quiero algo más',
          { type: 'text', text: 'Sí, quiero algo más' },
          contextId,
        ),
      );
      const drinkCat = catalog?.categories.find((c) =>
        /bebida|refresco|drink/i.test(c.name),
      );
      if (drinkCat) {
        chips.push(
          chip(
            'drinks',
            'Ver bebidas',
            { type: 'catalog', categoryId: drinkCat.id },
            contextId,
          ),
        );
      }
    }
    chips.push(
      chip('fin', 'Finalizar pedido', { type: 'checkout' }, contextId),
    );
    return {
      chips: chips.slice(0, MAX_VISIBLE),
      context: {
        id: contextId,
        kind: 'close_sale',
        createdAt: Date.now(),
      },
    };
  }

  // Option chips from product cards on last assistant turn
  if (lastAssistant?.productCards?.length) {
    const card = lastAssistant.productCards[0]!;
    const fromHints = extractLabelsFromOptionHints(card.option_hints);
    const fromText = extractChoiceLabelsFromAssistantText(lastAssistant.text);
    const labels = (fromHints.length ? fromHints : fromText).slice(
      0,
      OPTION_CHIP_CAP,
    );
    if (labels.length >= 2) {
      const contextId = newContextId('opts');
      const chips = labels.map((label) =>
        chip(
          `opt-${label}`,
          label,
          { type: 'text', text: label },
          contextId,
        ),
      );
      if (
        fromHints.length > OPTION_CHIP_CAP ||
        (card.option_hints?.length ?? 0) > 1
      ) {
        chips.push(
          chip(
            'see-all-opts',
            'Ver todas',
            {
              type: 'configure_product',
              productId: card.product_id,
            },
            contextId,
          ),
        );
      }
      return {
        chips: chips.slice(0, MAX_VISIBLE),
        context: {
          id: contextId,
          kind: 'size_or_flavor',
          productId: card.product_id,
          createdAt: Date.now(),
        },
      };
    }
  }

  // Textual size question without cards
  if (lastAssistant) {
    const labels = extractChoiceLabelsFromAssistantText(lastAssistant.text);
    if (labels.length >= 2) {
      const contextId = newContextId('ask');
      return {
        chips: labels
          .slice(0, OPTION_CHIP_CAP)
          .map((label) =>
            chip(
              `ask-${label}`,
              label,
              { type: 'text', text: label },
              contextId,
            ),
          ),
        context: {
          id: contextId,
          kind: 'size_or_flavor',
          createdAt: Date.now(),
        },
      };
    }
  }

  // Discovery / recommend
  if (
    lastUser &&
    /\b(recomiend|no s[eé] qu[eé]|tengo hambre|qu[eé] me sugieres)\b/i.test(
      lastUser.text,
    )
  ) {
    const contextId = newContextId('disc');
    const chips: ChatContextualChip[] = [
      chip(
        'rec',
        'Recomiéndame',
        { type: 'text', text: 'Recomiéndame algo' },
        contextId,
      ),
      chip(
        'cheap',
        'Más económicos',
        { type: 'text', text: '¿Qué es lo más económico?' },
        contextId,
      ),
    ];
    if (catalog?.categories.length) {
      chips.push(
        chip(
          'cats',
          'Ver categorías',
          { type: 'catalog', categoryId: null },
          contextId,
        ),
      );
    }
    return {
      chips: chips.slice(0, MAX_VISIBLE),
      context: { id: contextId, kind: 'discovery', createdAt: Date.now() },
    };
  }

  // Cart ready — idle chips + finalize
  const idle = buildSuggestedReplies({
    catalog,
    cartCount,
    activeCategoryId: input.activeCategoryId,
    hasPaymentMethods: input.hasPaymentMethods,
    hasBusinessLocation: input.hasBusinessLocation,
    hasBusinessHours: input.hasBusinessHours,
    hasWhatsApp: input.hasWhatsApp,
  });

  if (
    cartCount > 0 &&
    !idle.some((c) => c.id === 'checkout' || c.action.type === 'checkout')
  ) {
    idle.unshift({
      id: 'checkout',
      label: 'Finalizar pedido',
      action: { type: 'checkout' },
    });
  }

  return {
    chips: idle.slice(0, MAX_VISIBLE + 1),
    context: cartCount > 0
      ? {
          id: newContextId('cart'),
          kind: 'checkout_ready',
          createdAt: Date.now(),
        }
      : null,
  };
}

/** Validate chip still belongs to the active context (or idle). */
export function isQuickReplyActionable(
  chip: ChatContextualChip,
  activeContextId: string | null | undefined,
): boolean {
  if (!chip.contextId) return true;
  if (!activeContextId) return true;
  return chip.contextId === activeContextId;
}
