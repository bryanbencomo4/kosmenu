/**
 * "Bebidas", "jugos", "zapatos", "¿tienen cargadores?", "cuánto cuesta la coca cola":
 * a product named WITHOUT saying what the person wants to do with it.
 *
 * For someone whose phone number has a business registered with us the same words can mean two
 * different things:
 *   - CONSUME: order it (at some restaurant — possibly another business, not their own), or
 *   - MANAGE : edit / price / (de)activate it in THEIR OWN menu.
 * Guessing "search the directory" was wrong half of the time, so the brain asks first.
 *
 * Hard rule: this module returns null unless `hasShops` is true. A number with no registered
 * business is never asked this question — its query goes through the normal flows untouched.
 *
 * Pure and deterministic: no I/O.
 */

import { fold, type TopicResult } from './topics';

export type ProductAmbiguity = {
  /** The product as the person wrote it (accents and ñ kept), e.g. "bebidas", "coca cola". */
  product: string;
  /** `bare` = just the noun phrase; `question` = "¿tienen X?" / "cuánto cuesta X" without a restaurant on the table. */
  form: 'bare' | 'question';
};

export type ProductIntentInput = {
  text: string;
  /** The number the message comes from is linked to at least one registered business. */
  hasShops: boolean;
  /** A restaurant is open in the conversation ("¿qué bebidas tiene?" then refers to IT). */
  hasActiveRestaurant: boolean;
  tr: Pick<TopicResult, 'topic' | 'cities'>;
};

const GLUE = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'e', 'u', 'para', 'con', 'sin', 'por',
  'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'algo', 'alguna', 'algun', 'algunos', 'algunas', 'otro', 'otra', 'otros', 'otras',
]);

/** Words that are NOT a product: chat filler, platform/ops vocabulary, places, time, and words that already state an intent. */
const NOT_PRODUCT = new Set([
  // chat filler / answers
  'hola', 'buenas', 'buenos', 'buen', 'dia', 'dias', 'tarde', 'tardes', 'noche', 'noches', 'hey', 'oye', 'gracias', 'ok', 'okey', 'okay',
  'vale', 'listo', 'lista', 'dale', 'perfecto', 'claro', 'bien', 'bueno', 'genial', 'si', 'no', 'nada', 'ya', 'entiendo', 'entendido',
  'favor', 'porfa', 'porfavor', 'ayuda', 'ayudame', 'help', 'informacion', 'info', 'duda', 'consulta', 'pregunta', 'tema',
  'que', 'cual', 'cuales', 'como', 'donde', 'cuando', 'cuanto', 'cuantos', 'cuanta', 'cuantas', 'quien', 'porque', 'hay', 'tiene', 'tienen',
  'venden', 'vende', 'es', 'son', 'esta', 'estan', 'tambien', 'solo', 'solamente', 'mas', 'menos', 'muy', 'mucho', 'poco', 'todo', 'todos', 'todas',
  'esto', 'eso', 'ese', 'esa', 'estos', 'esos', 'este', 'esta', 'aqui', 'alli', 'alla', 'ahora', 'hoy', 'manana', 'luego', 'despues', 'antes', 'primero',
  // people / roles / platform / ops
  'asesor', 'asesora', 'humano', 'persona', 'bot', 'asistente', 'agente', 'soporte', 'menu', 'menus', 'carta', 'cartas', 'catalogo', 'directorio',
  'enlace', 'link', 'qr', 'cuenta', 'sesion', 'clave', 'contrasena', 'password', 'codigo', 'negocio', 'negocios', 'restaurante', 'restaurantes',
  'local', 'locales', 'comercio', 'comercios', 'tienda', 'tiendas', 'pedido', 'pedidos', 'orden', 'ordenes', 'delivery', 'domicilio', 'envio',
  'precio', 'precios', 'plan', 'planes', 'pago', 'pagos', 'horario', 'tasa', 'ventas', 'venta', 'cliente', 'clientes', 'suscripcion',
  'foto', 'fotos', 'logo', 'inventario', 'opciones', 'opcion', 'cerca', 'lugar', 'sitio', 'zona', 'ciudad', 'ubicacion', 'direccion',
  // verbs that already state an intent (order / search / manage)
  'quiero', 'quisiera', 'necesito', 'busco', 'buscar', 'dame', 'dime', 'pasame', 'mandame', 'muestrame', 'pedir', 'pido', 'comprar', 'compro',
  'consumir', 'comer', 'ordenar', 'ver', 'cambiar', 'cambia', 'editar', 'edita', 'agregar', 'agrega', 'anadir', 'poner', 'pon', 'quitar', 'quita',
  'borrar', 'elimina', 'eliminar', 'crear', 'crea', 'gestionar', 'gestiona', 'administrar', 'actualizar', 'actualiza', 'modificar', 'subir', 'bajar',
  'agotar', 'agotado', 'agotados', 'agotada', 'agotadas', 'activar', 'desactivar', 'ocultar', 'mostrar', 'registrar', 'hablar', 'llamar',
  'tengo', 'tenemos', 'vendo', 'vendemos', 'ofrezco', 'manejo', 'mi', 'nuestro', 'nuestra',
]);

/** Infinitives look like verbs ("hacer", "vender") — except a few real products. */
const VERB_LIKE_PRODUCTS = new Set(['azucar', 'calamar', 'cilantro', 'mantequilla', 'cereal', 'pilsener', 'celular', 'collar', 'pulsar']);

