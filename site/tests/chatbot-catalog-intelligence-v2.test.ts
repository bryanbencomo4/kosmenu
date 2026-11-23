import { describe, expect, it } from 'vitest';
import type { LoadedPublicMenu } from '../app/api/menu/_lib/load-public-menu';
import { searchCatalog } from '../app/api/chat/_lib/catalog-search';
import { buildChatSystemPrompt } from '../app/api/chat/_lib/prompt';
import {
  detectCommercialIntent,
  recommendFromCatalog,
  findCheaperAlternatives,
  commercialPlaybookDigest,
} from '../app/api/chat/_lib/commercial-strategy';
import {
  buildContextualQuickReplies,
  extractChoiceLabelsFromAssistantText,
  extractLabelsFromOptionHints,
  isQuickReplyActionable,
} from '../app/v/[id]/_components/chat/chat-quick-replies';
import { matchContactIntent } from '../app/v/[id]/_components/chat/chat-contact';
import type { ChatMessage } from '../app/v/[id]/_components/chat/chat-types';
import type { ChatCatalogSnapshot } from '../app/v/[id]/_components/chat/chat-catalog';

function truenoLikeMenu(): LoadedPublicMenu {
  const commerceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  return {
    resolvedComercioId: commerceId,
    ownerId: 'owner-1',
    isOnline: true,
    comercioRow: { id: commerceId },
    comercio: {
      id: commerceId,
      slug: 'pizzas-el-trueno',
      nombre: 'pizzas el trueno',
      moneda: 'USD',
      en_linea: true,
      whatsapp: '+584140821633',
    } as any,
    categorias: [
      { id: 'cat-pizzas', nombre: 'Pizzas' },
      { id: 'cat-drinks', nombre: 'Bebidas' },
      { id: 'cat-extras', nombre: 'Extras' },
    ],
    productos: [
      {
        id: 'p-campesina',
        categoria_id: 'cat-pizzas',
        nombre: 'Campesina',
        descripcion: 'Maíz, pimentón, jamón, queso mozzarella',
        precio: 3.5,
        disponible: true,
        opciones_menu: {
          activadas: true,
          grupos: [
            {
              id: 'g-size',
              nombre: 'Tamaños',
              tipo: 'unica',
              obligatorio: true,
              min: 1,
              max: 1,
              opciones: [
                { id: 'o-n', nombre: 'Normal', precio: 0, activo: true },
                { id: 'o-g', nombre: 'Grande', precio: 5.25, activo: true },
              ],
            },
          ],
        },
      },
      {
        id: 'p-hawaiana',
        categoria_id: 'cat-pizzas',
        nombre: 'Hawaiana',
        descripcion: 'Piña, jamón, queso mozzarella',
        precio: 3.5,
        disponible: true,
        opciones_menu: {
          activadas: true,
          grupos: [
            {
              id: 'g-size',
              nombre: 'Tamaños',
              tipo: 'unica',
              obligatorio: true,
              min: 1,
              max: 1,
              opciones: [
                { id: 'o-n', nombre: 'Normal', precio: 0, activo: true },
                { id: 'o-g', nombre: 'Grande', precio: 5.25, activo: true },
              ],
            },
          ],
        },
      },
      {
        id: 'p-refresco-2lt',
        categoria_id: 'cat-drinks',
        nombre: 'Refresco de 2 Lt.',
        descripcion: 'Botella familiar',
        precio: 2.5,
        disponible: true,
        opciones_menu: {
          activadas: true,
          grupos: [
            {
              id: 'g-flavor',
              nombre: 'Sabores',
              tipo: 'unica',
              obligatorio: true,
              min: 1,
              max: 1,
              opciones: [
                { id: 'o-coca', nombre: 'Coca-Cola', precio: 0, activo: true },
                { id: 'o-pepsi', nombre: 'Pepsi', precio: 0, activo: true },
                { id: 'o-colita', nombre: 'Colita', precio: 0, activo: true },
              ],
            },
          ],
        },
      },
      {
        id: 'p-agua',
        categoria_id: 'cat-drinks',
        nombre: 'Agua 500 ml',
        precio: 1,
        disponible: true,
      },
      {
        id: 'p-queso',
        categoria_id: 'cat-extras',
        nombre: 'Extra queso',
        descripcion: 'Porción generosa de mozzarella',
        precio: 1.5,
        disponible: true,
      },
    ],
    metodosPago: [],
    checkoutExchange: {} as any,
    marketRates: null,
    upsellSettings: null,
    upsellRules: [],
    bundles: [],
    preCheckoutUpsell: null as any,
  };
}

