/**
 * Who is talking right now? The same WhatsApp number can ask as a diner, then as a
 * business owner, then as a diner again. The role must follow the *words of this turn*
 * (and recent explicit statements), never get stuck on the previous conversation.
 */

import { fold, merchantDomain, type CentralTopic, type MerchantDomain } from './topics';

const OWNER_STATEMENT =
  /\b(soy|somos|ahora soy|ahora somos|sigo siendo) (el |la )?(dueno|duena|vendedor|vendedora|comerciante|administrador|administradora|encargado|encargada|propietario|propietaria|restaurante)\b|\bcomo (vendedor|vendedora|dueno|duena|comerciante|negocio|administrador)\b|\b(volvamos|volver|regresar|retomar|seguir|sigamos|continuemos)\b.{0,30}\b(mi negocio|mi restaurante|mi menu|mi local|como vendedor|como dueno|con mi cuenta)\b/;

const MINE =
  /\b(mi|mis|nuestro|nuestros|nuestra|nuestras)\s+(negocio|negocios|restaurante|restaurantes|local|locales|menu|carta|productos?|ventas|clientes|tienda|inventario|categorias?|precios?|horarios?|tasa|combos?|promociones?)\b/;

const MINE_ORDERS = /\b(mis|nuestros) pedidos\b|\bpedidos (de hoy|pendientes|nuevos|que me llegaron)\b/;

const EDIT_VERB =
  /\b(agrega\w*|anade|anadir|anadi|crea\w*|quita\w*|elimina\w*|borra\w*|cambia\w*|actualiza\w*|modifica\w*|edita\w*|sube|baja|subele|bajale|agota\w*|desactiva\w*|activa\w*|oculta\w*|publica\w*|pon|poner|ponle)\b/;
const EDIT_OBJECT =
  /\b(producto|productos|precio|precios|foto|fotos|imagen|imagenes|menu|disponibilidad|agotado|agotada|horario|tasa|categoria|categorias|combo|extra|extras|descripcion|stock|inventario|logo|delivery)\b/;

/** "Quita la pizza", "agrega una pizza margarita a 12" — commands only an owner gives. */
const OWNER_COMMAND = /\b(agrega\w*|anade|anadir|quita\w*|elimina\w*|borra\w*|agota\w*|oculta\w*|desactiva\w*)\b.{0,40}\b(a \$?\d|\d+ ?(usd|dolares|bs|pesos|cop)?|del menu|de mi menu|de la carta)\b/;

const CONSUMER_ONLY =
  /\b(quiero (pedir|comer|ordenar)|tengo hambre|me antoja|donde (como|consigo|puedo comer)|restaurantes? (cerca|cercano|por aqui)|cerca de (mi|aqui)|estoy en)\b/;

/**
 * `inOwnerThread` = the last thing we did with this person was an owner task (we just sent
 * them to manage their business), so a short follow-up like "ahora quiero cambiar una imagen"
 * is still the owner talking.
 */
export function detectMerchantVoice(text: string, hasShops: boolean, inOwnerThread = false): boolean {
  const t = fold(text);
  if (!t) return false;
  if (CONSUMER_ONLY.test(t) && !OWNER_STATEMENT.test(t)) return false;
  if (OWNER_STATEMENT.test(t)) return true;
  if (inOwnerThread && hasShops && EDIT_VERB.test(t) && EDIT_OBJECT.test(t)) return true;
  if (OWNER_COMMAND.test(t)) return true;
  if (MINE.test(t) && (EDIT_VERB.test(t) || hasShops || /\b(registrad|mi cuenta)\b/.test(t))) return true;
  if (hasShops && MINE_ORDERS.test(t)) return true;
  if (EDIT_VERB.test(t) && EDIT_OBJECT.test(t) && (hasShops || MINE.test(t))) return true;
  return false;
}

export function isOwnerStatement(text: string): boolean {
  return OWNER_STATEMENT.test(fold(text));
}

/** Short role declaration with no concrete task ("soy el dueño", "ahora como vendedor"). */
export function isBareOwnerStatement(text: string): boolean {
  const t = fold(text);
  return OWNER_STATEMENT.test(t) && t.length <= 70 && !merchantDomain(t, { mine: true });
}

/** Topics that are consumer-flavoured and must yield when the speaker is clearly the owner. */
export const CONSUMER_FLAVOURED: ReadonlySet<CentralTopic> = new Set<CentralTopic>([
  'search_food',
  'browse_directory',
  'open_now',
  'delivery_find',
  'menu_of',
  'contact_of',
  'hours_of',
  'payments',
  'consumer_howto',
  'order_howto',
  'restaurant_assistant',
  'unknown',
]);

export function inferMerchantDomain(text: string): MerchantDomain {
  const t = fold(text);
  const direct = merchantDomain(t, { mine: true });
  if (direct) return direct;
  if (/\b(tasa|bcv|dolar)\b/.test(t)) return 'fx';
  if (/\bprecio|precios\b/.test(t)) return 'price';
  if (/\b(agota\w*|disponib\w*|desactiva\w*|activa\w*|oculta\w*|stock)\b/.test(t)) return 'availability';
  if (/\bhorario|abrir|cerrar\b/.test(t)) return 'hours';
  if (/\blogo\b/.test(t)) return 'logo';
  if (/\b(foto|fotos|imagen|imagenes)\b/.test(t)) return 'photo';
  if (/\bcategoria/.test(t)) return 'category';
  if (/\bdelivery\b/.test(t)) return 'delivery';
  if (/\b(producto|menu|carta|pizza|combo|agrega\w*|quita\w*|elimina\w*)\b/.test(t)) return 'product';
  return 'settings';
}
