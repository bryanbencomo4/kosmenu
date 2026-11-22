'use client';

import { ChatHorizontalScroller } from './ChatHorizontalScroller';
import type { ChatCatalogSnapshot } from './chat-catalog';

export type ChatSuggestedAction =
  | { type: 'category'; categoryId: string }
  | { type: 'catalog'; categoryId: string | null }
  | { type: 'cart' }
  | { type: 'payments' }
  | { type: 'text'; text: string };

export type ChatSuggestedChip = {
  id: string;
  label: string;
  action: ChatSuggestedAction;
};

const MAX_CHIPS = 5;

/**
 * Contextual quick replies (3–5) from catalog + cart state. Pure so it is testable.
 * - Fresh / no category in focus: first categories + "Ver menú" + cart / "Recomiéndame".
 * - After a category's products were shown: "Ver todos" + other categories.
 */
export function buildSuggestedReplies(input: {
  catalog?: ChatCatalogSnapshot | null;
  cartCount: number;
  /** Category whose products are the latest thing in the chat (null = none). */
  activeCategoryId?: string | null;
  /** When true, include a "Cómo pago" chip. */
  hasPaymentMethods?: boolean;
}): ChatSuggestedChip[] {
  const {
    catalog,
    cartCount,
    activeCategoryId = null,
    hasPaymentMethods = false,
  } = input;
  const hasCart = cartCount > 0;
  const chips: ChatSuggestedChip[] = [];
  const cartChip: ChatSuggestedChip = {
    id: 'cart',
    label: 'Ir al carrito',
    action: { type: 'cart' },
  };
  const payChip: ChatSuggestedChip = {
    id: 'payments',
    label: 'Cómo pago',
    action: { type: 'payments' },
  };
  const recommendChip: ChatSuggestedChip = {
    id: 'recommend',
    label: 'Recomiéndame algo',
    action: { type: 'text', text: 'Recomiéndame algo' },
  };

  const categories = catalog?.categories ?? [];
  if (catalog && categories.length > 0) {
    const catChip = (c: { id: string; name: string }): ChatSuggestedChip => ({
      id: `cat-${c.id}`,
      label: c.name,
      action: { type: 'category', categoryId: c.id },
    });
    const active = activeCategoryId
      ? categories.find((c) => c.id === activeCategoryId)
      : undefined;

    if (active) {
      chips.push({
        id: 'see-all',
        label: 'Ver todos',
        action: { type: 'catalog', categoryId: active.id },
      });
      chips.push(
        ...categories
          .filter((c) => c.id !== active.id)
          .slice(0, hasPaymentMethods || hasCart ? 1 : 2)
          .map(catChip),
      );
      if (hasPaymentMethods) chips.push(payChip);
      if (hasCart) chips.push(cartChip);
      chips.push(recommendChip);
    } else {
      chips.push(
        ...categories
          .slice(0, hasCart || hasPaymentMethods ? 2 : 3)
          .map(catChip),
      );
      chips.push({
        id: 'menu',
        label: 'Ver menú',
        action: { type: 'catalog', categoryId: null },
      });
      if (hasPaymentMethods) chips.push(payChip);
      if (hasCart) chips.push(cartChip);
      chips.push(recommendChip);
    }
    return chips.slice(0, MAX_CHIPS);
  }

  chips.push({
    id: 'menu',
    label: 'Ver menú',
    action: { type: 'text', text: 'Ver menú' },
  });
  if (hasPaymentMethods) chips.push(payChip);
  chips.push(recommendChip);
  if (hasCart) chips.push(cartChip);
  return chips.slice(0, MAX_CHIPS);
}

type ChatSuggestedRepliesProps = {
  chips: ChatSuggestedChip[];
  /** Hide while the assistant is replying or the user is recording. */
  hidden?: boolean;
  onPick: (chip: ChatSuggestedChip) => void;
};

export function ChatSuggestedReplies({
  chips,
  hidden = false,
  onPick,
}: ChatSuggestedRepliesProps) {
  if (hidden || chips.length === 0) return null;
  return (
    <div
      className="relative z-20 shrink-0 pt-1.5"
      style={{ backgroundColor: 'var(--chat-composer)' }}
      data-chat-suggested-replies="1"
    >
      <div className="mx-auto w-full max-w-5xl">
        <ChatHorizontalScroller ariaLabel="Respuestas sugeridas" snap={false}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              data-chat-suggested-chip={chip.id}
              onClick={() => onPick(chip)}
              className="shrink-0 whitespace-nowrap rounded-full border border-[var(--chat-card-border)] bg-[var(--chat-card)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--chat-text)] shadow-sm transition active:scale-[0.97] active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-send)]"
            >
              {chip.label}
            </button>
          ))}
        </ChatHorizontalScroller>
      </div>
    </div>
  );
}
