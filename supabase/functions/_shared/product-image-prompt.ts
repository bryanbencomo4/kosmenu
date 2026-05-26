export type ProductImagePromptInput = {
  productName: string;
  description?: string;
  categoryName?: string;
  businessName?: string;
  businessCategory?: string;
};

export type ProductVisualKind = 'food' | 'digital' | 'retail' | 'service';

const KNOWN_BRANDS: Array<{ id: string; label: string }> = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'netflix', label: 'Netflix' },
  { id: 'amazon prime', label: 'Amazon Prime' },
  { id: 'disney', label: 'Disney+' },
  { id: 'hbo', label: 'HBO Max' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'apple music', label: 'Apple Music' },
  { id: 'deezer', label: 'Deezer' },
  { id: 'free fire', label: 'Free Fire' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'steam', label: 'Steam' },
  { id: 'discord', label: 'Discord' },
  { id: 'canva', label: 'Canva' },
  { id: 'office', label: 'Microsoft Office' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'google', label: 'Google' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'binance', label: 'Binance' },
];

const DIGITAL_KEYWORDS = [
  'spotify',
  'netflix',
  'amazon prime',
  'disney',
  'hbo',
  'streaming',
  'premium',
  'gaming',
  'free fire',
  'playstation',
  'xbox',
  'steam',
  'discord',
  'recarga',
  'diamante',
  'suscripcion',
  'suscripción',
  'digital',
  'software',
  'app',
  'licencia',
  'vpn',
  'hosting',
  'dominio',
  'cloud',
  'musica',
  'música',
  'music',
  'videojuego',
  'game',
  'cuenta',
  'membresia',
  'membresía',
  'canva',
  'office',
  'youtube',
  'deezer',
  'apple music',
  'productos digitales',
  'servicio digital',
];

const FOOD_KEYWORDS = [
  'comida',
  'restaur',
  'gastron',
  'pollo',
  'pizza',
  'hamburgues',
  'burger',
  'postre',
  'bebida',
  'cafe',
  'café',
  'pastel',
  'tacos',
  'sushi',
  'marisco',
  'pescado',
  'asado',
  'parrilla',
  'panader',
  'helado',
  'desayuno',
  'almuerzo',
  'cena',
  'antoj',
  'snack',
  'comida rapida',
  'comida rápida',
];

