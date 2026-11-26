/**
 * Central brain — topic classifier for the ElMenúXFA WhatsApp line.
 *
 * Taxonomy comes from the 250-message support guide (new users, consumers,
 * business prospects, registered merchants). Pure functions: no I/O.
 * Phone alone never proves ownership; `hasShops` only changes the *wording*
 * of merchant replies, not what the user is allowed to do.
 */

export type CentralTopic =
  | 'greeting'
  | 'thanks'
  | 'what_is'
  | 'who_are_you'
  | 'official_number'
  | 'how_start'
  | 'coverage'
  | 'no_app'
  | 'vs_apps'
  | 'order_by_chat'
  | 'search_food'
  | 'browse_directory'
  | 'menu_of'
  | 'contact_of'
  | 'hours_of'
  | 'open_now'
  | 'delivery_find'
  | 'payments'
  | 'consumer_howto'
  | 'order_howto'
  | 'order_issue'
  | 'link_broken'
  | 'restaurant_assistant'
  | 'pricing'
  | 'register'
  | 'example_menu'
  | 'feature'
  | 'assistant_info'
  | 'support_info'
  | 'human_now'
  | 'merchant_ops'
  | 'merchant_report'
  | 'merchant_diag'
  | 'merchant_access'
  | 'merchant_account'
  | 'sensitive'
  | 'unknown';

export type MerchantDomain =
  | 'fx'
  | 'price'
  | 'product'
  | 'availability'
  | 'delivery'
  | 'links'
  | 'hours'
  | 'payments'
  | 'logo'
  | 'promo'
  | 'category'
  | 'order_status'
  | 'staff'
  | 'settings';

export type FoodQuery = {
  category: string | null;
  query: string | null;
  label: string | null;
};

export type TopicResult = {
  topic: CentralTopic;
  domain?: MerchantDomain;
  food?: FoodQuery;
  /** Restaurant name the user mentioned (original casing). */
  restaurantName?: string | null;
  cities: string[];
  openOnly?: boolean;
  paymentHint?: string | null;
};

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿¡]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CITY_LIST: Array<{ re: RegExp; label: string }> = [
  { re: /\bsan cristobal\b/, label: 'San Cristóbal' },
  { re: /\btachira\b/, label: 'Táchira' },
  { re: /\btariba\b/, label: 'Táriba' },
  { re: /\bpalmira\b/, label: 'Palmira' },
  { re: /\bcaracas\b/, label: 'Caracas' },
  { re: /\bmaracaibo\b/, label: 'Maracaibo' },
  { re: /\bvalencia\b/, label: 'Valencia' },
  { re: /\bbarquisimeto\b/, label: 'Barquisimeto' },
  { re: /\bmerida\b/, label: 'Mérida' },
  { re: /\bcucuta\b/, label: 'Cúcuta' },
];

export function extractCities(t: string): string[] {
  const out: string[] = [];
  for (const c of CITY_LIST) if (c.re.test(t)) out.push(c.label);
  return out;
}

const NAME_STOP = new Set(
  [
    'hola', 'buenas', 'buenos', 'quiero', 'necesito', 'me', 'mi', 'puedo', 'como', 'cual', 'donde', 'que',
    'tengo', 'tienen', 'hay', 'busco', 'ya', 'el', 'la', 'los', 'las', 'un', 'una', 'por', 'para', 'si',
    'elmenuxfa', 'elmenúxfa', 'whatsapp', 'instagram', 'zelle', 'excel', 'qr', 'venezuela', 'gracias',
    'favor', 'porfa', 'esto', 'ese', 'esa', 'este', 'esta', 'cuanto', 'cuánto', 'cuando', 'cuándo',
    'tambien', 'también', 'pero', 'ayuda', 'ustedes', 'aqui', 'aquí', 'ok', 'dale', 'vale', 'sí', 'no',
    'es', 'se', 'son', 'hacen', 'tiene', 'puede', 'pueden', 'dime', 'dame', 'pasame', 'pásame', 'envia',
    'envía', 'mandame', 'mándame', 'cual', 'cuál', 'quien', 'quién', 'sabes', 'saben', 'estoy', 'soy',
    'estan', 'están', 'está', 'esta', 'tienes', 'hacer', 'registrar', 'ver', 'pedir', 'comprar',
    'dos', 'tres', 'estaba', 'fue', 'les', 'lo', 'le', 'al', 'del', 'de', 'en', 'con', 'sin', 'y', 'o', 'a',
    'zelle', 'pago', 'dólares', 'dolares', 'bolívares', 'bolivares', 'usd', 'bcv',
  ].map((s) => s.toLowerCase()),
);

