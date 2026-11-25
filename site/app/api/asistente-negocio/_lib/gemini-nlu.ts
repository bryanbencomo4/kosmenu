import type { BusinessIntent } from './intents';

export type BusinessGeminiTurn = {
  intent: BusinessIntent;
  /** Present when Gemini answers conversationally (no tool). */
  reply?: string;
  source: 'gemini' | 'rules' | 'fallback';
};

type GeminiClassifyJson = {
  intent?: string;
  productHint?: string;
  newPrice?: number;
  available?: boolean;
  enLinea?: boolean;
  hoursText?: string;
  nameHint?: string;
  reply?: string;
  /** account mode: password | email | menu */
  mode?: string;
  /** orders filter / metrics focus */
  filter?: string;
  focus?: string;
};

const ALLOWED = new Set([
  'list_menu',
  'propose_price',
  'propose_availability',
  'change_image',
  'read_hours',
  'propose_hours',
  'propose_en_linea',
  'recent_orders',
  'home_metrics',
  'customers',
  'order_detail',
  'currency',
  'membership',
  'account',
  'share_menu',
  'refuse_sensitive',
  'register',
  'add_product',
  'unsupported',
  'select_comercio',
  'escalate_human',
  'chat',
  'help',
]);

type Classifier = (input: {
  shopName: string;
  enLinea: boolean | null;
  userText: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
}) => Promise<BusinessGeminiTurn | null>;

let testClassifier: Classifier | null = null;

/** Vitest hook — bypass network. */
export function __setBusinessGeminiClassifierForTests(fn: Classifier | null) {
  testClassifier = fn;
}

export function isBusinessGeminiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.BUSINESS_ASSISTANT_GEMINI ?? '1').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off' || flag === 'no') return false;
  return Boolean((env.GEMINI_API_KEY || '').trim());
}

function geminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return (
    (env.BUSINESS_ASSISTANT_GEMINI_MODEL || '').trim() ||
    (env.CHATBOT_GEMINI_MODEL || '').trim() ||
    'gemini-2.0-flash'
  );
}

function extractJsonObject(raw: string): GeminiClassifyJson | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() || trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as GeminiClassifyJson;
  } catch {
    return null;
  }
}

function sanitizeReply(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let t = String(raw).trim().slice(0, 900);
  // Never push merchants out of chat toward the panel.
  t = t.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (!t) return undefined;
  return t;
}

