/** Canonical Venezuelan federal entities for virtual-business operating areas. */

export type VenezuelaState = {
  slug: string;
  name: string;
  aliases?: string[];
};

export const VENEZUELA_STATES: readonly VenezuelaState[] = [
  {
    slug: 'distrito-capital',
    name: 'Distrito Capital',
    aliases: ['Caracas', 'Caracas DC', 'DC', 'Capital'],
  },
  { slug: 'amazonas', name: 'Amazonas' },
  { slug: 'anzoategui', name: 'Anzoátegui', aliases: ['Anzoategui'] },
  { slug: 'apure', name: 'Apure' },
  { slug: 'aragua', name: 'Aragua' },
  { slug: 'barinas', name: 'Barinas' },
  { slug: 'bolivar', name: 'Bolívar', aliases: ['Bolivar'] },
  { slug: 'carabobo', name: 'Carabobo' },
  { slug: 'cojedes', name: 'Cojedes' },
  { slug: 'delta-amacuro', name: 'Delta Amacuro' },
  { slug: 'falcon', name: 'Falcón', aliases: ['Falcon'] },
  { slug: 'guarico', name: 'Guárico', aliases: ['Guarico'] },
  { slug: 'la-guaira', name: 'La Guaira', aliases: ['Vargas'] },
  { slug: 'lara', name: 'Lara' },
  { slug: 'merida', name: 'Mérida', aliases: ['Merida'] },
  { slug: 'miranda', name: 'Miranda' },
  { slug: 'monagas', name: 'Monagas' },
  { slug: 'nueva-esparta', name: 'Nueva Esparta' },
  { slug: 'portuguesa', name: 'Portuguesa' },
  { slug: 'sucre', name: 'Sucre' },
  { slug: 'tachira', name: 'Táchira', aliases: ['Tachira'] },
  { slug: 'trujillo', name: 'Trujillo' },
  { slug: 'yaracuy', name: 'Yaracuy' },
  { slug: 'zulia', name: 'Zulia' },
] as const;

const bySlug = new Map(VENEZUELA_STATES.map((state) => [state.slug, state]));

export function venezuelaStateBySlug(slug: string | null | undefined) {
  const key = (slug ?? '').trim().toLowerCase();
  if (!key) return null;
  return bySlug.get(key) ?? null;
}

/** Keeps only known slugs, de-duplicated, in catalog order. */
export function sanitizeVenezuelaStateSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const selected = new Set<string>();
  for (const item of raw) {
    const slug = (item ?? '').toString().trim().toLowerCase();
    if (bySlug.has(slug)) selected.add(slug);
  }
  return VENEZUELA_STATES.filter((state) => selected.has(state.slug)).map((state) => state.slug);
}

export function venezuelaStateLabel(slug: string) {
  return venezuelaStateBySlug(slug)?.name ?? slug;
}

function joinSpanishLabels(labels: string[]) {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

export function formatVenezuelaOperatingStates(slugs: Iterable<string>) {
  return joinSpanishLabels(sanitizeVenezuelaStateSlugs([...slugs]).map(venezuelaStateLabel));
}

/** Compact preview for UI: full names up to `maxVisible`, then “y N más”. */
export function formatVenezuelaOperatingStatesPreview(
  slugsOrLabels: Iterable<string>,
  maxVisible = 2,
) {
  const labels = [...slugsOrLabels]
    .map((item) => {
      const raw = (item ?? '').toString().trim();
      if (!raw) return '';
      // Accept either slug or already-resolved label.
      return venezuelaStateBySlug(raw)?.name ?? raw;
    })
    .filter(Boolean);
  // De-dupe while preserving order.
  const unique: string[] = [];
  for (const label of labels) {
    if (!unique.includes(label)) unique.push(label);
  }
  if (unique.length === 0) return '';
  if (unique.length <= maxVisible) {
    return joinSpanishLabels(unique);
  }
  const head = unique.slice(0, maxVisible).join(', ');
  const rest = unique.length - maxVisible;
  return `${head} y ${rest} más`;
}

export function venezuelaOperatingStateLabels(slugs: unknown): string[] {
  return sanitizeVenezuelaStateSlugs(slugs).map(venezuelaStateLabel);
}

/** Display names used by directory region chips / URL `region=` params. */
export const VENEZUELA_STATE_DISPLAY_NAMES = VENEZUELA_STATES.map((state) => state.name);

function normalizeForMatch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when a directory region query (display name or slug) matches an
 * operating-state slug, including aliases (e.g. "Caracas DC" → distrito-capital).
 */
export function operatingStatesMatchRegion(
  estadosOperacion: string[] | null | undefined,
  regionQuery: string,
) {
  const needle = normalizeForMatch(regionQuery);
  if (!needle) return false;
  const slugs = sanitizeVenezuelaStateSlugs(estadosOperacion ?? []);
  for (const slug of slugs) {
    const state = venezuelaStateBySlug(slug);
    if (!state) continue;
    const candidates = [state.slug, state.name, ...(state.aliases ?? [])];
    for (const candidate of candidates) {
      const hay = normalizeForMatch(candidate);
      if (!hay) continue;
      if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
        return true;
      }
    }
  }
  return false;
}