describe('Catalog Intelligence V2 — search', () => {
  const menu = truenoLikeMenu();

  it('finds Campesina by name without exact casing', () => {
    const r = searchCatalog(menu, { query: 'Quiero una pizza Campesina' });
    expect(r.count).toBeGreaterThan(0);
    expect(r.hits[0]!.product.nombre).toMatch(/Campesina/i);
  });

  it('finds Campesina with short query "tienes campesina?"', () => {
    const r = searchCatalog(menu, { query: 'Tienes campesina?' });
    expect(r.hits.some((h) => /Campesina/i.test(h.product.nombre || ''))).toBe(
      true,
    );
  });

  it('finds Refresco 2L via Coca-Cola option (not inventing a SKU)', () => {
    const r = searchCatalog(menu, { query: 'Quiero una cocacola de dos litros' });
    expect(r.count).toBeGreaterThan(0);
    const hit = r.hits[0]!;
    expect(hit.product.nombre).toMatch(/Refresco/i);
    expect(hit.product.id).toBe('p-refresco-2lt');
    // Prefer option match; always surface the flavor for prepare_cart_line_proposal
    expect(
      hit.matched_field === 'option_value' ||
        /Coca-Cola/i.test(hit.matched_option || '') ||
        hit.suggested_option_labels.some((l) => /Coca-Cola/i.test(l)),
    ).toBe(true);
  });

  it('finds drink by "refresco 2L sabor Coca-Cola"', () => {
    const r = searchCatalog(menu, {
      query: 'Un refresco 2L sabor Coca-Cola',
    });
    expect(r.hits[0]!.product.id).toBe('p-refresco-2lt');
  });

  it('finds pizza by ingredients maíz + pimentón', () => {
    const r = searchCatalog(menu, {
      query: 'Una pizza con maíz y pimentón',
    });
    expect(r.hits.some((h) => h.product.id === 'p-campesina')).toBe(true);
  });

  it('finds pizza with "bastante queso" via description/extra', () => {
    const cheese = searchCatalog(menu, { query: 'pizza con bastante queso' });
    expect(cheese.count).toBeGreaterThan(0);
  });

  it('does not invent products for nonsense queries', () => {
    const r = searchCatalog(menu, { query: 'sushi espacial pluton' });
    expect(r.count).toBe(0);
  });
});

describe('Catalog Intelligence V2 — commercial + prompt', () => {
  it('prompt includes commercial playbook and no fixed Coca-Cola denial example', () => {
    const prompt = buildChatSystemPrompt({
      businessName: 'pizzas el trueno',
      currency: 'USD',
    });
    expect(prompt).toMatch(/PRIORIZA las líneas que SÍ existen/i);
    expect(prompt).toMatch(/NUNCA bloquees ni omitas/i);
    expect(prompt).toContain(commercialPlaybookDigest().slice(0, 40));
    expect(prompt).toMatch(/matched_option|suggested_option_labels/i);
    expect(prompt).not.toMatch(/Coca-Cola no (está|existe|disponible)/i);
  });

  it('detects buy / budget / claim intents', () => {
    expect(detectCommercialIntent('Me llevo la Campesina Grande')).toBe(
      'buy_intent',
    );
    expect(detectCommercialIntent('Tengo diez dólares')).toBe('budget');
    expect(detectCommercialIntent('Quiero reclamar mi pedido')).toBe(
      'human_support',
    );
  });

  it('recommendFromCatalog returns real SKUs only', () => {
    const menu = truenoLikeMenu();
    const rec = recommendFromCatalog(menu, { limit: 3 });
    expect(rec.results.length).toBeGreaterThan(0);
    expect(
      rec.results.every((p) =>
        menu.productos.some((m) => (m as { id: string }).id === p.id),
      ),
    ).toBe(true);
  });

  it('findCheaperAlternatives stays under reference product', () => {
    const menu = truenoLikeMenu();
    const alt = findCheaperAlternatives(menu, 'p-campesina', 5);
    expect(alt.alternatives.every((a) => a.price_min < 3.5)).toBe(true);
  });
});

