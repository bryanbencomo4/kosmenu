/**
 * Canonical published knowledge for WhatsApp Master (central ElMenúXFA).
 * Keep copy aligned with business.elmenuxfa.com — do not invent plans or features.
 */

export const PLATFORM_BRAND = 'elmenuxfa.com';

export const PLATFORM_WHAT_IS = [
  `*${PLATFORM_BRAND}* es la plataforma de menú digital para restaurantes.`,
  'Tus clientes ven productos y precios, piden delivery o retiro, y tú gestionas todo desde el panel / asistente del negocio.',
].join('\n');

export const PLATFORM_HOW_IT_WORKS = [
  '1) Registras tu negocio y armás el menú (productos, precios, fotos).',
  '2) Compartes el enlace o QR del menú.',
  '3) Los clientes exploran y piden; tú recibes y atiendes pedidos desde el panel.',
].join('\n');

/** Published launch pricing (business landing). Update here only. */
export const PLATFORM_PLANS = {
  kitLaunchUsd: 10,
  platformMonthlyUsd: 10,
  platformYearlyUsd: 90,
  kitLabel: 'Kit Portamenú Inteligente (lanzamiento)',
  platformLabel: 'Plataforma',
} as const;

export function formatPublishedPricing(businessLandingUrl: string): string {
  const p = PLATFORM_PLANS;
  return [
    `¡Claro! 😊 Hoy *${PLATFORM_BRAND}* publica:`,
    `• *${p.kitLabel}:* *$${p.kitLaunchUsd}*`,
    `• *${p.platformLabel}:* *$${p.platformMonthlyUsd}/mes* o *$${p.platformYearlyUsd}/año*`,
    '',
    `Detalle y condiciones: ${businessLandingUrl}`,
    'Si quieres registrar tu menú, dímelo y te oriento.',
  ].join('\n');
}

export const PLATFORM_MERCHANT_FEATURES = [
  'Menú digital con categorías, precios y disponibilidad.',
  'Pedidos con delivery / retiro (según lo configures).',
  'Enlaces y QR para compartir el menú.',
  'Asistente del negocio en app.elmenuxfa.com/asistente (con tu cuenta).',
  'Panel de conversaciones para atender clientes cuando la supervisión está activa.',
].join('\n• ');

export const PLATFORM_LIMITATIONS = [
  'No pedimos ni guardamos contraseñas por WhatsApp.',
  'No inventamos restaurantes, precios ni ciudades que no hayas dicho o que no estén en el sistema.',
  'Cambios administrativos del menú requieren tu sesión verificada en el panel / asistente.',
  'El WhatsApp central no es el canal de pedidos de cada restaurante: para pedir usa el menú del local.',
].join('\n• ');

export const PLATFORM_FAQ: Array<{ id: string; q: RegExp; answer: string }> = [
  {
    id: 'qr',
    q: /\b(qr|c[oó]digo qr|codigo qr)\b/i,
    answer:
      'Cada negocio tiene un enlace de menú que puedes convertir en QR. Desde el panel o el asistente del negocio te ayudo a obtener el enlace correcto.',
  },
  {
    id: 'delivery',
    q: /\b(delivery|domicilio|env[ií]o)\b/i,
    answer:
      'El delivery lo configura cada restaurante. Como cliente, entra al menú del local y elige delivery si está activo. Como negocio, lo gestionas en el panel / asistente.',
  },
  {
    id: 'register',
    q: /\b(c[oó]mo me registro|como registro|crear cuenta|abrir cuenta)\b/i,
    answer:
      'Para registrar tu restaurante te paso al asistente de negocios (con handoff seguro). Dime el nombre de tu negocio y te oriento.',
  },
  {
    id: 'support',
    q: /\b(no funciona|error|falla|bug)\b/i,
    answer:
      'Cuéntame qué pasó (pantalla, enlace o pedido). Si no lo resolvemos aquí, abro un ticket para que un asesor te contacte.',
  },
];

export function matchPlatformFaq(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const row of PLATFORM_FAQ) {
    if (row.q.test(t)) return row.answer;
  }
  return null;
}

/** Open greeting — NL first; numbers only as optional shortcuts. */
export function openWelcomeUnknown(): string {
  return [
    `¡Hola! 👋 Bienvenido a *${PLATFORM_BRAND}*.`,
    '',
    'Puedo ayudarte a *buscar comida*, *crear el menú de tu negocio*, o *resolver dudas* de la plataforma.',
    '',
    'Cuéntame en tus palabras qué necesitas.',
    '',
    '_Si prefieres atajos:_ 1 pedir · 2 crear menú · 3 ya tengo negocio · 8 soporte · 9 asesor',
  ].join('\n');
}

export function openWelcomeConsumer(): string {
  return [
    '¡Hola de nuevo! 😊',
    '',
    '¿Buscas un restaurante, un plato o ayuda con un pedido?',
    '',
    '_Atajos:_ 1 buscar · 2 delivery · 3 cerca · 8 soporte · 9 asesor',
  ].join('\n');
}

export function openWelcomeProspect(): string {
  return [
    `¡Perfecto! Te ayudo a llevar tu negocio a *${PLATFORM_BRAND}* 🏪`,
    '',
    'Puedo explicarte cómo funciona, precios o ayudarte a registrar el menú.',
    '',
    '_Atajos:_ 1 cómo funciona · 2 precios · 3 registrar · 8 soporte · 9 asesor',
  ].join('\n');
}

export function openWelcomeRegistered(businessName?: string | null): string {
  const title = businessName?.trim()
    ? `Hola 👋 ¿Qué necesitas para *${businessName.trim()}*?`
    : 'Hola 👋 ¿Qué necesitas para tu negocio?';
  return [
    title,
    '',
    'Puedo ayudarte con enlaces del menú, productos, precios o el asistente del negocio.',
    '',
    '_Atajos:_ 1 enlaces · 2 productos · 3 precios · 8 soporte · 9 asesor',
  ].join('\n');
}
