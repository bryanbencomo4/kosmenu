/**
 * Natural-language composer for the central WhatsApp brain.
 *
 * The brain (rules + real DB tools) decides WHAT is true and WHICH links apply; this layer
 * decides HOW it is said, like a person who actually read the conversation:
 *  - answers what the user said just now (not a canned block),
 *  - varies wording turn after turn (it sees its own previous replies),
 *  - never invents data: links, numbers and names are validated against the draft.
 *
 * Fail-safe: any error / timeout / invalid output → the original draft is sent unchanged.
 */

import { resolveChatbotModelPair } from '../../../chat/_lib/models';
import { buildThinkingConfigForModel } from '../../../chat/_lib/thinking';
import type { WaMasterIdentity, WaMasterMemory } from '../types';

export type ComposeInput = {
  userText: string;
  drafts: string[];
  memory: WaMasterMemory;
  identity: WaMasterIdentity;
  /** Optional hint about what this turn is (topic / intent) to steer tone. */
  topic?: string;
  timeoutMs?: number;
};

export type ComposeFn = (input: ComposeInput) => Promise<string[] | null>;

const URL_RE = /https?:\/\/[^\s)>\]]+/gi;
const NUM_RE = /\d+(?:[.,]\d+)?/g;
const BOLD_RE = /\*([^*\n]{2,80})\*/g;

export function composeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.PLATFORM_WA_MASTER_COMPOSE ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  return Boolean((env.GEMINI_API_KEY || '').trim());
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, '');

/**
 * The composed text may only contain what the draft (or the user) already contained:
 * same links, no new numbers, no new bold names, no menus, no credential asks.
 */
export function validateComposed(drafts: string[], composed: string, userText: string): boolean {
  const out = composed.trim();
  if (out.length < 8 || out.length > 1400) return false;
  const base = drafts.join('\n');

  const draftUrls = new Set((base.match(URL_RE) || []).map(trimUrl));
  const outUrls = (out.match(URL_RE) || []).map(trimUrl);
  for (const u of draftUrls) if (!out.includes(u)) return false;
  for (const u of outUrls) if (!draftUrls.has(u)) return false;

  const known = new Set(((base + ' ' + userText).match(NUM_RE) || []).map((n) => n.replace(',', '.')));
  // Digits inside URLs are covered by the URL check.
  const outNoUrl = out.replace(URL_RE, ' ');
  for (const n of outNoUrl.match(NUM_RE) || []) if (!known.has(n.replace(',', '.'))) return false;

  const knownText = fold(base + ' ' + userText);
  for (const m of out.matchAll(BOLD_RE)) {
    if (!knownText.includes(fold(m[1]))) return false;
  }

  if (/^\s*[1-9][.)]\s/m.test(out) || /[1-9]️⃣/.test(out)) return false;
  if (/\b(contrase[nñ]a|password|token|otp)\b/i.test(out) && !/\b(contrase[nñ]a|password|token|otp)\b/i.test(base)) {
    return false;
  }
  if (/\b(como (una )?ia|modelo de lenguaje|soy un bot|inteligencia artificial)\b/i.test(out)) return false;
  return true;
}

function recentTranscript(memory: WaMasterMemory, max = 10): string {
  const turns = (memory.turns || [])
    .filter((t) => t.role === 'user' || t.role === 'assistant')
    .slice(-max - 1, -1); // exclude the current user turn (passed separately)
  return turns
    .map((t) => `${t.role === 'user' ? 'Usuario' : 'Tú'}: ${t.text.replace(/\s+/g, ' ').slice(0, 320)}`)
    .join('\n');
}