function normalizeHaystack(parts: Array<string | undefined | null>): string {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function detectKnownBrand(productName: string): string | null {
  const haystack = normalizeHaystack([productName]);
  let best: { id: string; label: string } | null = null;

  for (const brand of KNOWN_BRANDS) {
    if (!haystack.includes(brand.id)) {
      continue;
    }
    if (!best || brand.id.length > best.id.length) {
      best = brand;
    }
  }

  return best?.label ?? null;
}

export function detectProductVisualKind(input: ProductImagePromptInput): ProductVisualKind {
  const haystack = normalizeHaystack([
    input.productName,
    input.description,
    input.categoryName,
    input.businessName,
    input.businessCategory,
  ]);

  if (DIGITAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'digital';
  }

  if (/(digital|streaming|software|tecnolog|electron)/.test(haystack)) {
    return 'digital';
  }

  if (FOOD_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'food';
  }

  if (/(restaur|comida|gastron|cafeteria|panader|pizzer)/.test(haystack)) {
    return 'food';
  }

  if (/(servicio|consultor|asesor|reparacion|reparación|mantenimiento)/.test(haystack)) {
    return 'service';
  }

  return 'retail';
}

function styleInstructions(kind: ProductVisualKind, knownBrand: string | null): string[] {
  if (kind === 'digital' && knownBrand) {
    return [
      `Genera una imagen comercial cuadrada 1:1 para el servicio digital ${knownBrand}.`,
      `El logo oficial reconocible de ${knownBrand} debe ser el elemento principal: centrado, nítido y bien iluminado.`,
      'Fondo limpio premium (oscuro o degradado suave) acorde al estilo de la marca.',
      'Puedes incluir elementos sutiles del servicio (auriculares, ondas, pantalla) sin tapar el logo.',
      'NO generes comida, platos, postres, bebidas ni fotografia gastronomica.',
    ];
  }

  switch (kind) {
    case 'food':
      return [
        'Genera una fotografia gastronomica profesional, realista y apetecible del producto o plato listo para ecommerce.',
        'Encuadre cercano sobre el alimento, fondo limpio, iluminacion de estudio suave.',
      ];
    case 'digital':
      return [
        'Genera una imagen comercial premium para un producto o servicio DIGITAL (no comida).',
        'Estilo tech/moderno acorde al servicio: dispositivos, interfaces genericas, ondas de sonido o elementos abstractos.',
        'NO generes comida, platos, postres, bebidas, ingredientes ni fotografia gastronomica.',
      ];
    case 'service':
      return [
        'Genera una imagen comercial profesional que represente el servicio descrito (no comida).',
        'Composicion limpia, moderna y confiable, apta para catalogo digital.',
      ];
    default:
      return [
        'Genera una fotografia comercial profesional y realista del producto para ecommerce.',
        'Producto centrado, fondo limpio, luz de estudio suave, encuadre 1:1.',
      ];
  }
}

export function buildProductImagePrompt(input: ProductImagePromptInput): string {
  const kind = detectProductVisualKind(input);
  const knownBrand = detectKnownBrand(input.productName);
  const commonConstraints = knownBrand
    ? [
        'Sin texto adicional redundante, sin collage, sin manos.',
        'Composicion cuadrada 1:1, alta calidad, enfoque nitido.',
      ]
    : [
        'Sin texto legible, sin marcas registradas, sin manos, sin collage.',
        'Composicion cuadrada 1:1, alta calidad, enfoque nitido.',
      ];

  const parts = [
    input.businessName ? `Negocio: ${input.businessName}.` : '',
    input.businessCategory ? `Rubro del negocio: ${input.businessCategory}.` : '',
    `Producto: ${input.productName}.`,
    input.categoryName ? `Categoria: ${input.categoryName}.` : '',
    input.description ? `Descripcion: ${input.description}.` : '',
    ...styleInstructions(kind, knownBrand),
    ...commonConstraints,
  ];

  return parts.filter((part) => part.length > 0).join(' ');
}

export function buildProductDescriptionSystemPrompt(kind: ProductVisualKind): string {
  switch (kind) {
    case 'food':
      return (
        'Eres copywriter gastronomico para menus digitales. ' +
        'Redactas descripciones cortas, claras y apetitosas en espanol. ' +
        'Responde UNICAMENTE JSON valido: {"description": string}. ' +
        'La descripcion debe tener entre 1 y 3 oraciones (maximo 280 caracteres), sin emojis, sin comillas extra.'
      );
    case 'digital':
      return (
        'Eres copywriter de ecommerce para productos y servicios digitales (streaming, gaming, software, recargas, membresias). ' +
        'Redactas descripciones cortas en espanol enfocadas en beneficio, duracion/plan y entrega digital. ' +
        'NUNCA uses lenguaje de comida (sabor, antojo, apetito, plato, ingredientes, cocina). ' +
        'Responde UNICAMENTE JSON valido: {"description": string}. ' +
        'La descripcion debe tener entre 1 y 3 oraciones (maximo 280 caracteres), sin emojis.'
      );
    case 'service':
      return (
        'Eres copywriter comercial para servicios profesionales. ' +
        'Redactas descripciones cortas en espanol sobre valor, alcance y confianza. ' +
        'No uses lenguaje gastronomico. ' +
        'Responde UNICAMENTE JSON valido: {"description": string}. ' +
        'Maximo 280 caracteres, sin emojis.'
      );
    default:
      return (
        'Eres copywriter de ecommerce. ' +
        'Redactas descripciones cortas y comerciales en espanol para catalogos digitales. ' +
        'No uses lenguaje gastronomico salvo que el producto sea comida. ' +
        'Responde UNICAMENTE JSON valido: {"description": string}. ' +
        'Maximo 280 caracteres, sin emojis.'
      );
  }
}

function isRedundantProductDescription(productName: string, description?: string): boolean {
  const name = normalizeHaystack([productName]);
  const text = normalizeHaystack([description]);
  if (!text) {
    return true;
  }
  if (text === name) {
    return true;
  }
  if (text.startsWith(`${name}:`) || text.startsWith(`${name} -`)) {
    return true;
  }
  return false;
}

export function buildProductDescriptionUserPrompt(input: ProductImagePromptInput): string {
  const kind = detectProductVisualKind(input);
  const knownBrand = detectKnownBrand(input.productName);
  const hasUsefulContext = !isRedundantProductDescription(
    input.productName,
    input.description,
  );

  const parts = [
    input.businessName ? `Negocio: ${input.businessName}.` : '',
    input.businessCategory ? `Rubro: ${input.businessCategory}.` : '',
    `Producto: ${input.productName}.`,
    input.categoryName ? `Categoria: ${input.categoryName}.` : '',
    hasUsefulContext && input.description
      ? `Notas del vendedor (no copies literalmente): ${input.description}.`
      : '',
    knownBrand ? `Marca detectada: ${knownBrand}.` : '',
    kind === 'digital'
      ? 'Explica que es el servicio, el plan o la recarga, sus beneficios principales y la entrega digital. No describas comida.'
      : kind === 'food'
        ? 'Enfocate en sabor, presentacion y por que conviene pedirlo.'
        : 'Enfocate en beneficio principal y por que conviene comprarlo.',
    'Escribe una descripcion nueva en espanol, clara y comercial.',
    'NO repitas solo el nombre del producto. NO empieces con "Nombre: Nombre".',
    'Maximo 280 caracteres, 1 a 3 oraciones, sin emojis.',
  ];

  return parts.filter((part) => part.length > 0).join(' ');
}
