/**
 * Catalog + cart-proposal tools bound to a single LoadedPublicMenu snapshot.
 * Tools never mutate DB/orders; proposals are validated server-side for the UI.
 */
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';
import {
  getProductMaximumPrice,
  getProductMinimumPrice,
  getProductOptionsSummary,
  parseProductMenuOptions,
  productRequiresConfiguration,
} from '../../../_lib/menu-product-options';
import {
  buildProductCard,
  prepareCartLineProposal,
  proposeRemoveFromSnapshot,
  proposeUpdateQtyInSnapshot,
  summarizeCartSnapshot,
  type ChatCartAction,
  type ChatCartSnapshotLine,
  type ChatProductCard,
} from './cart-proposals';
import {
  resolveCatalogProduct,
  searchCatalog,
} from './catalog-search';
import {
  findCheaperAlternatives,
  recommendFromCatalog,
} from './commercial-strategy';
import {
  listBusinessScheduleDayRows,
  resolveBusinessScheduleStatus,
} from '../../_lib/business-hours';
import { buildWhatsAppHref } from '../../../_lib/whatsapp-href';
import {
  convertMenuPrice,
  formatChatMoney,
  listCheckoutCurrencies,
  resolveMenuCurrency,
} from './chat-currency';
import { getDeliveryConditions } from './delivery-conditions';

type ProductRow = {
  id: string;
  categoria_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  precio?: number | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
  imagen_url?: string | null;
};

type CategoryRow = {
  id: string;
  nombre?: string | null;
  imagen_url?: string | null;
};

export type ChatToolContext = {
  menu: LoadedPublicMenu;
  /** Hard-lock: tools only see this commerce id */
  commerceId: string;
  /** Authoritative cart from the client (shared with PublicMenuPage). */
  cartSnapshot?: ChatCartSnapshotLine[];
  /** Accumulated validated proposals for this turn (server → UI). */
  pendingActions?: ChatCartAction[];
  pendingCards?: ChatProductCard[];
  /** Categories from get_categories — UI renders a carousel, not a plain list. */
  pendingCategories?: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    productCount: number;
    availableCount: number;
  }>;
};