export function mapGeminiClassifyToTurn(raw: GeminiClassifyJson): BusinessGeminiTurn | null {
  const kind = String(raw.intent || '').trim();
  if (!ALLOWED.has(kind)) return null;

  if (kind === 'chat') {
    const reply = sanitizeReply(raw.reply);
    if (reply) return { intent: { kind: 'chat', reply }, reply, source: 'gemini' };
    // Empty chat → soft help in-chat, never auto-escalate.
    return { intent: { kind: 'help' }, source: 'gemini' };
  }
  if (kind === 'help') {
    // Soft help in-chat — do NOT auto-escalate unless model chose escalate_human.
    const reply = sanitizeReply(raw.reply);
    if (reply) return { intent: { kind: 'chat', reply }, reply, source: 'gemini' };
    return { intent: { kind: 'help' }, source: 'gemini' };
  }

  switch (kind) {
    case 'list_menu':
      return { intent: { kind: 'list_menu' }, source: 'gemini' };
    case 'escalate_human':
      return {
        intent: {
          kind: 'escalate_human',
          reason: raw.reply ? String(raw.reply).slice(0, 240) : undefined,
        },
        source: 'gemini',
      };
    case 'propose_price': {
      const newPrice =
        typeof raw.newPrice === 'number' && Number.isFinite(raw.newPrice) && raw.newPrice > 0
          ? raw.newPrice
          : undefined;
      return {
        intent: {
          kind: 'propose_price',
          productHint: raw.productHint ? String(raw.productHint).slice(0, 120) : undefined,
          newPrice,
        },
        source: 'gemini',
      };
    }
    case 'propose_availability':
      return {
        intent: {
          kind: 'propose_availability',
          productHint: raw.productHint ? String(raw.productHint).slice(0, 120) : undefined,
          available: raw.available !== false,
        },
        source: 'gemini',
      };
    case 'change_image':
      return {
        intent: {
          kind: 'change_image',
          productHint: raw.productHint ? String(raw.productHint).slice(0, 120) : undefined,
        },
        source: 'gemini',
      };
    case 'read_hours':
      return { intent: { kind: 'read_hours' }, source: 'gemini' };
    case 'propose_hours':
      return {
        intent: {
          kind: 'propose_hours',
          hoursText: raw.hoursText ? String(raw.hoursText).slice(0, 200) : undefined,
        },
        source: 'gemini',
      };
    case 'propose_en_linea':
      return {
        intent: {
          kind: 'propose_en_linea',
          enLinea: typeof raw.enLinea === 'boolean' ? raw.enLinea : undefined,
        },
        source: 'gemini',
      };
    case 'recent_orders': {
      const f = String(raw.filter || raw.mode || '').toLowerCase();
      const filter =
        f.includes('pend') ? 'pending' : f.includes('hoy') || f.includes('today') ? 'today' : 'all';
      return { intent: { kind: 'recent_orders', filter }, source: 'gemini' };
    }
    case 'home_metrics': {
      const f = String(raw.focus || raw.mode || raw.productHint || '').toLowerCase();
      const focus =
        f.includes('client') || f.includes('customer')
          ? 'customers'
          : f.includes('venta') || f.includes('sale')
            ? 'sales'
            : f.includes('pedido') || f.includes('order')
              ? 'orders'
              : 'all';
      return { intent: { kind: 'home_metrics', focus }, source: 'gemini' };
    }
    case 'customers':
      return { intent: { kind: 'customers' }, source: 'gemini' };
    case 'order_detail':
      return {
        intent: {
          kind: 'order_detail',
          hint: String(raw.productHint || raw.nameHint || raw.reply || '').slice(0, 120) || 'pedido',
        },
        source: 'gemini',
      };
    case 'currency':
      return { intent: { kind: 'currency' }, source: 'gemini' };
    case 'membership':
      return { intent: { kind: 'membership' }, source: 'gemini' };
    case 'account': {
      const modeRaw = String(raw.mode || raw.productHint || '').toLowerCase();
      const mode =
        modeRaw.includes('email') || modeRaw.includes('correo')
          ? 'email'
          : modeRaw.includes('pass') || modeRaw.includes('contrase') || modeRaw.includes('clave')
            ? 'password'
            : 'menu';
      return { intent: { kind: 'account', mode }, source: 'gemini' };
    }
    case 'share_menu':
      return { intent: { kind: 'share_menu' }, source: 'gemini' };
    case 'refuse_sensitive':
      return { intent: { kind: 'refuse_sensitive' }, source: 'gemini' };
    case 'register':
      return { intent: { kind: 'register' }, source: 'gemini' };
    case 'add_product':
      return { intent: { kind: 'add_product' }, source: 'gemini' };
    case 'unsupported': {
      const topicRaw = String(raw.mode || raw.productHint || raw.reply || '').toLowerCase();
      const topic = topicRaw.includes('pago') || topicRaw.includes('zelle')
        ? 'payments'
        : topicRaw.includes('delivery') || topicRaw.includes('domicilio') || topicRaw.includes('envio')
          ? 'delivery'
          : topicRaw.includes('promo') || topicRaw.includes('2x1') || topicRaw.includes('descuento')
            ? 'promo'
            : topicRaw.includes('empleado') || topicRaw.includes('staff') || topicRaw.includes('trabajador')
              ? 'staff'
              : topicRaw.includes('categor')
                ? 'category'
                : topicRaw.includes('pedido') || topicRaw.includes('estado')
                  ? 'order_status'
                  : 'promo';
      return { intent: { kind: 'unsupported', topic }, source: 'gemini' };
    }
    case 'select_comercio':
      return {
        intent: {
          kind: 'select_comercio',
          nameHint: String(raw.nameHint || raw.productHint || '').slice(0, 80) || 'negocio',
        },
        source: 'gemini',
      };
    default:
      return null;
  }
}

