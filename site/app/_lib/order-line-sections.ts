/** A combined order line, ready to print: "(Combinación) A + B" with "Tamaño: Grande", "Sin: Cebolla". */
export type CombinedOrderLineSummary = { title: string; lines: string[] };

export const COMBINATION_TITLE_PREFIX = '(Combinación)';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Summary for lines that combine two products (`personalizacion.componentes`), or null for every
 * other line so callers keep their existing rendering. Choices of both products are merged per
 * group; removals name their product only when both products have removals.
 */
export function combinedOrderLineSummary(item: unknown): CombinedOrderLineSummary | null {
  const customization = record(record(item).personalizacion);
  if (customization.version !== 1) return null;
  const components = list(customization.componentes).map(record);
  if (components.length < 2) return null;
  const names = components.map((component) => text(component.nombre));
  if (names.some((name) => !name)) return null;

  const byGroup = new Map<string, string[]>();
  for (const component of components) {
    for (const rawOption of list(component.selecciones)) {
      const option = record(rawOption);
      const label = text(option.opcion);
      if (!label) continue;
      const group = text(option.grupo);
      const labels = byGroup.get(group) ?? [];
      if (!labels.includes(label)) byGroup.set(group, [...labels, label]);
    }
  }
  const lines = [...byGroup].map(([group, labels]) => `${group ? `${group}: ` : ''}${labels.join(', ')}`);

  const removedByProduct = components.map((component) => list(component.exclusiones)
    .map((entry) => text(record(entry).nombre))
    .filter(Boolean));
  const productsWithRemovals = removedByProduct.filter((removed) => removed.length).length;
  const removed = productsWithRemovals > 1
    ? removedByProduct.flatMap((entries, index) => entries.length ? [`${entries.join(', ')} (${names[index]})`] : [])
    : removedByProduct.flat();
  if (removed.length) lines.push(`Sin: ${removed.join(', ')}`);

  return { title: `${COMBINATION_TITLE_PREFIX} ${names.join(' + ')}`, lines };
}