export const CHAT_TOOL_DECLARATIONS = [
  {
    name: 'search_products',
    description:
      'Busca en el catálogo REAL de este restaurante (nombre, descripción, categoría, sabores/opciones/tamaños). Devuelve ranking con matched_field / matched_option. Un resultado vacío no prueba ausencia absoluta: reformula o pregunta; no inventes productos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description:
            'Texto del cliente (ej. “pizza campesina”, “coca cola 2 litros”). Puede incluir sabor/tamaño.',
        },
        category: { type: 'STRING', description: 'Nombre de categoría opcional' },
        max_price: {
          type: 'NUMBER',
          description: 'Precio máximo (mínimo del producto) en moneda del menú',
        },
        available_only: {
          type: 'BOOLEAN',
          description: 'Si true, solo disponibles (default true)',
        },
        limit: { type: 'NUMBER', description: 'Máximo de resultados (1-12)' },
      },
    },
  },
  {
    name: 'get_product_details',
    description:
      'Detalle de un producto por id o nombre/sabor aproximado (también resuelve opciones como “Coca-Cola” → refresco padre). Incluye grupos de opciones.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING' },
        product_name: { type: 'STRING' },
      },
    },
  },
  {
    name: 'get_categories',
    description: 'Lista categorías del menú con conteo de productos disponibles.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_business_information',
    description: 'Nombre, horarios, dirección y datos públicos del restaurante.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_available_fulfillment_methods',
    description: 'Modalidades públicas: delivery, para llevar, comer aquí, WhatsApp.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'find_cheapest_products',
    description:
      'Consulta DETERMINISTA del servidor: productos más económicos por price_min real (base + opciones obligatorias). Usa esto cuando el cliente pida lo más barato/económico. Incluye empates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: {
          type: 'STRING',
          description: 'Filtrar por nombre de categoría (ej. PIZZAS)',
        },
        available_only: {
          type: 'BOOLEAN',
          description: 'Si true, solo disponibles (default true)',
        },
        limit: {
          type: 'NUMBER',
          description: 'Máximo de productos a devolver en el empate/top (1-15, default 8)',
        },
      },
    },
  },
  {
    name: 'recommend_products',
    description:
      'Recomendaciones DETERMINISTAS (2–4) según preferencias/presupuesto/consulta. Usa en discovery, “qué me recomiendas”, presupuesto u objeción de precio. No inventes atributos; lee reason de cada ítem.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Texto libre (ej. “con maíz y champiñones”)',
        },
        category: { type: 'STRING' },
        want_ingredients: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Ingredientes deseados',
        },
        avoid_ingredients: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Ingredientes a evitar',
        },
        max_price: {
          type: 'NUMBER',
          description: 'Presupuesto máximo (price_min)',
        },
        party_size: { type: 'NUMBER' },
        exclude_product_ids: {
          type: 'ARRAY',
          items: { type: 'STRING' },
        },
        complement_to_cart: {
          type: 'BOOLEAN',
          description: 'Prioriza bebidas/acompañantes si ya hay comida en carrito',
        },
        limit: { type: 'NUMBER', description: '2–4 (default 3)' },
      },
    },
  },
  {
    name: 'suggest_cheaper_alternatives',
    description:
      'Ante “está caro”: alternativas más baratas de la misma categoría que un producto de referencia (id).',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING' },
        limit: { type: 'NUMBER' },
      },
    },
  },
  {
    name: 'get_delivery_conditions',
    description:
      'Consulta DETERMINISTA de delivery: zonas/tarifas reales, moneda de tarifa vs menú. NUNCA inventes un fee exacto si requires_customer_address=true.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'convert_menu_price',
    description:
      'Convierte un precio del menú (o el price_min de un producto) a otra moneda con las tasas del checkout. Úsalo si preguntan “cuánto es en dólares/USD/VES/EUR…”. NUNCA inventes tasas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target_currency: {
          type: 'STRING',
          description: 'Moneda destino (USD, VES, EUR, COP…)',
        },
        amount: {
          type: 'NUMBER',
          description: 'Monto en moneda del menú (si ya lo tienes)',
        },
        product_id: { type: 'STRING' },
        product_name: { type: 'STRING' },
      },
      required: ['target_currency'],
    },
  },
  {
    name: 'get_cart_snapshot',
    description:
      'Estado actual del carrito compartido (enviado por la app). Usa esto para “qué llevo”, subtotal o quitar/cambiar. No inventes líneas.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'prepare_cart_line_proposal',
    description:
      'Prepara una propuesta VALIDADA para agregar al carrito. El servidor calcula precio y valida opciones. Requiere confirmación del cliente en la UI. No crea pedidos. En pedidos compuestos: llámala UNA vez por cada línea disponible aunque otros ítems pedidos no existan (ej. dos tamaños de pizza aunque falte una bebida). No esperes a resolver ítems faltantes antes de proponer lo disponible.',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_id: { type: 'STRING' },
        product_name: { type: 'STRING' },
        quantity: { type: 'NUMBER' },
        option_labels: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Etiquetas de opciones (ej. Grande)',
        },
        exclude_ingredients: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Ingredientes a quitar si el producto lo permite',
        },
      },
    },
  },
  {
    name: 'propose_cart_remove',
    description: 'Propone quitar un producto del carrito actual (requiere confirmación UI).',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_name: { type: 'STRING' },
        product_id: { type: 'STRING' },
      },
    },
  },
  {
    name: 'propose_cart_update_qty',
    description: 'Propone cambiar la cantidad de una línea del carrito (requiere confirmación UI).',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_name: { type: 'STRING' },
        product_id: { type: 'STRING' },
        quantity: { type: 'NUMBER' },
      },
    },
  },
  {
    name: 'propose_open_checkout',
    description:
      'Cuando el cliente quiere pagar: propone abrir el checkout existente. NUNCA crees el pedido tú.',
    parameters: { type: 'OBJECT', properties: {} },
  },
] as const;

function asProducts(menu: LoadedPublicMenu): ProductRow[] {
  return (menu.productos as ProductRow[]) || [];
}