function buildSystemPrompt(shopName: string, enLinea: boolean | null): string {
  const status =
    enLinea === true ? 'en línea' : enLinea === false ? 'fuera de línea' : 'desconocido';
  return [
    'Eres el clasificador NLU del asistente de negocio de elmenuxfa.com (WhatsApp-style, español).',
    `Negocio actual: ${shopName} (${status}).`,
    'Devuelve SOLO un JSON compacto (sin markdown) con:',
    '{"intent":"...","productHint":"?","newPrice":?,"available":?,"enLinea":?,"hoursText":"?","nameHint":"?","mode":"?","reply":"?"}',
    'intents válidos: list_menu, propose_price, propose_availability, change_image, read_hours, propose_hours, propose_en_linea, recent_orders, home_metrics, customers, order_detail, currency, membership, account, share_menu, refuse_sensitive, register, add_product, unsupported, select_comercio, escalate_human, chat, help',
    '- pagos/Zelle/delivery/promos/empleados/crear categoría/cambiar estado de pedido → unsupported (mode=payments|delivery|promo|staff|category|order_status). NUNCA add_product.',
    'Reglas CRÍTICAS:',
    '- Nunca inventes que ya aplicaste un cambio.',
    '- Nunca pidas salir al panel web; todo es en el chat.',
    '- Pedir ver/enviar contraseña, token, OTP, API key o secretos → refuse_sensitive (NUNCA reveles). Cambiar email/contraseña propia → account.',
    '- Enlace del menú / QR / compartir menú → share_menu.',
    '- list_menu SOLO si pide VER/mostrar el menú o productos actuales. NUNCA si habla de crear otro menú, otro negocio, otra cuenta, o capacidades futuras.',
    '- "cuántos clientes / ventas de hoy / resumen de hoy / cuántos pedidos hoy" → home_metrics (focus: customers|sales|orders|all). NO uses recent_orders para eso.',
    '- "nombres de clientes / quiénes pidieron" → customers.',
    '- pedidos / pedidos pendientes / pedidos de hoy → recent_orders (filter: all|pending|today).',
    '- detalle de un pedido → order_detail (hint con id o nombre).',
    '- Membresía / plan / cuánto falta o toca pagar / fecha de corte / renovar → membership (NO escalate; NO invites a humano si ya respondiste).',
    '- Cambiar email / contraseña / mi cuenta → account (mode: password|email|menu).',
    '- "crear otro menú / otro negocio / segundo local" → register.',
    '- escalate_human SOLO si el usuario lo pide explícitamente O si no hay forma de resolver en el chat. Nunca al final de una respuesta ya resuelta.',
    '- Si el usuario quiere escribir (precio/horario/abrir/cerrar/disponibilidad), usa el intent de propuesta correspondiente.',
    '- chat: saludos o preguntas triviales; reply corto y cálido. NO digas "hablar con un humano" si puedes ayudar.',
    '- help: orienta a la barra de opciones. No es escalate automático.',
  ].join('\n');
}

/**
 * Gemini NLU for ambiguous turns. Failures return null → caller keeps rules/help.
 * Never applies writes; only classifies / drafts chat text.
 */
export async function classifyBusinessTurnWithGemini(input: {
  shopName: string;
  enLinea: boolean | null;
  userText: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<BusinessGeminiTurn | null> {
  if (testClassifier) {
    return testClassifier({
      shopName: input.shopName,
      enLinea: input.enLinea,
      userText: input.userText,
      history: input.history || [],
    });
  }

  const env = input.env || process.env;
  if (!isBusinessGeminiEnabled(env)) return null;
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = geminiModel(env);
  const history = (input.history || []).slice(-6);
  const historyBlock = history
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text.slice(0, 280)}`)
    .join('\n');

  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(input.shopName, input.enLinea) }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: [
              historyBlock ? `Historial reciente:\n${historyBlock}\n` : '',
              `Mensaje actual del dueño:\n${input.userText.slice(0, 500)}`,
              '\nResponde solo JSON.',
            ].join('\n'),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (json.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('\n')
      .trim();
    if (!text) return null;
    const parsed = extractJsonObject(text);
    if (!parsed) return null;
    return mapGeminiClassifyToTurn(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
