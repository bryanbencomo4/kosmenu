/**
 * Half/half (combinación) intent helpers for the chatbot.
 * Reuses traditional-menu contracts from menu-product-options — never invents pricing.
 */
import {
  autoPartnerSelection,
  combinedLineTitle,
  parseProductMenuOptions,
  type CartLineSelection,
} from '../../../_lib/menu-product-options';
import { foldSearchText } from '../../../_lib/search-text';
import type { LoadedPublicMenu } from '../../menu/_lib/load-public-menu';

type ProductRow = {
  id: string;
  nombre?: string | null;
  disponible?: boolean | null;
  opciones_menu?: unknown;
  categoria_id?: string | null;
};

function fold(s: string) {
  return foldSearchText(s);
}

export type HalfHalfIntent =
  | {
      kind: 'combine';
      firstName: string;
      secondName: string;
      quantity: number;
      sizeLabel: string | null;
      excludeIngredients: string[];
    }
  | {
      kind: 'independent_pair';
      firstName: string;
      secondName: string;
      quantityEach: number;
      sizeLabel: string | null;
    }
  | { kind: 'none' };

/**
 * Distinguish:
 * - "mitad Granjera y mitad Campesina" → one combined pizza
 * - "una Granjera y una Campesina" → two independent lines
 */
export function parseHalfHalfIntent(raw: string): HalfHalfIntent {
  const text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'none' };
  const folded = fold(text);

  // Explicit half/half patterns
  const halfPatterns = [
    /(?:una\s+)?(?:pizza\s+)?(?:la\s+)?mitad(?:\s+de)?\s+(.+?)\s+y\s+(?:la\s+)?mitad(?:\s+de)?\s+(.+?)(?:\.|$|,|\s+pero|\s+sin|\s+grande|\s+normal)/i,
    /(?:pizza\s+)?mitad\s+(.+?)\s+(?:y|,)\s*mitad\s+(.+?)(?:\.|$|,|\s+pero|\s+sin|\s+grande|\s+normal)/i,
    /combinad[ao]\s+(.+?)\s+y\s+(.+?)(?:\.|$)/i,
    /media\s+(.+?)\s+media\s+(.+?)(?:\.|$)/i,
  ];

  for (const re of halfPatterns) {
    const m = text.match(re);
    if (m) {
      const firstName = cleanProductPhrase(m[1] || '');
      const secondName = cleanProductPhrase(m[2] || '');
      if (firstName && secondName && fold(firstName) !== fold(secondName)) {
        const sizeLabel = detectSizeLabel(text);
        const excludeIngredients = detectExclusions(text);
        return {
          kind: 'combine',
          firstName,
          secondName,
          quantity: 1,
          sizeLabel,
          excludeIngredients,
        };
      }
    }
  }

  // Also: "mitad X mitad Y" without "y"
  const loose = text.match(
    /mitad\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.\- ]{2,40}?)\s+mitad\s+([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.\- ]{2,40})/i,
  );
  if (loose) {
    const firstName = cleanProductPhrase(loose[1] || '');
    const secondName = cleanProductPhrase(loose[2] || '');
    if (firstName && secondName) {
      return {
        kind: 'combine',
        firstName,
        secondName,
        quantity: 1,
        sizeLabel: detectSizeLabel(text),
        excludeIngredients: detectExclusions(text),
      };
    }
  }

  // Independent pair: "una Granjera y una Campesina" / "dos pizzas: una X y otra Y"
  if (
    !/\bmitad\b/i.test(folded) &&
    /\b(una|1)\b.+\b(y|,)\s*(una|otra|1)\b/i.test(text)
  ) {
    const m = text.match(
      /(?:una|1)\s+(?:pizza\s+)?([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.\- ]{2,40}?)\s+y\s+(?:una|otra|1)\s+(?:pizza\s+)?([A-Za-zÁÉÍÓÚáéíóúñÑ0-9.\- ]{2,40})/i,
    );
    if (m) {
      const firstName = cleanProductPhrase(m[1] || '');
      const secondName = cleanProductPhrase(m[2] || '');
      if (firstName && secondName) {
        return {
          kind: 'independent_pair',
          firstName,
          secondName,
          quantityEach: 1,
          sizeLabel: detectSizeLabel(text),
        };
      }
    }
  }

  return { kind: 'none' };
}

