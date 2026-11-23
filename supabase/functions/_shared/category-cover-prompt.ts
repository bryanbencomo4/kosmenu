export type CategoryCoverPromptInput = {
  businessName: string;
  categoryName: string;
  brandColor: string;
  businessCategory?: string;
  productNames?: string[];
  /** Real logo is composited in code — model must NOT draw any logo. */
  willOverlayLogo: boolean;
  /** Logo image is attached so the model can match its typography. */
  hasLogoTypeReference: boolean;
  hasStyleLockReference: boolean;
  productReferenceCount: number;
  /** From branding_ia — guides title type to match the restaurant brand. */
  titleFont?: string;
  brandMood?: string;
  brandVisualDescription?: string;
  customNotes?: string;
};

/**
 * Promotional vertical 9:16 category cover.
 * Logo is applied in post. Typography must match the restaurant logo/brand
 * (not a generic metallic sans for every commerce).
 */
export function buildCategoryCoverPrompt(input: CategoryCoverPromptInput): string {
  const business = sanitize(input.businessName) || 'Negocio';
  const category = sanitize(input.categoryName) || 'Categoría';
  const color = sanitize(input.brandColor) || '#111111';
  const categoryUpper = category.toUpperCase();
  const titleFont = sanitize(input.titleFont);
  const brandMood = sanitize(input.brandMood, 240);
  const brandVisual = sanitize(input.brandVisualDescription, 280);
  const productList = (input.productNames ?? [])
    .map((name) => sanitize(name))
    .filter((name) => name.length > 0)
    .slice(0, 8);
  const notes = sanitize(input.customNotes);

  const productBlock =
    productList.length > 0
      ? `Productos de esta categoría (solo collage inferior): ${productList.join(', ')}.`
      : 'Inventa un collage fotorealista de ítems típicos de la categoría en la zona inferior.';

  const refsBlock =
    input.productReferenceCount > 0
      ? `Hay ${input.productReferenceCount} foto(s) product_*. Úsalas SOLO para el collage inferior.`
      : 'No hay fotos de productos adjuntas.';

  const logoRule = input.willOverlayLogo
    ? [
        'LOGO — PROHIBIDO DIBUJARLO:',
        'NO dibujes logo, ícono, crestas, wordmark, caja ni el nombre del negocio.',
        'Deja solo un margen superior pequeño (~10% altura) limpio y atmosférico.',
        'El título hero debe quedar COMPLETAMENTE libre (sin nada encima).',
        'El logo real se añade después en código.',
      ].join(' ')
    : [
        `Escribe el nombre "${business}" UNA sola vez arriba con tipografía coherente con la marca.`,
        'NO inventes un logo gráfico.',
      ].join(' ');

  const typeFromLogo = input.hasLogoTypeReference
    ? [
        'TIPOGRAFÍA (prioridad): hay una imagen brand_type_reference (logo real del negocio).',
        'Analiza la tipografía del logo (serif vs sans, elegante vs bold, condensada vs ancha, clásica vs moderna, formal vs casual).',
        'El título hero DEBE sentirse de la MISMA familia visual que ese logo: misma personalidad tipográfica, no una fuente genérica de anuncio.',
        'Ejemplos: logo con cresta/serif elegante → título serif o display clásico italiano; logo geométrico moderno → sans bold limpia; logo script → display con carácter, no script ilegible.',
      ].join(' ')
    : 'TIPOGRAFÍA: elige una tipografía hero coherente con el nombre y rubro del negocio (no uses un estilo genérico de neon/metal si no encaja con la marca).';

  const brandKitLines = [
    titleFont
      ? `Fuente de marca para títulos (referencia): estilo cercano a "${titleFont}" (Google Fonts). No hace falta el nombre exacto en la imagen; sí el carácter tipográfico.`
      : '',
    brandMood ? `Mood de marca: ${brandMood}.` : '',
    brandVisual ? `Descripción visual de marca: ${brandVisual}.` : '',
    `Color de marca: ${color} — úsalo en outline, glow o acentos del título de forma elegante (sin saturar).`,
  ].filter((line) => line.length > 0);

  if (input.hasStyleLockReference) {
    return [
      'TASK: IMAGE EDIT of style_lock_cover (plantilla canónica del menú).',
      'Genera UNA imagen VERTICAL 9:16. NO horizontal.',
      '',
      'Usando style_lock_cover como base, haz SOLO estos dos cambios:',
      `1) Sustituye el texto del título de categoría por exactamente: "${categoryUpper}".`,
      '   Conserva IDÉNTICOS: fuente, personalidad tipográfica, grosor, tratamiento (3D/plano/outline), color, tamaño y posición.',
      '2) Sustituye SOLO el collage de comida/bebida de la zona centro/inferior.',
      '',
      'NO cambies tipografía ni colores de marca.',
      logoRule,
      '',
      `Color de marca de referencia: ${color}.`,
      refsBlock,
      productBlock,
      notes ? `Notas: ${notes}` : '',
      '',
      'PROHIBIDO: inventar logo, cambiar la fuente del título, landscape, watermarks, UI, QR.',
      'Resultado: misma tipografía de marca; solo cambian el texto de categoría y la comida/bebida.',
    ]
      .filter((line) => line.length > 0)
      .join('\n');
  }

  return [
    'Genera UNA sola imagen VERTICAL 9:16 (retrato / story). NO horizontal.',
    'Banner publicitario premium para portada de categoría de menú digital.',
    'Esta será la PLANTILLA canónica: la tipografía debe poder repetirse idéntica en otras categorías.',
    '',
    'LAYOUT FIJO:',
    '1) Franja superior (~10% altura): vacía/atmosférica (sin logo; se añade después).',
    '2) Tercio superior-medio: NOMBRE DE CATEGORÍA hero.',
    '3) Centro/inferior (~55%): collage de productos fotorealistas.',
    '',
    `Nombre del negocio: ${business}.`,
    input.businessCategory ? `Rubro: ${sanitize(input.businessCategory)}.` : '',
    `Texto hero EXACTO: "${categoryUpper}".`,
    '',
    typeFromLogo,
    ...brandKitLines,
    '',
    'REGLAS DEL TÍTULO HERO:',
    '- Legible, centrado, peso fuerte, tamaño generoso.',
    '- Debe armonizar con el logo/marca (no pelear visualmente con él).',
    '- Tratamiento premium (leve profundidad, outline o contraste limpio) según la marca — NO fuerces metal 3D genérico si la marca es clásica/elegante/minimal.',
    '- Mayúsculas preferibles si encajan con la marca.',
    '- NO uses tipografía genérica de "anuncio de distribuidora" si no coincide con el logo.',
    '',
    logoRule,
    refsBlock,
    productBlock,
    notes ? `Notas: ${notes}` : '',
    '',
    'PROHIBIDO: dibujar logo/ícono de marca, landscape, watermarks, UI, QR, marcas famosas no autorizadas,',
    'tipografía que no combine con el logo (p. ej. chrome neon en un restaurante de cresta clásica).',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function sanitize(value: unknown, max = 180): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
