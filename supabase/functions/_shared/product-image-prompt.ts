export type ProductImagePromptInput = {
  productName: string;
  description?: string;
  categoryName?: string;
  businessName?: string;
  businessCategory?: string;
};

export type ProductVisualKind = 'food' | 'digital' | 'retail' | 'service';

export type DigitalVisualTheme =
  | 'streaming'
  | 'music'
  | 'gaming'
  | 'software'
  | 'telecom'
  | 'finance'
  | 'generic';

export type ProductImageStrategy =
  | 'food_real'
  | 'retail_catalog'
  | 'service_concept'
  | 'digital_branded_overlay_ready'
  | 'digital_generic_theme';

export type KnownBrandRecord = {
  id: string;
  label: string;
  theme: DigitalVisualTheme;
  /** Slug en Simple Icons (cdn.simpleicons.org) para overlay real */
  slug: string;
  /** Color hex sin # para el icono en overlay */
  iconColor: string;
};

const KNOWN_BRANDS: KnownBrandRecord[] = [
  { id: 'spotify', label: 'Spotify', theme: 'music', slug: 'spotify', iconColor: '1DB954' },
  { id: 'apple music', label: 'Apple Music', theme: 'music', slug: 'applemusic', iconColor: 'FA243C' },
  { id: 'deezer', label: 'Deezer', theme: 'music', slug: 'deezer', iconColor: 'FEAA2D' },
  { id: 'netflix', label: 'Netflix', theme: 'streaming', slug: 'netflix', iconColor: 'E50914' },
  { id: 'amazon prime', label: 'Amazon Prime', theme: 'streaming', slug: 'primevideo', iconColor: '00A8E1' },
  { id: 'disney', label: 'Disney+', theme: 'streaming', slug: 'disneyplus', iconColor: '113CCF' },
  { id: 'hbo max', label: 'HBO Max', theme: 'streaming', slug: 'hbomax', iconColor: 'B100FF' },
  { id: 'hbo', label: 'HBO Max', theme: 'streaming', slug: 'hbomax', iconColor: 'B100FF' },
  { id: 'youtube', label: 'YouTube', theme: 'streaming', slug: 'youtube', iconColor: 'FF0000' },
  { id: 'free fire', label: 'Free Fire', theme: 'gaming', slug: 'garena', iconColor: 'E53935' },
  { id: 'playstation', label: 'PlayStation', theme: 'gaming', slug: 'playstation', iconColor: '003791' },
  { id: 'xbox', label: 'Xbox', theme: 'gaming', slug: 'xbox', iconColor: '107C10' },
  { id: 'steam', label: 'Steam', theme: 'gaming', slug: 'steam', iconColor: '000000' },
  { id: 'discord', label: 'Discord', theme: 'software', slug: 'discord', iconColor: '5865F2' },
  { id: 'canva', label: 'Canva', theme: 'software', slug: 'canva', iconColor: '00C4CC' },
  { id: 'office', label: 'Microsoft Office', theme: 'software', slug: 'microsoftoffice', iconColor: 'EB3C00' },
  { id: 'microsoft', label: 'Microsoft', theme: 'software', slug: 'microsoft', iconColor: '5E5E5E' },
  { id: 'google', label: 'Google', theme: 'software', slug: 'google', iconColor: '4285F4' },
  { id: 'chatgpt', label: 'ChatGPT', theme: 'software', slug: 'openai', iconColor: '412991' },
  { id: 'binance', label: 'Binance', theme: 'finance', slug: 'binance', iconColor: 'F0B90B' },
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
  'perfil',
  'codigo',
  'código',
  'gift card',
  'giftcard',
  'tarjeta regalo',
];

const STREAMING_KEYWORDS = [
  'netflix',
  'disney',
  'hbo',
  'prime video',
  'streaming',
  'cine',
  'pelicula',
  'película',
  'serie',
  'series',
  'tv',
  'television',
  'televisión',
];

const MUSIC_KEYWORDS = [
  'spotify',
  'deezer',
  'apple music',
  'musica',
  'música',
  'music',
  'audio',
  'podcast',
];