describe('Catalog Intelligence V2 — contextual quick replies', () => {
  const catalog: ChatCatalogSnapshot = {
    currency: 'USD',
    categories: [
      {
        id: 'cat-pizzas',
        name: 'Pizzas',
        imageUrl: null,
        productCount: 2,
        availableCount: 2,
      },
      {
        id: 'cat-drinks',
        name: 'Bebidas',
        imageUrl: null,
        productCount: 2,
        availableCount: 2,
      },
    ],
    products: [],
  };

  it('parses Normal o Grande from assistant text', () => {
    expect(
      extractChoiceLabelsFromAssistantText('¿Prefieres Normal o Grande?'),
    ).toEqual(['Normal', 'Grande']);
  });

  it('parses Sabores hints into labels', () => {
    expect(
      extractLabelsFromOptionHints(['Sabores: Coca-Cola/Pepsi/Colita']),
    ).toEqual(['Coca-Cola', 'Pepsi', 'Colita']);
  });

  it('shows size chips when assistant asks Normal o Grande', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: '¿Prefieres Normal o Grande?',
        createdAt: Date.now(),
      } as ChatMessage,
    ];
    const { chips, context } = buildContextualQuickReplies({
      catalog,
      cartCount: 0,
      messages,
    });
    expect(chips.map((c) => c.label)).toEqual(
      expect.arrayContaining(['Normal', 'Grande']),
    );
    expect(context?.kind).toBe('size_or_flavor');
  });

  it('shows claim chips for complaint intents', () => {
    expect(matchContactIntent('quiero reclamar mi pedido')).toBe(true);
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        text: 'quiero reclamar mi pedido',
        createdAt: Date.now(),
      } as ChatMessage,
    ];
    const { chips, context } = buildContextualQuickReplies({
      catalog,
      cartCount: 0,
      messages,
      hasWhatsApp: true,
    });
    expect(context?.kind).toBe('claim');
    expect(chips.some((c) => /Contactar|atención|atencion/i.test(c.label))).toBe(
      true,
    );
  });

  it('close-sale chips include pay + finalize', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        text: '¿Listo para pagar o quieres algo más?',
        createdAt: Date.now(),
        closeSale: {
          id: 'cs1',
          status: 'pending',
          pendingProducts: [],
        },
      } as ChatMessage,
    ];
    const { chips, context } = buildContextualQuickReplies({
      catalog,
      cartCount: 1,
      messages,
    });
    expect(context?.kind).toBe('close_sale');
    expect(chips.some((c) => /pagar/i.test(c.label))).toBe(true);
    expect(chips.some((c) => c.action.type === 'checkout')).toBe(true);
  });

  it('rejects stale context chips', () => {
    expect(
      isQuickReplyActionable(
        {
          id: 'x',
          label: 'Normal',
          action: { type: 'text', text: 'Normal' },
          contextId: 'old',
        },
        'new',
      ),
    ).toBe(false);
    expect(
      isQuickReplyActionable(
        {
          id: 'x',
          label: 'Menú',
          action: { type: 'catalog', categoryId: null },
        },
        'any',
      ),
    ).toBe(true);
  });
});