function asCategories(menu: LoadedPublicMenu): CategoryRow[] {
  return (menu.categorias as CategoryRow[]) || [];
}

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function categoryNameById(menu: LoadedPublicMenu, id: string | null | undefined) {
  if (!id) return null;
  const cat = asCategories(menu).find((c) => c.id === id);
  return cat?.nombre ?? null;
}

function productSummary(menu: LoadedPublicMenu, p: ProductRow) {
  const min = getProductMinimumPrice(p);
  const max = getProductMaximumPrice(p);
  const options = parseProductMenuOptions(p.opciones_menu);
  const base = Number(p.precio);
  return {
    id: p.id,
    name: p.nombre ?? '',
    category: categoryNameById(menu, p.categoria_id),
    description: (p.descripcion ?? '').slice(0, 280),
    available: p.disponible !== false,
    /** List/base price before required option extras */
    price_base: Number.isFinite(base) && base > 0 ? base : null,
    /** Cheapest valid configuration (base + required groups/sizes) */
    price_min: min,
    /** Priciest typical configuration with sizes/extras */
    price_max: max,
    currency: resolveMenuCurrency(menu),
    price_min_label: formatChatMoney(min, resolveMenuCurrency(menu)),
    price_base_label:
      Number.isFinite(base) && base > 0
        ? formatChatMoney(base, resolveMenuCurrency(menu))
        : null,
    requires_configuration: productRequiresConfiguration(p),
    options_summary: getProductOptionsSummary(p) || null,
    has_option_groups: Boolean(options?.grupos?.length),
  };
}

function filterByCategory(
  menu: LoadedPublicMenu,
  list: ProductRow[],
  category: string,
): ProductRow[] {
  const cn = norm(category);
  if (!cn) return list;
  const catIds = new Set(
    asCategories(menu)
      .filter((c) => norm(c.nombre || '').includes(cn))
      .map((c) => c.id),
  );
  return list.filter((p) => p.categoria_id && catIds.has(p.categoria_id));
}

/** Deterministic cheapest products by server price_min (ties included). */
export function findCheapestProducts(
  menu: LoadedPublicMenu,
  args: {
    category?: string;
    available_only?: boolean;
    limit?: number;
  } = {},
) {
  const availableOnly = args.available_only !== false;
  const limit = Math.min(15, Math.max(1, Math.floor(Number(args.limit) || 8)));
  let list = asProducts(menu);
  if (availableOnly) list = list.filter((p) => p.disponible !== false);
  if (args.category) list = filterByCategory(menu, list, args.category);

  const ranked = list
    .map((p) => ({ product: p, price_min: getProductMinimumPrice(p) }))
    .filter((row) => row.price_min > 0)
    .sort(
      (a, b) =>
        a.price_min - b.price_min ||
        norm(a.product.nombre || '').localeCompare(norm(b.product.nombre || '')),
    );

  if (ranked.length === 0) {
    return {
      count: 0,
      cheapest_price_min: null,
      tie_count: 0,
      results: [] as ReturnType<typeof productSummary>[],
      note: 'No hay productos con precio válido en este filtro.',
    };
  }

  const cheapestPrice = ranked[0].price_min;
  const ties = ranked.filter((r) => r.price_min === cheapestPrice);
  const results = ties.slice(0, limit).map((r) => productSummary(menu, r.product));

  return {
    count: results.length,
    cheapest_price_min: cheapestPrice,
    tie_count: ties.length,
    currency: resolveMenuCurrency(menu),
    cheapest_price_label: formatChatMoney(cheapestPrice, resolveMenuCurrency(menu)),
    results,
    note:
      ties.length > limit
        ? `Hay ${ties.length} productos empatados en ${formatChatMoney(cheapestPrice, resolveMenuCurrency(menu))}; se muestran ${limit}.`
        : ties.length > 1
          ? `Empate: ${ties.length} productos comparten el precio mínimo ${formatChatMoney(cheapestPrice, resolveMenuCurrency(menu))}.`
          : undefined,
  };
}

