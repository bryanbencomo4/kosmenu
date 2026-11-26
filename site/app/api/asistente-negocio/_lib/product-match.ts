import { foldText } from './intents';

export type ProductRow = {
  id: unknown;
  nombre: unknown;
  precio?: unknown;
  disponible?: unknown;
  imagen_url?: unknown;
  categoria_id?: unknown;
  descripcion?: unknown;
};

export type ProductMatchResult =
  | { status: 'exact'; product: ProductRow }
  | { status: 'ambiguous'; candidates: ProductRow[] }
  | { status: 'none' };

const NOISE =
  /\b(cambia(r)?|actualiza(r)?|modifica(r)?|pon(er)?|deja(r)?|marca(r)?|activa(r)?|desactiva(r)?|agota(r)?|agotada|agotado|disponible|ocultar|oculta|habilita(r)?|reactiva(r)?|precio|a|de|la|el|los|las|un|una|como|otra?\s+vez|producto|plato|item|foto|imagen)\b/gi;

/** Strip admin verbs so the remaining tokens look like a product name. */
export function extractProductHint(raw?: string): string {
  if (!raw) return '';
  return foldText(raw)
    .replace(NOISE, ' ')
    .replace(/\$?\d+(?:[.,]\d{1,2})?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safe product resolution — never silently substitutes an unrelated product.
 * Prefer exact / full-name containment; if several match, ask the merchant.
 */
const STOP = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'con', 'para', 'por', 'en', 'que',
  'quiero', 'ahora', 'esa', 'ese', 'esta', 'este', 'mi', 'tu', 'es', 'son', 'al', 'lo', 'le',
]);

/** "Agua 1 Lt." / "agua 1L" / "AGUA 1 litro" → ["agua","1l"]. */
function nameTokens(raw: string): string[] {
  const t = foldText(raw)
    .replace(/(\d+)\s*(?:litros?|lts?|lt|l)\b/g, '$1l')
    .replace(/(\d+)\s*(?:mililitros?|ml)\b/g, '$1ml')
    .replace(/(\d+)\s*(?:gramos?|grs?|gr|g)\b/g, '$1g')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

function fuzzyMatch(products: ProductRow[], raw: string): ProductMatchResult | null {
  const base = nameTokens(raw.replace(NOISE, ' ')).filter((w) => !STOP.has(w));
  if (!base.length) return null;
  const attempts = [base, base.filter((w) => !/^\d/.test(w))].filter(
    (a, i) => a.length > 0 && (i === 0 || a.length !== base.length),
  );
  for (const hint of attempts) {
    const scored: Array<{ p: ProductRow; score: number }> = [];
    for (const p of products) {
      const nt = nameTokens(String(p.nombre || ''));
      if (!nt.length) continue;
      const ok = hint.every((h) =>
        nt.some((n) => n === h || (h.length >= 3 && n.startsWith(h)) || (n.length >= 4 && h.startsWith(n))),
      );
      if (!ok) continue;
      scored.push({ p, score: 50 + Math.round((50 * hint.length) / nt.length) });
    }
    if (!scored.length) continue;
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0]!.score;
    const group = scored.filter((s) => s.score >= top - 1).map((s) => s.p);
    if (group.length === 1) return { status: 'exact', product: group[0]! };
    return { status: 'ambiguous', candidates: group.slice(0, 6) };
  }
  return null;
}

export function resolveProductMatch(
  products: ProductRow[],
  hint?: string,
): ProductMatchResult {
  if (!products.length) return { status: 'none' };
  if (hint) {
    const fuzzy = fuzzyMatch(products, hint);
    if (fuzzy) return fuzzy;
  }
  const cleaned = extractProductHint(hint);
  if (!cleaned || cleaned.length < 2) return { status: 'none' };

  const scored: Array<{ p: ProductRow; score: number }> = [];
  for (const p of products) {
    const name = foldText(String(p.nombre || ''));
    if (!name) continue;
    if (name === cleaned) {
      scored.push({ p, score: 100 });
      continue;
    }
    // Utterance contains the full product name (longest wins later).
    if (cleaned.includes(name) && name.length >= 3) {
      scored.push({ p, score: 80 + Math.min(15, name.length) });
      continue;
    }
    // Product name starts with / equals the cleaned hint.
    if (name.startsWith(cleaned) && cleaned.length >= 3) {
      scored.push({ p, score: 70 + Math.min(10, cleaned.length) });
      continue;
    }
    // Hint is a substantial unique token of the name (whole word, ≥4 chars).
    const words = name.split(/\s+/).filter((w) => w.length >= 4);
    if (words.some((w) => w === cleaned)) {
      scored.push({ p, score: 60 });
    }
  }

  if (!scored.length) return { status: 'none' };
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!.score;
  const topGroup = scored.filter((s) => s.score >= top - 5).map((s) => s.p);
  // Dedupe by id
  const seen = new Set<string>();
  const unique = topGroup.filter((p) => {
    const id = String(p.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (unique.length === 1) return { status: 'exact', product: unique[0]! };
  return { status: 'ambiguous', candidates: unique.slice(0, 6) };
}

export function resolveShopByName<T extends { nombre: string }>(
  shops: T[],
  rawHint: string,
): T | null {
  const folded = foldText(rawHint);
  const cleaned = folded
    .replace(
      /^(usar|seleccionar|elegir|cambiar(\s+(a|al|de))?|seguir\s+con|negocio|local|comercio|tienda)\s+/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  const exact = shops.find((s) => foldText(s.nombre) === cleaned);
  if (exact) return exact;

  const hits = shops.filter((s) => {
    const n = foldText(s.nombre);
    return n.includes(cleaned) || cleaned.includes(n);
  });
  if (hits.length === 1) return hits[0]!;
  // Prefer longest name contained in hint
  const contained = shops
    .filter((s) => cleaned.includes(foldText(s.nombre)))
    .sort((a, b) => foldText(b.nombre).length - foldText(a.nombre).length);
  if (contained.length === 1) return contained[0]!;
  if (contained.length > 1 && foldText(contained[0]!.nombre) !== foldText(contained[1]!.nombre)) {
    // Unique longest containment
    if (
      foldText(contained[0]!.nombre).length > foldText(contained[1]!.nombre).length
    ) {
      return contained[0]!;
    }
  }
  return null;
}