const QUESTION_LEAD =
  /^(?:que|cuales|cuantos|cuantas)\s+(?=.+\b(?:tienen|tiene|hay|venden|vende|manejan|ofrecen)\b)|^(?:hay|tienen|tiene|venden|vende|manejan|ofrecen)\s+|^(?:cuanto\s+(?:cuesta|cuestan|vale|valen|sale|salen))\s+|^(?:precio|precios|valor|costo)\s+(?:de|del|de la|de los|de las)\s+|^(?:informacion|info|datos)\s+(?:de|del|de la|sobre)\s+|^sobre\s+/;
const QUESTION_TAIL = /\s+(?:tienen|tiene|hay|venden|vende|manejan|ofrecen|cuestan|cuesta|valen|vale)$/;

function tokensOf(original: string): Array<{ raw: string; folded: string }> {
  const raw = original.match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.map((r) => ({ raw: r, folded: fold(r) }));
}

/**
 * Is this message just a product, with no stated intent?  Returns null for anything else (and ALWAYS
 * for numbers with no registered business).
 */
export function detectAmbiguousProduct(input: ProductIntentInput): ProductAmbiguity | null {
  if (!input.hasShops) return null; // the clarifying question exists only for registered businesses
  const original = (input.text || '').trim();
  if (!original || original.length > 60) return null;
  if (/\d|https?:|www\.|@/.test(original)) return null;
  // A place was named: that is a located search, not an ambiguity.
  if (input.tr.cities.length > 0) return null;
  if (!['unknown', 'search_food', 'pricing'].includes(input.tr.topic)) return null;

  const t = fold(original).replace(/[?!.,;:"()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;

  // "¿qué bebidas tienen?" / "¿tienen pizza?" / "cuánto cuesta la coca cola": the product is the rest.
  const lead = QUESTION_LEAD.exec(t);
  const form: ProductAmbiguity['form'] = lead || QUESTION_TAIL.test(t) ? 'question' : 'bare';
  // With a restaurant open, "tiene/hay" talks about THAT restaurant: its own menu flow answers.
  if (form === 'question' && input.hasActiveRestaurant) return null;
  if (input.tr.topic === 'pricing' && form !== 'question') return null;

  let phrase = t;
  if (lead) phrase = phrase.slice(lead[0].length);
  phrase = phrase.replace(QUESTION_TAIL, '').trim();
  if (!phrase) return null;

  const toks = tokensOf(original);
  const phraseWords = phrase.split(' ').filter(Boolean);
  const content: Array<{ raw: string; folded: string }> = [];
  for (const w of phraseWords) {
    if (GLUE.has(w)) continue;
    const tok = toks.find((x) => x.folded === w) ?? { raw: w, folded: w };
    content.push(tok);
  }
  if (content.length < 1 || content.length > 3) return null;
  for (const { folded } of content) {
    if (folded.length < 3) return null;
    if (NOT_PRODUCT.has(folded)) return null;
    if (/(?:ar|er|ir)$/.test(folded) && folded.length >= 4 && !VERB_LIKE_PRODUCTS.has(folded)) return null; // an infinitive = a stated action
  }
  // A bare phrase with a verb-ish conjugation ("quiero…" is already blocked) must not hide a sentence.
  if (phraseWords.length > 5) return null;

  return { product: content.map((c) => c.raw.toLowerCase()).join(' '), form };
}

export type ProductIntentAnswer = 'consume' | 'manage' | 'unclear';

const CONSUME_RE = /\b(?:pedir|pedirlo|pedirla|pedirlos|pedirlas|consum\w*|compr\w*|ordenar|ordenarlo|comer|comerlo|probar|probarlo|buscar\w*|encontrar|conseguir|otro (?:negocio|restaurante|local)|en otro|para mi|lo quiero (?:pedir|comer|consumir))\b/;
const MANAGE_RE = /\b(?:gestion\w*|administr\w*|edit\w*|agreg\w*|anad\w*|modific\w*|actualiz\w*|cambi\w*|inventario|agotad\w*|activ\w*|ocult\w*|precio|precios|mi menu|mi negocio|mi restaurante|mi local|mi tienda|en mi menu|de mi menu|en el menu|mi catalogo|panel)\b/;

/** Reads the short answer to the clarifying question ("1" / "pedir" / "gestionar" / "2" / "mi menú"). */
export function parseProductIntentAnswer(text: string): ProductIntentAnswer {
  const t = fold(text).replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 80) return 'unclear';
  if (/^1\b/.test(t) && !/^1\s*\d/.test(t)) return 'consume';
  if (/^2\b/.test(t)) return 'manage';
  const c = CONSUME_RE.test(t);
  const m = MANAGE_RE.test(t);
  if (c && !m) return 'consume';
  if (m && !c) return 'manage';
  return 'unclear';
}

/** The clarifying question: both meanings are spelled out, with the product the person wrote. */
export function productIntentQuestion(product: string): string {
  return [
    `Sobre *${product}* 🤔 antes de seguir, ¿cuál es tu idea?`,
    '',
    `1️⃣ *Consumirlo / pedirlo*: buscarlo para comprarlo o pedirlo en un restaurante (puede ser otro negocio, no el tuyo).`,
    `2️⃣ *Gestionarlo en tu menú*: es un producto de tu negocio y quieres editarlo, cambiarle el precio, agotarlo, activarlo o agregarlo.`,
    '',
    'Respóndeme *pedir* o *gestionar* (o 1 / 2) y sigo con eso.',
  ].join('\n');
}