function cleanProductPhrase(raw: string): string {
  return raw
    .replace(/\b(pizza|pizzas|la|el|de|del|una|un)\b/gi, ' ')
    .replace(/\b(grande|normal|mediana|familiar)\b/gi, ' ')
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectSizeLabel(text: string): string | null {
  const t = fold(text);
  if (/\bgrande\b/.test(t)) return 'Grande';
  if (/\bnormal\b/.test(t)) return 'Normal';
  if (/\bmediana?\b/.test(t)) return 'Mediana';
  if (/\bfamiliar\b/.test(t)) return 'Familiar';
  return null;
}

function detectExclusions(text: string): string[] {
  const out: string[] = [];
  const m = text.match(/\bsin\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]{2,30})/i);
  if (m) {
    const ing = (m[1] || '').trim();
    if (ing && !/cebolla en (la|ambas)/i.test(text)) {
      out.push(ing.split(/\s+y\s+/)[0]!.trim());
    }
  }
  return out;
}

export function productAllowsCombination(product: ProductRow): boolean {
  const options = parseProductMenuOptions(product.opciones_menu);
  return Boolean(options?.personalizacion?.combinacion);
}

export function getCombinationCompatIds(product: ProductRow): string[] {
  const options = parseProductMenuOptions(product.opciones_menu);
  return options?.personalizacion?.combinacion?.productosCompatibles ?? [];
}

export function canCombineProducts(
  primary: ProductRow,
  partner: ProductRow,
): { ok: true } | { ok: false; reason: string } {
  if (primary.disponible === false) {
    return { ok: false, reason: `${primary.nombre || 'Producto'} no está disponible.` };
  }
  if (partner.disponible === false) {
    return { ok: false, reason: `${partner.nombre || 'Producto'} no está disponible.` };
  }
  if (primary.id === partner.id) {
    return { ok: false, reason: 'No se puede combinar un producto consigo mismo.' };
  }
  const compat = getCombinationCompatIds(primary);
  if (compat.length === 0) {
    return {
      ok: false,
      reason: `${primary.nombre || 'Este producto'} no admite combinación en este menú.`,
    };
  }
  if (!compat.includes(partner.id)) {
    return {
      ok: false,
      reason: `No está permitido combinar ${primary.nombre} con ${partner.nombre}.`,
    };
  }
  return { ok: true };
}

/** Mirror traditional menu: partner selection auto-filled from primary. */
export function buildCombinationSelection(
  primary: ProductRow,
  partner: ProductRow,
  primarySelection: CartLineSelection,
): CartLineSelection {
  const partnerSelection = autoPartnerSelection(
    primary,
    primarySelection,
    partner,
  );
  return {
    ...primarySelection,
    combinacion: {
      productId: partner.id,
      seleccion: partnerSelection,
    },
  };
}

export function combinationDisplayName(
  primary: ProductRow,
  partner: ProductRow,
): string {
  return combinedLineTitle(primary, partner);
}

export function findProductByNameLoose(
  menu: LoadedPublicMenu,
  name: string,
): ProductRow | null {
  const want = fold(name);
  if (!want) return null;
  const products = (menu.productos as ProductRow[]) || [];
  const exact = products.find((p) => fold(p.nombre || '') === want);
  if (exact) return exact;
  const starts = products.find((p) => fold(p.nombre || '').startsWith(want));
  if (starts) return starts;
  const includes = products.find((p) => fold(p.nombre || '').includes(want));
  return includes || null;
}

export type PendingCombinationConfig = {
  product_id: string;
  product_name: string;
  combine_with_product_id: string;
  combine_with_product_name: string;
  quantity: number;
  option_labels: string[];
  exclude_ingredients: string[];
  missing_attribute: 'size' | 'flavor' | 'options';
  size_choices: string[];
};
