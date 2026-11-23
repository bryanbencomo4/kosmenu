import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSuggestedReplies } from '../app/v/[id]/_components/chat/ChatSuggestedReplies';
import type { ChatCatalogSnapshot } from '../app/v/[id]/_components/chat/chat-catalog';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const chat = (name: string) => read(`app/v/[id]/_components/chat/${name}`);

const cat = (id: string, name: string) => ({
  id,
  name,
  imageUrl: null,
  productCount: 1,
  availableCount: 1,
});
const catalog: ChatCatalogSnapshot = {
  currency: 'USD',
  categories: [cat('a', 'Pizzas'), cat('b', 'Bebidas'), cat('c', 'Postres'), cat('d', 'Extras')],
  products: [],
};

describe('buildSuggestedReplies', () => {
  it('shows first 3 categories + Ver menú + Recomiéndame when the cart is empty', () => {
    const chips = buildSuggestedReplies({ catalog, cartCount: 0 });
    expect(chips.map((c) => c.label)).toEqual([
      'Pizzas',
      'Bebidas',
      'Postres',
      'Ver menú',
      'Recomiéndame algo',
    ]);
    expect(chips[3]!.action).toEqual({ type: 'catalog', categoryId: null });
    expect(chips[4]!.action).toEqual({ type: 'text', text: 'Recomiéndame algo' });
  });

  it('adds Ir al carrito when the cart has items and stays within 5 chips', () => {
    const chips = buildSuggestedReplies({ catalog, cartCount: 2 });
    expect(chips.length).toBeLessThanOrEqual(5);
    expect(chips.map((c) => c.label)).toContain('Ir al carrito');
    expect(chips.find((c) => c.id === 'cart')!.action).toEqual({ type: 'cart' });
  });

  it('after a category: Ver todos (that category) + other categories', () => {
    const chips = buildSuggestedReplies({ catalog, cartCount: 0, activeCategoryId: 'a' });
    expect(chips[0]).toMatchObject({
      label: 'Ver todos',
      action: { type: 'catalog', categoryId: 'a' },
    });
    expect(chips.map((c) => c.label)).not.toContain('Pizzas');
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(chips.length).toBeLessThanOrEqual(5);
  });

  it('falls back to free-form chips without a catalog', () => {
    const chips = buildSuggestedReplies({ catalog: null, cartCount: 1 });
    expect(chips.every((c) => c.action.type === 'text' || c.action.type === 'cart')).toBe(true);
    expect(chips.length).toBeGreaterThanOrEqual(3);
  });
});

describe('chat UX wiring (source assertions)', () => {
  it('suggested replies sit above the composer with the data attribute', () => {
    expect(chat('ChatSuggestedReplies.tsx')).toMatch(/data-chat-suggested-replies="1"/);
    const view = chat('ChatAssistantView.tsx');
    expect(view.indexOf('<ChatSuggestedReplies')).toBeLessThan(view.indexOf('<ChatComposer'));
    expect(view).toMatch(/hidden=\{isTyping \|\| recording \|\| supervisionClosed\}/);
    expect(view).toMatch(/buildContextualQuickReplies/);
  });

  it('both carousels receive onSeeAll whenever onSeeAllCatalog exists', () => {
    const bubble = chat('ChatMessageBubble.tsx');
    expect(bubble).toMatch(/onSeeAllCatalog\(message\.catalogCategoryId \?\? null\)/);
    expect(bubble).toMatch(/onSeeAllCatalog \? \(\) => onSeeAllCatalog\(null\)/);
    expect(chat('ChatProductCarousel.tsx')).toMatch(/data-chat-see-all="1"/);
    expect(chat('ChatProductCarousel.tsx')).toMatch(/min-h-\[42px\]/);
    expect(chat('ChatProductCarousel.tsx')).toMatch(/<LayoutGrid /);
    expect(chat('ChatProductCarousel.tsx')).not.toMatch(/sticky bottom-0/);
  });

  it('scroller supports mouse/pen drag with grab cursors', () => {
    const s = chat('ChatHorizontalScroller.tsx');
    expect(s).toMatch(/onPointerDown/);
    expect(s).toMatch(/setPointerCapture/);
    expect(s).toMatch(/cursor-grab/);
    expect(s).toMatch(/active:cursor-grabbing/);
    expect(s).toMatch(/pointerType === 'touch'/);
    expect(s).toMatch(/data-chat-h-scroll-next/);
    expect(s).toMatch(/data-chat-h-scroll-prev/);
  });

  it('cart button + add buttons are wired to fly-to-cart', () => {
    expect(chat('ChatHeader.tsx')).toMatch(/data-chat-cart-button="1"/);
    for (const f of ['ChatProductCarousel.tsx', 'ChatProductCard.tsx', 'ChatCatalogSheet.tsx']) {
      expect(chat(f)).toMatch(/flyToCart/);
    }
    expect(chat('ChatAssistantView.tsx')).toMatch(/flyToCart/);
    expect(chat('chat-fly-to-cart.ts')).toMatch(/playChatSound\('cartAdd'\)/);
  });

  it('message list is windowed, bottom-first and exposes the window attr', () => {
    const list = chat('ChatMessageList.tsx');
    expect(list).toMatch(/data-chat-history-window=\{visibleCount\}/);
    expect(list).toMatch(/CHAT_HISTORY_INITIAL_WINDOW = 40/);
    expect(list).toMatch(/CHAT_HISTORY_PAGE = 30/);
    expect(list).toMatch(/messages\.slice\(-visibleCount\)/);
    expect(list).toMatch(/scrollToEnd\('auto'\)/);
    expect(list).not.toMatch(/\.scrollIntoView\(/);
  });

  it('voice: never runs a Gemini turn on the placeholder; always tries server STT when live', () => {
    const view = chat('ChatAssistantView.tsx');
    expect(view).toMatch(/No pude entender la nota de voz\. ¿Puedes escribirlo o intentar de nuevo\?/);
    expect(view).toMatch(/if \(live \|\| !browserTranscript\)/);
    expect(view).not.toMatch(/runAssistantTurn\(text, nextMessages\)\s*;\s*\},\s*\[isTyping, messages, runAssistantTurn, comercioId\]/);
    expect(chat('ChatComposer.tsx')).toMatch(/withLatestTranscript/);
  });
});