/** Best-effort: capitalised phrase that looks like a business name. */
export function extractRestaurantName(original: string): string | null {
  const text = original.replace(/[¿?¡!.,;:()"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = text.split(' ');
  const candidates: string[] = [];
  let cur: string[] = [];
  const cityTokens = new Set(
    CITY_LIST.flatMap((c) => c.label.toLowerCase().split(' ')).concat(['san', 'cristobal', 'cristóbal']),
  );
  const flush = () => {
    while (cur.length && /^(de|del|la|el|los|las|y)$/i.test(cur[cur.length - 1])) cur.pop();
    if (cur.length) candidates.push(cur.join(' '));
    cur = [];
  };
  tokens.forEach((tok, i) => {
    const isCap = /^[A-ZÁÉÍÓÚÑ][\p{L}\d'’]+$/u.test(tok);
    const lower = fold(tok);
    const sentenceStart = i === 0;
    if (isCap && !NAME_STOP.has(lower) && !cityTokens.has(lower) && !(sentenceStart && NAME_STOP.has(lower))) {
      cur.push(tok);
    } else if (cur.length && /^(de|del|la|el|los|las|y)$/i.test(tok)) {
      cur.push(tok);
    } else {
      flush();
    }
  });
  flush();
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 3) return null;
  return best;
}

export function parseFood(t: string): FoodQuery | null {
  const rules: Array<[RegExp, FoodQuery]> = [
    [/\bpizza|pizzeria/, { category: 'pizzas', query: 'pizza', label: 'pizza' }],
    [/\bhamburgues|burger/, { category: 'hamburguesas', query: 'hamburguesa', label: 'hamburguesas' }],
    [/\bsushi/, { category: 'sushi', query: 'sushi', label: 'sushi' }],
    [/\barepa/, { category: 'arepas', query: 'arepa', label: 'arepas' }],
    [/\bpollo|broaster/, { category: 'pollo', query: 'pollo', label: 'pollo' }],
    [/\bperros? calientes?|hot ?dog/, { category: null, query: 'perro caliente', label: 'perros calientes' }],
    [/\bempanada/, { category: null, query: 'empanada', label: 'empanadas' }],
    [/\bpostre|torta|pastel|dulce/, { category: 'postres', query: null, label: 'postres' }],
    [/\bdesayun/, { category: null, query: 'desayuno', label: 'desayunos' }],
    [/\bcomida china|china\b/, { category: null, query: 'china', label: 'comida china' }],
    [/\bcomida venezolana|criolla/, { category: 'criolla', query: null, label: 'comida criolla' }],
    [/\btaco|mexican/, { category: 'tacos', query: 'mexicana', label: 'comida mexicana' }],
    [/\bparrilla|carne|asado/, { category: 'parrilla', query: null, label: 'parrilla' }],
    [/\bvegetarian|vegano|saludable/, { category: 'saludable', query: null, label: 'opciones saludables' }],
    [/\bbebida|snack|refresco|jugo/, { category: null, query: 'bebidas', label: 'bebidas y snacks' }],
    [/\bcafe\b|cafeteria/, { category: 'cafe', query: null, label: 'café' }],
    [/\bpor kilo/, { category: null, query: 'kilo', label: 'comida por kilo' }],
  ];
  for (const [re, food] of rules) if (re.test(t)) return food;
  return null;
}

const CAPABILITY_Q =
  /^(hola[, ]+)?(puedo|se puede|podria|podrian|es posible|el sistema|el menu (permite|tiene|puede)|el cliente puede|ese asistente|el asistente puede|tienen|tiene|hay|permite|incluye|funciona|cuanto|que incluye|como funciona|existe|venden|trabajan|ofrecen)\b/;

export function merchantDomain(t: string, opts: { mine: boolean }): MerchantDomain | null {
  if (
    /\b(tasa|tasas|taza|bcv|tipo de cambio)\b/.test(t) &&
    !/\b(usa|utiliza|maneja) (el|la) (restaurante|negocio|local)/.test(t)
  ) {
    return 'fx';
  }
  if (
    /\b(enlace|link|qr|codigo qr)\b/.test(t) &&
    (opts.mine || /\b(mi|mis|debo|imprimir|compartir mi|recibir pedidos)\b/.test(t))
  ) {
    return 'links';
  }
  if (/\b(enviarle|mandarle|enviar|mandar) (mi|el) menu\b/.test(t) && /\bcliente\b/.test(t)) return 'links';
  if (/\b(agotad\w*|reactiv\w+|volver a activar|activar (nuevamente )?(los )?(pedidos|producto)|desactivar (el )?producto)\b/.test(t)) {
    return 'availability';
  }
  if (/\b(cierro|cerrar|abrir) (temporalmente|mi negocio)|horario de atencion de mi|cambiar el horario|cambiar mi horario\b/.test(t)) {
    return 'hours';
  }
  if (/\bprecio\b/.test(t) && /\b(cambi|actualiz|modific|pon|subir|bajar|editar)\w*/.test(t)) return 'price';
  if (/\b(tarifa de delivery|zona de reparto|zonas de reparto|zonas? de delivery|configurar (el )?delivery)\b/.test(t)) {
    return 'delivery';
  }
  if (/\bmetodos? de pago\b/.test(t) && /\b(agreg|configur|cambi|quiero|como)\w*/.test(t)) return 'payments';
  if (/\b(logo|foto de (uno de )?mis? productos|descripcion de mi)\b/.test(t) && /\b(cambi|actualiz|quiero|como|necesito)\w*/.test(t)) {
    return 'logo';
  }
  if (/\bpromocion\b/.test(t) && /\b(crear|creo|crearla|armar|quiero (hacer|armar|crear))\b/.test(t)) return 'promo';
  if (/\bcategoria\b/.test(t) && /\b(crear|nueva|agregar|agrego|necesito|como)\b/.test(t)) return 'category';
  if (/\b(estado de un pedido|estado del pedido)\b/.test(t) && /\b(cambiar|cambio|necesito|quiero)\b/.test(t)) {
    return 'order_status';
  }
  if (/\b(empleado|empleados|colaborador|mesero|cocinero)\b/.test(t) && /\b(agregar|agrego|anadir|quiero|necesito|como)\b/.test(t)) {
    return 'staff';
  }
  if (
    /\b(producto nuevo|nuevo producto|agregar (un |una )?producto|agrego (un |una )?producto|tamanos|extras|adicionales|ingredientes)\b/.test(t) &&
    /\b(agreg|anad|crear|necesito|quiero|como|cargar)\w*/.test(t) &&
    !CAPABILITY_Q.test(t)
  ) {
    return 'product';
  }
  if (/\b(cambiar|cambio|actualizar|modificar|editar)\b/.test(t) && /\b(correo|descripcion|nombre) (de mi|del)\b/.test(t)) {
    return 'settings';
  }
  if (/\bcorreo de mi cuenta\b/.test(t)) return 'settings';
  return null;
}

const SENSITIVE =
  /\b(contrasena|clave|password|token|codigo de verificacion|otp)\b.*\b(de|del|ajena|otro|otra|dueno|dueña)\b|\b(telefono|numero) (personal|privado) (del|de la) (dueno|dueña)|datos (privados|personales) de (otro|otra|un|una)|ventas de (otro|otra|la competencia)/;

export function classifyCentralTopic(params: {
  text: string;
  hasShops: boolean;
  hasPendingName?: boolean;
}): TopicResult {
  const original = params.text || '';
  const t = fold(original);
  const hasShops = params.hasShops;
  const cities = extractCities(t);
  const food = parseFood(t) || undefined;
  const restaurantName = extractRestaurantName(original);
  const base = { cities, food, restaurantName } as const;
  const res = (topic: CentralTopic, extra: Partial<TopicResult> = {}): TopicResult => ({
    topic,
    ...base,
    ...extra,
  });

  if (!t || /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi|hello|saludos|buen dia|epa|que tal)([!?. ]*)$/.test(t)) {
    return res('greeting');
  }
  if (/^(gracias|muchas gracias|mil gracias|ok gracias|listo gracias|perfecto gracias|chao|adios|hasta luego)([!?. ]*)$/.test(t)) {
    return res('thanks');
  }

  if (SENSITIVE.test(t)) return res('sensitive');

  // --- Human / support ---
  if (
    /\b(como|donde|cual)\b.*\b(puedo )?(hablar|comunicar\w*|contactar)\b.*\b(alguien|persona|atencion|soporte|asesor)\b/.test(t) ||
    /\batencion (personalizada|al cliente)\b/.test(t) ||
    /\btienen (soporte|atencion)\b/.test(t)
  ) {
    return res('support_info');
  }
  if (
    /\b(hablar|comunicarme|comunicarnos) con (un |una )?(asesor|asesora|humano|agente|persona de (soporte|atencion)|alguien( primero)?)\b/.test(t) ||
    /\b(quiero|necesito|prefiero|pasame con|pasenme con) (un |una |hablar con )?(humano|asesor|asesora|persona real|agente)\b/.test(t) ||
    /\b(asesor|alguien) que conozca\b/.test(t) ||
    /\bme pueden contactar\b|\bque me (contacten|llamen)\b|\bllamenme\b|\bdemostracion\b/.test(t) ||
    /\bnecesito hablar con alguien\b/.test(t) ||
    /\bmejor (un |una )?(humano|asesor|persona)\b/.test(t) ||
    t === 'humano' ||
    t === 'asesor'
  ) {
    return res('human_now');
  }

  // --- Restaurant-specific assistant / contact ---
  if (
    /\b(hablar|conectar\w*|comunicar\w*|pasame|enlace|link|escribir)\b.{0,40}\basistente\b.{0,24}\b(de|del)\b/.test(t) ||
    /\basistente (de|del) (restaurante|local|negocio|[a-z]+)/.test(t) && /\b(hablar|conectar|conecten|pasame|quiero)\b/.test(t)
  ) {
    return res('restaurant_assistant');
  }

  // Post-order trouble (consumer side).
  if (
    /\b(hice|realice|acabo de (hacer|realizar)|mi) (un )?pedido\b.*\b(cuanto tarda|tarda|estado|llego|diferente|equivoque|cancelar|demora)\b/.test(t) ||
    /\b(estado de mi pedido|cancelar (un|el|mi) pedido|me equivoque al hacer el pedido|me llego un pedido|recibieron mi pedido|recibieron mi orden|cuanto tarda mi pedido|pedido (que )?(acabo|equivocado))\b/.test(t) ||
    /\bdonde puedo consultar el estado\b/.test(t) ||
    /\b(reportar un problema con mi comida|problema con mi comida|mi comida llego)\b/.test(t) ||
    /\b(restaurante no me responde|no me responden)\b/.test(t)
  ) {
    return res('order_issue');
  }

  // --- Registered / merchant operations ---
  const domain = merchantDomain(t, { mine: hasShops });
  const isCapability = CAPABILITY_Q.test(t) && !/\b(como (cambio|agrego|creo|marco|cierro|configuro|anado|actualizo))\b/.test(t);

  if (/\b(no puedo entrar|no puedo ingresar|recuperar? (el )?acceso|olvide (mi )?(clave|contrasena)|restablecer|como entro|acceso a mi cuenta|iniciar sesion)\b/.test(t) && !/asistente/.test(t)) {
    return res('merchant_access');
  }
  if (/\b(como entro al asistente|entrar al asistente de mi negocio|asistente de mi negocio)\b/.test(t)) {
    return res('merchant_access', { domain: 'settings' });
  }
  if (
    (/\b(tengo otro local|otro local|segundo local|dos restaurantes|mis (dos )?(restaurantes|negocios|locales)|administrar los dos|agregarlo a mi cuenta|cambiar de negocio|cambiar entre)\b/.test(t) &&
      !(CAPABILITY_Q.test(t) && !hasShops)) ||
    /\b(cuando vence|vence mi|mi suscripcion|plan tengo|plan contratado|mi membresia|mi plan)\b/.test(t) ||
    /\bcambiar el correo\b|\bcorreo de mi cuenta\b/.test(t) ||
    /\bproblema con mi cuenta\b|\brevisen mi cuenta\b/.test(t)
  ) {
    return res('merchant_account');
  }
  if (
    /\b(cuantos pedidos (recibi|tuve|llegaron)|cuanto vendi|cuanto he vendido|pedidos pendientes|pedidos de hoy|ultimo pedido|quien realizo|ventas por producto|producto mas vendido|mas vendido|ventas de (hoy|ayer)|cuanto (he )?vendido)\b/.test(t) &&
    !/\b(mis? clientes|se puede)\b/.test(t) &&
    !(CAPABILITY_Q.test(t) && !hasShops)
  ) {
    return res('merchant_report');
  }
  if (
    /\b(menu esta funcionando|revisar si mi menu|pendiente por configurar|revisar mi restaurante|negocio (esta )?visible|visible para (los )?clientes|no aparecen mis productos|no me aparecen mis productos|asistente no (esta )?respondiendo|no esta respondiendo correctamente|cliente (dice )?que no puede|no puede hacer pedidos|no me estan llegando|no me llegan (las )?notificaciones|ya les explique|tienen esa informacion|quiero resolverlo por aqui|hacer todos estos cambios desde el chat|sin entrar al panel)\b/.test(t) ||
    /\bya tengo mi (restaurante|negocio) registrado\b/.test(t) ||
    /\bpor que no aparecen\b.*\bmenu\b/.test(t)
  ) {
    return res('merchant_diag');
  }
  if (/\b(sin entrar al panel|desde el chat|resolverlo por aqui|resolver(lo)? por aqui)\b/.test(t)) {
    return res('merchant_ops', { domain: 'settings' });
  }
  if (domain && (hasShops || !isCapability)) {
    return res('merchant_ops', { domain });
  }

  // Consumer wording that collides with merchant / prospect vocabulary.
  if (/\bpedido sin registrarme\b|\bsin registrarme\b.*\bpedido\b/.test(t)) return res('consumer_howto');
  if (
    /\b(registrarme como cliente|registrarme para ver|sin tener cuenta|si no tengo cuenta|sin cuenta)\b/.test(t) ||
    /\bnecesito registrarme para ver\b/.test(t)
  ) {
    return res('no_app');
  }
  if (
    /\b(que usa el restaurante|tasa que usa)\b/.test(t) ||
    /\bprecios? en (bolivares|bs|dolares)\b/.test(t) ||
    /\bver los precios antes\b|\bantes de hacer el pedido\b/.test(t) ||
    /\b(compartir|enviar|mandar)\b.*\b(enlace|link|menu)\b.*\b(familia|amigo|otra persona|persona)\b/.test(t) ||
    /\bcompartir un menu con otra persona\b/.test(t) ||
    /\b(es el mismo|el menu que me enviaron)\b/.test(t) ||
    /\b(tamano de|ingredientes? adicionales?|agregar ingredientes|extras?|sin cebolla|no quiero cebolla|dos por uno|factura|varias direcciones|para manana|pedir para retirar|retirar (el|mi) pedido|pagar en efectivo|pedir varias cosas|permiten retirar)\b/.test(t)
  ) {
    return res('consumer_howto');
  }
  if (/\b(esta|estan|sea|sean) afiliad\w+/.test(t)) return res('menu_of');
  if (/\bque hago ahora\b|\bya encontre el restaurante\b/.test(t)) return res('order_howto');
  if (/\bpromociones? (hoy|de hoy)\b/.test(t)) return res('browse_directory');
  if (/\bcomo (hago|puedo|pido)\b.{0,24}\bpedir\b/.test(t) || /\bpedir (directamente )?(por|desde) el menu\b/.test(t)) {
    return res('order_howto');
  }
  if (/\bmis clientes\b.*\b(pidan|pedir|pedidos)\b/.test(t)) return res('feature');
  if (/\b(conseguir|tener|obtener|crear) (un )?menu digital\b/.test(t) && !restaurantName) return res('how_start');
  if (/\bsolamente con restaurantes|solo (con )?restaurantes|tiendas que venden|no comida\b/.test(t)) return res('feature');
  if (/\bayudan a configurar\b|\bconfigurar el menu\b|\bconfigure el menu\b/.test(t)) return res('feature');
  if (/\bcambiar los precios\b/.test(t)) return res('feature');

  // --- Platform info (new users) ---
  if (/\b(que es elmenuxfa|que hace(n)? (ustedes|elmenuxfa)|que hacen|explic\w+ que hacen|quienes son|a que se dedican|ustedes son un restaurante|que servicio ofrecen|como funciona (su|la|esta) plataforma|primera vez|no conozco la plataforma|como funciona esto|lo de los asistentes)\b/.test(t) && !/\bcomo funciona lo de los asistentes\b/.test(t)) {
    return res('what_is');
  }
  if (/\bcomo funciona lo de los asistentes\b/.test(t)) return res('assistant_info');
  if (/\b(con quien tengo el gusto|con quien hablo|eres (un )?(bot|robot|ia|persona)|quien eres|quien me escribe)\b/.test(t)) {
    return res('who_are_you');
  }
  if (/\b(numero (es )?(el )?oficial|este numero es|numero correcto|numero equivocado)\b/.test(t)) {
    return res('official_number');
  }
  if (/\b(descargar|aplicacion|app\b)/.test(t) && /\b(tienen|hay|descargar|necesito|que hay que|pedir comida)\b/.test(t) && !/\bmi (negocio|restaurante)\b/.test(t)) {
    if (/\bdiferencia|delivery\b/.test(t)) return res('vs_apps');
    return res('no_app');
  }
  if (/\bsin descargar\b|\bdesde (el )?navegador\b/.test(t)) return res('no_app');
  if (/\bdiferencia\b.*\b(aplicacion|app|delivery)\b/.test(t)) return res('vs_apps');
  if (/\b(pedir comida|hacer (un )?pedido|pedir)\b.*\b(este numero|por aqui|por whatsapp)\b/.test(t) || /\besto funciona por whatsapp\b/.test(t)) {
    return res('order_by_chat');
  }

  // --- Business prospect ---
  if (/\b(cuanto cuesta|cuanto vale|precio|precios|plan(es)?|plan anual|plan mensual|mensualidad|tarifa mensual|suscripcion|costo|probar el sistema|prueba gratis|cuanto cobran|membresia|pagar un mes|cambiar de plan|dejo de pagar)\b/.test(t) &&
      !/\bdelivery\b/.test(t) && !/\bprecio(s)? en (bolivares|bs|dolares)\b/.test(t) && !/\bantes de hacer el pedido\b/.test(t) && !/\bcambiar los precios\b/.test(t) && !/\bsubscripcion\b.*\bpago\b/.test(t)) {
    if (!/\bpedido\b/.test(t) || /\bcosto adicional\b/.test(t)) return res('pricing');
  }
  if (/\bcosto adicional\b|\bcomision\b|\bcobran por (cada )?pedido\b/.test(t)) return res('pricing');
  if (/\bcomo se realiza el pago de la suscripcion\b|\bpago de la suscripcion\b|\bcancelar el servicio\b/.test(t)) return res('pricing');
  if (/\bun ejemplo\b.*\b(menu|funcionando|funciona)\b|\bejemplo de menu\b|\bejemplo de como funciona\b/.test(t)) {
    return res('example_menu');
  }
  if (
    /\b(registrar|registrarme|registro|afiliar|afiliarme|contratar|darme de alta|unirme|incorporar|trabajar con ustedes|poner mi (negocio|menu|restaurante)|menu digital para mi|tener mi (propio )?menu|quiero vender)\b/.test(t) ||
    /\b(cuanto cuesta afiliar)\b/.test(t) ||
    /\b(tengo|tenemos) (un|una|mi) (negocio|restaurante|local|emprendimiento|pizzeria|hamburgueseria|cafeteria|panaderia|tienda)\b/.test(t) ||
    /\bpara mi emprendimiento\b|\bpuedo registrar\b|\bcomo empiezo a cargar\b|\bcomo puedo empezar a cargar\b|\bvale la pena\b|\bexplique el funcionamiento antes\b/.test(t)
  ) {
    return res('register');
  }
  if (/\b(asistente virtual|asistentes? virtual(es)?|chatbot|bot de|asistente para (mis )?clientes|diferencia entre tener un menu)\b/.test(t) || /\bese asistente\b|\bel asistente puede\b|\bcada restaurante tiene su propio asistente\b/.test(t)) {
    return res('assistant_info');
  }
  if (isCapability && /\b(qr|codigo qr|foto|fotos|logo|colores|varios usuarios|empleados|dos restaurantes|excel|inventario|reportes|ventas|vendi|notificacion|imprimir|promocion|destacar|agotado|metodos de pago|dolares|tasa|delivery|retiro|computadora|telefono|celular|soporte|tiendas|cancelar|menu en|whatsapp|instagram|enlace|personalizado|mesas|pocos productos|configurar el menu|configure el menu|cliente puede ver)\b/.test(t)) {
    return res('feature');
  }
  if (/\b(qr|codigo qr)\b|\bimprimir mis\b|\bcompartir mi menu\b|\benlace personalizado\b/.test(t)) return res('feature');
  if (/\b(delivery|domicilio|retiro en tienda|retiro en el local)\b/.test(t) && /\b(sistema|funciona|configurar|mis propias|negocio que solo|mi negocio)\b/.test(t)) {
    return res('feature');
  }
  if (/\b(fotos|logo|colores|varios usuarios|empleados|excel|inventario|reportes|notificaciones|imprimir los pedidos|promociones|destacar|metodos de pago de mi negocio|importar|tiendas que venden|menu en dolares|pedidos por whatsapp|desde una computadora|desde mi telefono|atender los pedidos)\b/.test(t) && /\b(puedo|permite|sistema|tienen|funciona)\b/.test(t)) {
    return res('feature');
  }
  if (/\bsistema\b.*\b(permite|tiene|actualiza|funciona)\b|\bcomo funciona el control\b|\bque tengo que hacer para comenzar\b/.test(t)) {
    if (/\bcomenzar|empezar\b/.test(t)) return res('how_start');
    return res('feature');
  }

  // --- Consumer ---
  if (/\b(abierto|abiertos|abierta|abren|cierran)\b|\bhorario\b/.test(t)) {
    if (restaurantName || /\b(ese|este|el) (restaurante|local|negocio)\b/.test(t)) return res('hours_of', { openOnly: false });
    return res('open_now', { openOnly: true });
  }
  if (/\b(pago movil|zelle|efectivo|metodos? de pago|formas? de pago|acepta pago|acepta zelle|binance|punto de venta|transferencia)\b/.test(t)) {
    const hint = /\bzelle\b/.test(t) ? 'zelle' : /\bpago movil\b/.test(t) ? 'pago movil' : /\befectivo\b/.test(t) ? 'efectivo' : null;
    if (/\bpagar en efectivo cuando llegue\b/.test(t)) return res('consumer_howto');
    return res('payments', { paymentHint: hint });
  }
  if (/\b(delivery|domicilio|a domicilio|envio|enviar a mi casa|hasta mi casa)\b/.test(t) && !hasShops) {
    return res('delivery_find');
  }
  if (/\b(delivery|domicilio|a domicilio)\b/.test(t) && hasShops && !merchantDomain(t, { mine: true })) {
    return res('delivery_find');
  }
  const tNoThisNumber = t.replace(/\beste numero\b/g, '');
  if (/\b(whatsapp|telefono|numero|contacto|llamar|ubicacion|direccion|donde queda|donde esta)\b/.test(tNoThisNumber) &&
      /\b(restaurante|negocio|local|pizzas|menu|ese|este|del|de la)\b/.test(tNoThisNumber) &&
      !/\bnegocios? que trabaja\b/.test(t) || /\bcontacto de un negocio\b/.test(t)) {
    return res('contact_of');
  }
  if (/\bhablar (directamente )?con (el|una persona del|la persona del) (restaurante|local|negocio)\b|\bpersona del restaurante\b/.test(t)) {
    return res('contact_of');
  }
  if (/\b(recibir|conseguir|obtener|pasan|pasen|enviar)\b.*\b(enlace|link)\b.*\b(restaurante|negocio)\b/.test(t) && !/\bmi\b/.test(t)) {
    return res('menu_of');
  }
  if (/\b(link|enlace)\b.*\b(pedido|pedir)\b/.test(t) && !/\b(mi|mis)\b/.test(t)) return res('menu_of');
  if (/\b(cenar|cena|almuerzo|almorzar|comer|desayuno)\b/.test(t) && !restaurantName) return res('search_food');
  if (/\b(contacto|numero) (del|de ese|de este) (restaurante|negocio|local)\b|\bcontactar? al restaurante\b/.test(t)) {
    return res('contact_of');
  }
  if (/\bel enlace del menu no me abre\b|\bno me abre\b/.test(t)) return res('link_broken');
  if (/\b(menu|carta)\b/.test(t) && /\b(restaurante|negocio|local|enlace|link|pasame|pasan|pasen|enviar|enviame|quiero ver|quiero el|necesito|conseguir|digital)\b/.test(t) &&
      !/\bpara mi (negocio|restaurante)\b/.test(t) && !/\bmi (menu|negocio)\b/.test(t)) {
    return res('menu_of');
  }
  if (/\b(menu|carta)\b/.test(t) && restaurantName) return res('menu_of');
  if (/\b(tamano|ingredientes? adicionales?|extras?|no quiero cebolla|sin cebolla|opciones vegetarianas|dos por uno|factura|varias direcciones|para manana|para retirar|retirar el pedido|pagar en efectivo|sin registrarme|varias cosas|precios en bolivares|tasa que usa|por que no me aparecen|productos no aparecen|ya encontre el restaurante|retirar)\b/.test(t)) {
    if (!food) return res('consumer_howto');
  }
  if (/\b(compartir|enviar|mandar)\b.*\b(enlace|link|menu)\b.*\b(familia|amigo|otra persona|persona)\b/.test(t) || /\bcompartir un menu con otra persona\b/.test(t)) {
    return res('consumer_howto');
  }
  if (/\b(es el mismo|el menu que me enviaron)\b/.test(t)) return res('consumer_howto');

  if (food || /\b(restaurante|restaurantes|comer|comida|cenar|almorzar|almuerzo|cena|antojo|donde (consigo|puedo conseguir|hay)|hambre|pedir)\b/.test(t)) {
    if (/\b(que restaurantes|restaurantes (tienen|hay|registrados)|catalogo|directorio|listado)\b/.test(t) && !food) {
      return res('browse_directory');
    }
    if (food || /\b(comer|cenar|almorzar|almuerzo|cena|antojo|hambre|restaurante cerca|mas cercano)\b/.test(t)) {
      return res('search_food');
    }
    if (/\b(pedir|hacer (un )?pedido|como pido)\b/.test(t)) return res('order_howto');
    return res('browse_directory');
  }
  if (/\b(buscar restaurantes|ver los restaurantes|restaurantes que tienen|catalogo de negocios|buscar un negocio|encontrar un negocio|encontrar negocio)\b/.test(t)) {
    return res('browse_directory');
  }
  if (/\b(como (puedo )?(empezar|comenzar|utilizar sus servicios|usar el servicio)|como empiezo|que tengo que hacer para (comenzar|empezar)|no se como empezar|orientar|como puedo conseguir un menu digital)\b/.test(t)) {
    return res('how_start');
  }
  if (/\b(tienen servicio en|trabajan en|funciona en|cobertura|llegan a)\b/.test(t) || (cities.length > 0 && /\b(servicio|trabajan|tienen)\b/.test(t))) {
    return res('coverage');
  }
  if (/\b(para que sirve|que opciones tienen|que pueden hacer|en que me pueden ayudar|me interesa conocer|quiero conocer|conocer el servicio|necesito informacion|necesito ayuda|me pueden ayudar|me pueden orientar|informacion|me pasaron este numero|me recomendaron|me hablaron de ustedes|consultar varias cosas|usar el servicio si no tengo cuenta|cuenta para ver|necesito registrarme para ver|registrarme como cliente)\b/.test(t)) {
    return res('how_start');
  }
  if (/\b(pedir|pido|como pido)\b/.test(t)) return res('order_howto');
  if (/\bafiliado|afiliada\b/.test(t)) return res('how_start');
  if (/\bsi un restaurante esta afiliado|restaurante esta afiliado\b/.test(t)) return res('how_start');

  return res('unknown');
}