export function assertToolCommerce(ctx: ChatToolContext) {
  if (ctx.menu.resolvedComercioId !== ctx.commerceId) {
    throw new Error('Tenant mismatch in tool context');
  }
}

export function executeChatTool(
  ctx: ChatToolContext,
  name: string,
  args: Record<string, unknown>,
): unknown {
  assertToolCommerce(ctx);
  const { menu } = ctx;

  switch (name) {
    case 'search_products': {
      const query = String(args.query ?? '').trim();
      const category = String(args.category ?? '').trim();
      const maxPrice =
        typeof args.max_price === 'number' ? args.max_price : Number(args.max_price);
      const availableOnly = args.available_only !== false;
      const limit = Math.min(
        12,
        Math.max(1, Math.floor(Number(args.limit) || 8)),
      );

      const browseOnly = !query.trim();
      const found = searchCatalog(menu, {
        query,
        category: category || undefined,
        available_only: availableOnly,
        max_price:
          Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
        // Browse-by-category: fetch a wider pool then sort by price_min.
        limit: browseOnly ? Math.max(limit, 24) : limit,
        getPriceMin: (p) => getProductMinimumPrice(p),
      });

      let hits = found.hits;
      let sortedBy: 'relevance_desc' | 'price_min_asc' = 'relevance_desc';
      if (browseOnly) {
        hits = [...hits].sort(
          (a, b) =>
            getProductMinimumPrice(a.product) -
              getProductMinimumPrice(b.product) ||
            norm(a.product.nombre || '').localeCompare(
              norm(b.product.nombre || ''),
            ),
        );
        sortedBy = 'price_min_asc';
      }
      hits = hits.slice(0, limit);

      const results = hits.map((hit) => ({
        ...productSummary(menu, hit.product),
        match_score: hit.score,
        matched_field: hit.matched_field,
        matched_option: hit.matched_option,
        matched_group: hit.matched_group,
        suggested_option_labels: hit.suggested_option_labels,
        prepare_hint:
          hit.suggested_option_labels.length > 0
            ? {
                product_id: hit.product.id,
                product_name: hit.product.nombre ?? '',
                option_labels: hit.suggested_option_labels,
              }
            : {
                product_id: hit.product.id,
                product_name: hit.product.nombre ?? '',
              },
      }));

      return {
        count: results.length,
        results,
        sorted_by: sortedBy,
        query_normalized: found.query_normalized,
        searched_options: found.searched_options,
        ambiguous: browseOnly ? false : found.ambiguous,
        note: found.note,
      };
    }

    case 'find_cheapest_products': {
      return findCheapestProducts(menu, {
        category: String(args.category ?? '').trim() || undefined,
        available_only: args.available_only !== false,
        limit: Number(args.limit) || 8,
      });
    }

    case 'recommend_products': {
      const want = Array.isArray(args.want_ingredients)
        ? args.want_ingredients.map((x) => String(x))
        : [];
      const avoid = Array.isArray(args.avoid_ingredients)
        ? args.avoid_ingredients.map((x) => String(x))
        : [];
      const exclude = Array.isArray(args.exclude_product_ids)
        ? args.exclude_product_ids.map((x) => String(x))
        : (ctx.cartSnapshot || []).map((l) => l.productId);
      const rec = recommendFromCatalog(menu, {
        query: String(args.query ?? '').trim() || undefined,
        category: String(args.category ?? '').trim() || undefined,
        want_ingredients: want,
        avoid_ingredients: avoid,
        max_price:
          typeof args.max_price === 'number' ? args.max_price : Number(args.max_price) || undefined,
        party_size:
          typeof args.party_size === 'number' ? args.party_size : Number(args.party_size) || undefined,
        exclude_product_ids: exclude,
        complement_to_cart: args.complement_to_cart === true,
        limit: Number(args.limit) || 3,
      });
      const currency = resolveMenuCurrency(menu);
      for (const row of rec.results) {
        const product = asProducts(menu).find((p) => p.id === row.id);
        if (!product) continue;
        ctx.pendingCards = ctx.pendingCards || [];
        ctx.pendingCards.push(buildProductCard(menu, product));
      }
      return {
        ...rec,
        currency,
        results: rec.results.map((r) => ({
          ...r,
          price_min_label: formatChatMoney(r.price_min, currency),
          prepare_hint: {
            product_id: r.id,
            product_name: r.name,
            option_labels: r.suggested_option_labels,
          },
        })),
      };
    }

    case 'suggest_cheaper_alternatives': {
      const productId = String(args.product_id ?? '').trim() || null;
      const alt = findCheaperAlternatives(
        menu,
        productId,
        Math.min(5, Math.max(1, Number(args.limit) || 3)),
      );
      const currency = resolveMenuCurrency(menu);
      return {
        ...alt,
        currency,
        alternatives: alt.alternatives.map((a) => ({
          ...a,
          price_min_label: formatChatMoney(a.price_min, currency),
        })),
        note:
          alt.alternatives.length === 0
            ? 'No hay alternativas más baratas en la misma categoría.'
            : 'Ofrece 1–2 opciones con empatía; no discutas el precio.',
      };
    }

    case 'get_product_details': {
      const productId = String(args.product_id ?? '').trim();
      const productName = String(args.product_name ?? '').trim();
      const resolved = resolveCatalogProduct(menu, productId, productName);
      if (!resolved) {
        return {
          found: false,
          message:
            'No hay coincidencia en este menú para ese id/nombre. No inventes el producto; ofrece el menú o reformula la búsqueda.',
        };
      }
      const product = resolved.product;
      if (!asProducts(menu).some((p) => p.id === product.id)) {
        return { found: false, message: 'Producto no autorizado.' };
      }
      const options = parseProductMenuOptions(product.opciones_menu);
      return {
        found: true,
        matched_field: resolved.matched_field,
        matched_option: resolved.matched_option,
        matched_group: resolved.matched_group,
        suggested_option_labels: resolved.suggested_option_labels,
        product: {
          ...productSummary(menu, product),
          description: product.descripcion ?? '',
          option_groups: (options?.grupos ?? []).map((g) => ({
            name: g.nombre,
            required: g.obligatorio,
            min: g.min,
            max: g.max,
            type: g.tipo,
            choices: (g.opciones ?? []).slice(0, 30).map((o) => ({
              name: o.nombre,
              price: o.precio ?? 0,
            })),
          })),
        },
      };
    }

    case 'get_categories': {
      const products = asProducts(menu);
      const categories = asCategories(menu).map((c) => {
        const inCat = products.filter((p) => p.categoria_id === c.id);
        const availableCount = inCat.filter((p) => p.disponible !== false)
          .length;
        return {
          id: c.id,
          name: c.nombre ?? '',
          product_count: inCat.length,
          available_count: availableCount,
          // UI carousel shape (also mirrored onto ctx.pendingCategories).
          imageUrl: c.imagen_url ?? null,
          productCount: inCat.length,
          availableCount,
        };
      });
      ctx.pendingCategories = categories.map((c) => ({
        id: c.id,
        name: c.name,
        imageUrl: c.imageUrl,
        productCount: c.productCount,
        availableCount: c.availableCount,
      }));
      return {
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          product_count: c.product_count,
          available_count: c.available_count,
        })),
        note: 'La UI muestra el carrusel de categorías. Responde en 1 frase corta sin listar nombres.',
      };
    }

    case 'get_business_information': {
      const c = menu.comercio as Record<string, unknown>;
      const lat = Number(c.latitud);
      const lng = Number(c.longitud);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      const addressParts = [c.direccion, c.ciudad]
        .map((v) => (v == null ? '' : String(v).trim()))
        .filter(Boolean);
      const mapsQuery = hasCoords
        ? `${lat},${lng}`
        : addressParts.join(', ') || String(c.nombre ?? '');
      const hoursRaw = c.horarios ?? c.horario ?? null;
      const scheduleStatus = resolveBusinessScheduleStatus(hoursRaw);
      const hoursDays = scheduleStatus.configured
        ? listBusinessScheduleDayRows(hoursRaw).map((d) => ({
            day: d.label,
            today: d.isToday,
            hours: d.hoursLabel,
            closed: d.closed,
          }))
        : [];
      const whatsappRaw =
        c.whatsapp ?? c.telefono ?? c.telefonos ?? c.celular ?? null;
      const whatsappDigits = String(whatsappRaw ?? '').replace(/\D/g, '');
      const whatsappUrl = whatsappDigits
        ? buildWhatsAppHref(whatsappDigits)
        : null;
      return {
        id: menu.resolvedComercioId,
        name: c.nombre ?? null,
        slug: c.slug ?? null,
        address: addressParts.join(', ') || null,
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        maps_url: mapsQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
          : null,
        directions_url: mapsQuery
          ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`
          : null,
        currency: resolveMenuCurrency(menu),
        checkout_currencies: listCheckoutCurrencies(menu),
        online: c.en_linea === true,
        hours: hoursRaw,
        hours_status: {
          configured: scheduleStatus.configured,
          is_open: scheduleStatus.isOpen,
          caption: scheduleStatus.caption,
          next_open: scheduleStatus.nextOpenLabel,
          closes_at: scheduleStatus.closesAtLabel,
        },
        hours_week: hoursDays,
        whatsapp: whatsappRaw,
        whatsapp_url: whatsappUrl,
        contact_scope: 'restaurant_only',
        note: [
          hasCoords
            ? 'La UI puede mostrar el pin GPS. Responde breve y comparte maps_url; NUNCA digas que no puedes enviar ubicación.'
            : 'No hay coordenadas GPS publicadas; da la dirección textual si existe.',
          scheduleStatus.configured
            ? `Horario: usa hours_status.caption y hours_week (no inventes). Hoy: ${scheduleStatus.caption}.`
            : 'Horario no configurado; dilo y ofrece WhatsApp del local si existe.',
          whatsappUrl
            ? `Reclamos / humano / WhatsApp del local: comparte SOLO whatsapp_url de este restaurante: ${whatsappUrl}. NUNCA un número de elmenuxfa ni de otro comercio.`
            : 'No hay WhatsApp del restaurante publicado; dilo sin inventar ni usar el de la plataforma.',
        ].join(' '),
      };
    }

    case 'get_available_fulfillment_methods': {
      const c = menu.comercio as Record<string, unknown>;
      const branding = (menu.comercioRow?.branding_ia ?? null) as
        | { config_negocio?: { inicio_menu?: Record<string, boolean> } }
        | null;
      const inicio = branding?.config_negocio?.inicio_menu ?? {};
      return {
        delivery: c.permite_delivery === true || inicio.delivery === true,
        pickup: inicio.para_llevar !== false,
        dine_in: inicio.comer_aqui !== false,
        whatsapp_orders: c.recibe_pedidos_whatsapp === true,
        virtual_business: c.negocio_virtual === true,
        hint: 'Para tarifas/zonas usa get_delivery_conditions (no inventes precios).',
      };
    }

    case 'get_delivery_conditions': {
      return getDeliveryConditions(menu);
    }

    case 'convert_menu_price': {
      const target = String(args.target_currency ?? '').trim();
      let amount = Number(args.amount);
      let productLabel: string | null = null;
      const productId = String(args.product_id ?? '').trim();
      const productName = String(args.product_name ?? '').trim();
      if ((!Number.isFinite(amount) || amount <= 0) && (productId || productName)) {
        let product: ProductRow | undefined;
        if (productId) {
          product = asProducts(menu).find((p) => p.id === productId);
        }
        if (!product && productName) {
          product = resolveCatalogProduct(menu, null, productName)?.product;
        }
        if (!product) {
          return {
            ok: false,
            error: 'Producto no encontrado para convertir.',
            currency_menu: resolveMenuCurrency(menu),
            available_currencies: listCheckoutCurrencies(menu),
          };
        }
        amount = getProductMinimumPrice(product);
        productLabel = String(product.nombre || '').trim() || null;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          ok: false,
          error: 'Indica un monto del menú o un producto para convertir.',
          currency_menu: resolveMenuCurrency(menu),
          available_currencies: listCheckoutCurrencies(menu),
        };
      }
      const converted = convertMenuPrice(menu, amount, target);
      return {
        ...converted,
        product_name: productLabel,
        hint: converted.ok
          ? 'Responde con label_menu y label_target. Aclara que es referencial y el checkout confirma.'
          : undefined,
      };
    }

    case 'get_cart_snapshot': {
      return summarizeCartSnapshot(
        menu,
        ctx.commerceId,
        ctx.cartSnapshot || [],
      );
    }

    case 'prepare_cart_line_proposal': {
      const result = prepareCartLineProposal(menu, ctx.commerceId, {
        product_id: String(args.product_id ?? '').trim() || undefined,
        product_name: String(args.product_name ?? '').trim() || undefined,
        quantity: Number(args.quantity) || 1,
        option_labels: Array.isArray(args.option_labels)
          ? args.option_labels.map((x) => String(x))
          : undefined,
        exclude_ingredients: Array.isArray(args.exclude_ingredients)
          ? args.exclude_ingredients.map((x) => String(x))
          : undefined,
        client_unit_price:
          typeof args.unit_price === 'number' ? args.unit_price : undefined,
      });
      if (result.status === 'ready') {
        ctx.pendingActions = ctx.pendingActions || [];
        ctx.pendingActions.push(result.action);
        ctx.pendingCards = ctx.pendingCards || [];
        ctx.pendingCards.push(result.action.product_card);
      } else if (result.product_card) {
        ctx.pendingCards = ctx.pendingCards || [];
        ctx.pendingCards.push(result.product_card);
      }
      return result;
    }

    case 'propose_cart_remove': {
      const target =
        String(args.product_id ?? '').trim() ||
        String(args.product_name ?? '').trim();
      const action = proposeRemoveFromSnapshot(
        menu,
        ctx.commerceId,
        ctx.cartSnapshot || [],
        target,
      );
      if ('error' in action) return action;
      ctx.pendingActions = ctx.pendingActions || [];
      ctx.pendingActions.push(action);
      return { status: 'ready', action };
    }

    case 'propose_cart_update_qty': {
      const target =
        String(args.product_id ?? '').trim() ||
        String(args.product_name ?? '').trim();
      const action = proposeUpdateQtyInSnapshot(
        menu,
        ctx.commerceId,
        ctx.cartSnapshot || [],
        target,
        Number(args.quantity),
      );
      if ('error' in action) return action;
      ctx.pendingActions = ctx.pendingActions || [];
      ctx.pendingActions.push(action);
      return { status: 'ready', action };
    }

    case 'propose_open_checkout': {
      const action: ChatCartAction = {
        type: 'open_checkout',
        requires_confirmation: true,
        proposal_id: `checkout_${Date.now().toString(36)}`,
        catalog_fingerprint: null,
        label: 'Continuar con mi pedido',
      };
      ctx.pendingActions = ctx.pendingActions || [];
      ctx.pendingActions.push(action);
      return {
        status: 'ready',
        action,
        note: 'No crees el pedido. La UI abrirá el checkout real tras confirmación.',
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Attach product cards from search/details without extra Gemini rounds. */
export function collectProductCardsFromToolResult(
  menu: LoadedPublicMenu,
  toolName: string,
  result: unknown,
): ChatProductCard[] {
  const cards: ChatProductCard[] = [];
  if (!result || typeof result !== 'object') return cards;
  const row = result as Record<string, unknown>;
  if (toolName === 'get_product_details' && row.found && row.product) {
    const p = row.product as { id?: string };
    const product = asProducts(menu).find((x) => x.id === p.id);
    if (product) cards.push(buildProductCard(menu, product));
  }
  if (toolName === 'search_products' || toolName === 'find_cheapest_products') {
    const results = (row.results as Array<{ id?: string }>) || [];
    for (const r of results.slice(0, 6)) {
      const product = asProducts(menu).find((x) => x.id === r.id);
      if (product) cards.push(buildProductCard(menu, product));
    }
  }
  return cards;
}

/** Pure helper for tests: search without Gemini */
export function searchProductsForTests(
  ctx: ChatToolContext,
  args: Record<string, unknown>,
) {
  return executeChatTool(ctx, 'search_products', args);
}