const GAMING_KEYWORDS = [
  'free fire',
  'playstation',
  'xbox',
  'steam',
  'gaming',
  'videojuego',
  'game',
  'diamante',
  'roblox',
  'minecraft',
  'fortnite',
  'gamer',
  'consola',
];

const SOFTWARE_KEYWORDS = [
  'software',
  'office',
  'microsoft',
  'windows',
  'canva',
  'chatgpt',
  'openai',
  'google',
  'discord',
  'vpn',
  'hosting',
  'dominio',
  'cloud',
  'licencia',
  'antivirus',
  'adobe',
  'photoshop',
];

const TELECOM_KEYWORDS = [
  'recarga',
  'saldo',
  'datos',
  'megas',
  'gb',
  'sim',
  'chip',
  'telefono',
  'teléfono',
  'movil',
  'móvil',
  'celular',
  'operador',
];

const FINANCE_KEYWORDS = [
  'binance',
  'crypto',
  'cripto',
  'bitcoin',
  'wallet',
  'billetera',
  'finanzas',
  'pago',
  'transferencia',
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

const RETAIL_KEYWORDS = [
  'ropa',
  'moda',
  'zapato',
  'accesorio',
  'belleza',
  'maquillaje',
  'perfume',
  'electrodomestico',
  'electrodoméstico',
  'ferreteria',
  'ferretería',
  'mueble',
  'decoracion',
  'decoración',
  'jugueteria',
  'juguetería',
  'libro',
  'papeleria',
  'papelería',
  'farmacia',
  'suplemento',
  'vitamina',
  'mascota',
  'pet',
  'auto',
  'repuesto',
  'flor',
  'joya',
  'reloj',
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

function includesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

export function detectKnownBrandRecord(
  ...textParts: Array<string | undefined | null>
): KnownBrandRecord | null {
  const haystack = normalizeHaystack(textParts);
  let best: KnownBrandRecord | null = null;

  for (const brand of KNOWN_BRANDS) {
    if (!haystack.includes(brand.id)) {
      continue;
    }
    if (!best || brand.id.length > best.id.length) {
      best = brand;
    }
  }

  return best;
}

export function detectKnownBrand(productName: string): string | null {
  return detectKnownBrandRecord(productName)?.label ?? null;
}

function detectKnownBrandTheme(productName: string): DigitalVisualTheme | null {
  return detectKnownBrandRecord(productName)?.theme ?? null;
}

function hasDirectVisualRepresentation(
  kind: ProductVisualKind,
  input: ProductImagePromptInput,
): boolean {
  if (kind === 'food' || kind === 'retail') {
    return true;
  }

  if (kind === 'service') {
    const haystack = normalizeHaystack([
      input.productName,
      input.description,
      input.categoryName,
    ]);
    return /(unas|uñas|barber|corte|spa|masaje|reparacion|reparación|instalacion|instalación|mantenimiento|limpieza|consultoria|consultoría|asesoria|asesoría|servicio)/.test(
      haystack,
    );
  }

  return false;
}

export function detectDigitalVisualTheme(input: ProductImagePromptInput): DigitalVisualTheme {
  const haystack = normalizeHaystack([
    input.productName,
    input.description,
    input.categoryName,
    input.businessName,
    input.businessCategory,
  ]);

  const brandTheme = detectKnownBrandTheme(input.productName);
  if (brandTheme) {
    return brandTheme;
  }

  if (includesAny(haystack, STREAMING_KEYWORDS)) {
    return 'streaming';
  }
  if (includesAny(haystack, MUSIC_KEYWORDS)) {
    return 'music';
  }
  if (includesAny(haystack, GAMING_KEYWORDS)) {
    return 'gaming';
  }
  if (includesAny(haystack, SOFTWARE_KEYWORDS)) {
    return 'software';
  }
  if (includesAny(haystack, TELECOM_KEYWORDS)) {
    return 'telecom';
  }
  if (includesAny(haystack, FINANCE_KEYWORDS)) {
    return 'finance';
  }

  return 'generic';
}

export function detectProductVisualKind(input: ProductImagePromptInput): ProductVisualKind {
  const haystack = normalizeHaystack([
    input.productName,
    input.description,
    input.categoryName,
    input.businessName,
    input.businessCategory,
  ]);

  if (includesAny(haystack, DIGITAL_KEYWORDS)) {
    return 'digital';
  }

  if (/(digital|streaming|software|tecnolog|electron|e-?commerce|recarga|membres)/.test(haystack)) {
    return 'digital';
  }

  if (includesAny(haystack, FOOD_KEYWORDS)) {
    return 'food';
  }

  if (/(restaur|comida|gastron|cafeteria|panader|pizzer)/.test(haystack)) {
    return 'food';
  }

  if (/(servicio|consultor|asesor|reparacion|reparación|mantenimiento|limpieza|instalacion|instalación)/.test(haystack)) {
    return 'service';
  }

  if (includesAny(haystack, RETAIL_KEYWORDS)) {
    return 'retail';
  }

  return 'retail';
}

function digitalThemeInstructions(
  theme: DigitalVisualTheme,
  knownBrand: string | null,
): string[] {
  const brandedLine = knownBrand
    ? [
        `Marca detectada: ${knownBrand}. El logo oficial se agregará automáticamente después.`,
        'CRÍTICO: NO dibujes ningún logo, NO escribas el nombre de la marca, NO imites tipografía corporativa.',
        'Genera SOLO fondo/escena/ambiente temático con espacio central limpio y vacío.',
      ]
    : [
        'Representa el servicio descrito en el nombre del producto, no un producto genérico de otra categoría.',
      ];

  const shared = [
    'Genera una imagen comercial cuadrada 1:1 para un producto o servicio DIGITAL.',
    ...brandedLine,
    'Fondo limpio premium (degradado suave u oscuro elegante) acorde al servicio.',
    'NO generes comida, platos, postres, bebidas ni fotografía gastronómica.',
    'NO incluyas capturas falsas de interfaces reales ni texto legible inventado.',
  ];

  switch (theme) {
    case 'streaming':
      return [
        ...shared,
        'Tema: STREAMING de video (series, películas, entretenimiento).',
        'Elementos permitidos: pantalla/TV, control remoto, ambiente cinematográfico, botón play, marco de película, sofá de sala.',
        'PROHIBIDO: auriculares, ondas de sonido, notas musicales, ecualizadores, micrófonos.',
      ];
    case 'music':
      return [
        ...shared,
        'Tema: MÚSICA o audio streaming.',
        'Elementos permitidos: auriculares, ondas de sonido sutiles, altavoz, interfaz de reproductor.',
        'PROHIBIDO: pantallas de cine gigantes, palomitas, claqueta de cine.',
      ];
    case 'gaming':
      return [
        ...shared,
        'Tema: VIDEOJUEGOS o recargas gaming.',
        'Elementos permitidos: mando/consola, elementos gaming abstractos, energía digital, diamantes/coins si aplica.',
        'PROHIBIDO: auriculares de DJ, notas musicales, comida.',
      ];
    case 'software':
      return [
        ...shared,
        'Tema: SOFTWARE, apps o herramientas digitales.',
        'Elementos permitidos: laptop, tablet, interfaz de app genérica, íconos de productividad, nube.',
        'PROHIBIDO: auriculares, ondas de sonido, consolas de videojuegos.',
      ];
    case 'telecom':
      return [
        ...shared,
        'Tema: RECARGA, saldo o servicio móvil/telecom.',
        'Elementos permitidos: smartphone, señal, datos, chip SIM, ondas de conectividad (no de audio).',
        'PROHIBIDO: auriculares grandes, notas musicales, comida.',
      ];
    case 'finance':
      return [
        ...shared,
        'Tema: FINANZAS digitales, crypto o pagos.',
        'Elementos permitidos: monedas abstractas, gráficos, billetera digital, candado de seguridad.',
        'PROHIBIDO: auriculares, comida, consolas.',
      ];
    default:
      return [
        ...shared,
        'Infiere el tipo de servicio desde el nombre del producto y la categoría.',
        'Usa elementos visuales coherentes con ESE servicio específico (streaming, gaming, software, recarga, etc.).',
        'NO uses auriculares ni ondas de sonido por defecto; solo si el producto es claramente de música.',
        'NO mezcles iconografía de categorías distintas (ej. Netflix no debe verse como Spotify).',
      ];
  }
}

function styleInstructions(
  strategy: ProductImageStrategy,
  input: ProductImagePromptInput,
  knownBrand: string | null,
): string[] {
  switch (strategy) {
    case 'food_real':
      return [
        'Genera una fotografía gastronómica profesional, realista y apetecible de la comida real que se vende.',
        'Muestra claramente el plato/alimento principal como protagonista comprable.',
        'Encuadre cercano, iluminación gastronómica cuidada, fondo limpio o ambiente controlado.',
        'NO collage, NO manos, NO conceptos abstractos si el plato puede mostrarse directamente.',
      ];
    case 'retail_catalog':
      return [
        'Genera una fotografía de catálogo del producto físico real que se está vendiendo.',
        'Producto principal centrado, fondo limpio, iluminación de estudio suave, encuadre 1:1.',
        'Debe parecer ecommerce/packshot, no banner abstracto.',
        'NO collage, NO manos, NO texto legible innecesario.',
      ];
    case 'service_concept':
      return [
        'Genera una imagen comercial profesional que represente claramente el servicio descrito.',
        'Muestra resultado, herramientas, entorno o metáfora visual del servicio.',
        'Composición limpia, moderna y confiable para catálogo digital.',
        'No fuerces producto físico inexistente y evita look de stock genérico sin relación.',
      ];
    case 'digital_branded_overlay_ready':
      return [
        ...digitalThemeInstructions(detectDigitalVisualTheme(input), knownBrand),
        'Estrategia híbrida: solo fondo temático; el sistema superpone el logo oficial real después.',
      ];
    case 'digital_generic_theme':
      return [
        ...digitalThemeInstructions(detectDigitalVisualTheme(input), null),
        'No hay marca verificada: usa imagen temática genérica del servicio digital sin logos inventados.',
      ];
    default:
      return ['Genera una imagen comercial clara y fiel al producto vendido.'];
  }
}

export function selectProductImageStrategy(input: ProductImagePromptInput): ProductImageStrategy {
  const kind = detectProductVisualKind(input);
  const knownBrand = detectKnownBrand(input.productName);
  const hasDirectVisual = hasDirectVisualRepresentation(kind, input);

  if (kind === 'food' && hasDirectVisual) {
    return 'food_real';
  }

  if (kind === 'retail' && hasDirectVisual) {
    return 'retail_catalog';
  }

  if (kind === 'service') {
    return 'service_concept';
  }

  if (kind === 'digital' && knownBrand) {
    return 'digital_branded_overlay_ready';
  }

  return 'digital_generic_theme';
}

export function buildProductImagePrompt(input: ProductImagePromptInput): string {
  const kind = detectProductVisualKind(input);
  const knownBrand = detectKnownBrand(input.productName);
  const strategy = selectProductImageStrategy(input);
  const commonConstraints = knownBrand
    ? [
        'Sin texto adicional redundante, sin collage, sin manos.',
        'Composición cuadrada 1:1, alta calidad, enfoque nítido.',
      ]
    : [
        'Sin texto legible, sin marcas registradas inventadas, sin manos, sin collage.',
        'Composición cuadrada 1:1, alta calidad, enfoque nítido.',
      ];

  const parts = [
    input.businessName ? `Negocio: ${input.businessName}.` : '',
    input.businessCategory ? `Rubro del negocio: ${input.businessCategory}.` : '',
    `Producto: ${input.productName}.`,
    input.categoryName ? `Categoría: ${input.categoryName}.` : '',
    input.description ? `Descripción: ${input.description}.` : '',
    `Tipo visual detectado: ${kind}.`,
    `Estrategia visual: ${strategy}.`,
    ...styleInstructions(strategy, input, knownBrand),
    ...commonConstraints,
  ];

  return parts.filter((part) => part.length > 0).join(' ');
}

export function buildProductDescriptionSystemPrompt(kind: ProductVisualKind): string {
  switch (kind) {
    case 'food':
      return (
        'Eres copywriter gastronómico para menús digitales. ' +
        'Redactas descripciones cortas, claras y apetitosas en español. ' +
        'Responde ÚNICAMENTE JSON válido: {"description": string}. ' +
        'La descripción debe tener entre 1 y 3 oraciones (máximo 280 caracteres), sin emojis, sin comillas extra.'
      );
    case 'digital':
      return (
        'Eres copywriter de ecommerce para productos y servicios digitales (streaming, gaming, software, recargas, membresías, telecom). ' +
        'Redactas descripciones cortas en español enfocadas en beneficio, duración/plan y entrega digital. ' +
        'Adapta el tono al tipo de servicio (Netflix ≠ Spotify ≠ Free Fire). ' +
        'NUNCA uses lenguaje de comida (sabor, antojo, apetito, plato, ingredientes, cocina). ' +
        'Responde ÚNICAMENTE JSON válido: {"description": string}. ' +
        'La descripción debe tener entre 1 y 3 oraciones (máximo 280 caracteres), sin emojis.'
      );
    case 'service':
      return (
        'Eres copywriter comercial para servicios profesionales. ' +
        'Redactas descripciones cortas en español sobre valor, alcance y confianza. ' +
        'No uses lenguaje gastronómico. ' +
        'Responde ÚNICAMENTE JSON válido: {"description": string}. ' +
        'Máximo 280 caracteres, sin emojis.'
      );
    default:
      return (
        'Eres copywriter de ecommerce. ' +
        'Redactas descripciones cortas y comerciales en español para catálogos digitales. ' +
        'No uses lenguaje gastronómico salvo que el producto sea comida. ' +
        'Responde ÚNICAMENTE JSON válido: {"description": string}. ' +
        'Máximo 280 caracteres, sin emojis.'
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
  const digitalTheme = kind === 'digital' ? detectDigitalVisualTheme(input) : null;
  const hasUsefulContext = !isRedundantProductDescription(
    input.productName,
    input.description,
  );

  const themeHint =
    digitalTheme === 'streaming'
      ? 'Enfócate en entretenimiento, series/películas y acceso digital.'
      : digitalTheme === 'music'
        ? 'Enfócate en música, audio y beneficios del plan.'
        : digitalTheme === 'gaming'
          ? 'Enfócate en gaming, recargas o membresía de juego.'
          : digitalTheme === 'software'
            ? 'Enfócate en productividad, apps o licencias.'
            : digitalTheme === 'telecom'
              ? 'Enfócate en recarga, saldo o conectividad móvil.'
              : digitalTheme === 'finance'
                ? 'Enfócate en pagos, crypto o finanzas digitales.'
                : kind === 'digital'
                  ? 'Explica el servicio digital según su nombre y categoría.'
                  : kind === 'food'
                    ? 'Enfócate en sabor, presentación y por qué conviene pedirlo.'
                    : 'Enfócate en beneficio principal y por qué conviene comprarlo.';

  const parts = [
    input.businessName ? `Negocio: ${input.businessName}.` : '',
    input.businessCategory ? `Rubro: ${input.businessCategory}.` : '',
    `Producto: ${input.productName}.`,
    input.categoryName ? `Categoría: ${input.categoryName}.` : '',
    hasUsefulContext && input.description
      ? `Notas del vendedor (no copies literalmente): ${input.description}.`
      : '',
    knownBrand ? `Marca detectada: ${knownBrand}.` : '',
    themeHint,
    'Escribe una descripción nueva en español, clara y comercial.',
    'NO repitas solo el nombre del producto. NO empieces con "Nombre: Nombre".',
    'Máximo 280 caracteres, 1 a 3 oraciones, sin emojis.',
  ];

  return parts.filter((part) => part.length > 0).join(' ');
}