const SYSTEM = [
  'Eres el asistente de WhatsApp de ElMenúXFA (menús digitales y pedidos para restaurantes en Venezuela y Colombia).',
  'Hablas como una persona real: cálido, cercano, directo y con criterio. Español neutro-venezolano natural; sin muletillas de bot.',
  'Qué puede hacer el ASISTENTE DEL NEGOCIO (el enlace de la conversación): cambiar precios, agotar/activar/ocultar productos, cambiar la foto de un producto, crear categorías y productos, ajustar tasa y monedas, horario, delivery, ver pedidos y ventas. Siempre con la sesión del dueño y confirmando antes de aplicar.',
  'Por WhatsApp NO se cambia nada ni se muestran cifras privadas: se orienta y se entrega el enlace al asistente del negocio.',
  '',
  'TU TRABAJO: recibirás un BORRADOR con los hechos verificados (de la base de datos o de reglas) y debes redactar la respuesta final.',
  'REGLAS ESTRICTAS:',
  '1. Responde a lo que el usuario dijo AHORA y a su intención concreta; usa la conversación previa para no repetir lo ya dicho ni volver a presentarte.',
  '2. Si ya diste una explicación o un enlace antes, no lo repitas igual: refiérete a él ("el mismo enlace de antes") o aporta algo nuevo.',
  '3. Varía el inicio y la estructura respecto a tus respuestas previas. Nada de "Vale, veo que…" repetido.',
  '4. Usa SOLO los hechos del borrador. No inventes productos, precios, restaurantes, horarios, cifras, pasos ni funciones. Conserva TODOS los enlaces exactamente como están y no agregues enlaces nuevos.',
  '5. Si el borrador dice que no entendió o está genérico, usa el contexto para hacer UNA pregunta concreta y útil (no un menú de opciones numeradas).',
  '6. Si el borrador manda al panel pero lo que el usuario pidió se puede hacer con el asistente del negocio (p. ej. cambiar la foto de un producto), da prioridad al asistente del negocio y menciona el panel solo como alternativa.',
  '7. Corto: 1 a 4 frases, más listas con viñetas si el borrador trae listas (mantén esas viñetas y sus enlaces tal cual). Máximo 2 emojis. Usa *negrita* de WhatsApp solo para nombres que ya vengan en el borrador.',
  '8. Nunca pidas contraseñas, códigos ni claves. No digas que eres una IA ni hables de "borrador" o "hechos".',
  '9. Devuelve únicamente el texto del mensaje para enviar.',
].join('\n');

export async function geminiCompose(input: ComposeInput, env: NodeJS.ProcessEnv = process.env): Promise<string[] | null> {
  if (!composeEnabled(env)) return null;
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  const models = resolveChatbotModelPair({
    primaryRaw: env.PLATFORM_WA_MASTER_COMPOSE_MODEL || env.CHATBOT_GEMINI_MODEL,
    fallbackRaw: env.CHATBOT_GEMINI_MODEL_FALLBACK,
  });

  const shops = input.identity.comercios.map((c) => c.publicName).join(', ');
  const transcript = recentTranscript(input.memory);
  const user = [
    shops ? `Negocios ligados a este número: ${shops}.` : 'Este número no tiene un negocio ligado.',
    input.topic ? `Tema detectado: ${input.topic}.` : '',
    transcript ? `CONVERSACIÓN RECIENTE:\n${transcript}` : 'CONVERSACIÓN RECIENTE: (es el primer mensaje)',
    '',
    `MENSAJE ACTUAL DEL USUARIO: ${input.userText}`,
    '',
    'BORRADOR (hechos verificados):',
    input.drafts.join('\n\n'),
    '',
    'Redacta ahora la respuesta final.',
  ]
    .filter((l) => l !== '')
    .join('\n');

  for (const model of [models.model, models.modelFallback]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 9_000);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            maxOutputTokens: 600,
            thinkingConfig: buildThinkingConfigForModel(model),
          },
        }),
      });
      if (!res.ok) {
        if (model === models.modelFallback) return null;
        continue;
      }
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      };
      const text = (json.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text!.trim())
        .join('\n')
        .trim();
      if (!text) return null;
      return [text];
    } catch {
      if (model === models.modelFallback) return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Compose + validate. Returns the new replies or null to keep the deterministic draft. */
export async function composeNatural(
  input: ComposeInput,
  compose: ComposeFn = geminiCompose,
): Promise<string[] | null> {
  const drafts = input.drafts.filter(Boolean);
  if (!drafts.length) return null;
  const out = await compose(input).catch(() => null);
  if (!out || !out.length) return null;
  const text = out.join('\n\n').trim();
  return validateComposed(drafts, text, input.userText) ? [text] : null;
}
