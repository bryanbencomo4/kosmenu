/**
 * Multimedia understanding shared by the discovery + business assistants:
 *  - audio → transcript (STT)
 *  - image → typed analysis (dish / menu / receipt / logo / screenshot) + OCR
 *
 * Fail-soft: callers get `{ok:false}` and fall back to a friendly "write it" reply.
 * Kill switch: ASSISTANT_MEDIA=0.
 */
import { CHATBOT_PRIMARY_MODEL } from '../chat/_lib/models';

export const ASSISTANT_MEDIA_MAX_AUDIO_BYTES = 3_500_000;
export const ASSISTANT_MEDIA_MAX_IMAGE_BYTES = 6_000_000;

export type AssistantMediaAudience = 'business' | 'discovery';

export type ImageAnalysis = {
  tipo: 'plato' | 'menu' | 'comprobante' | 'logo' | 'captura' | 'otro';
  resumen: string;
  texto: string;
  /** Food/search term for discovery ("pizza", "sushi"). */
  busqueda: string;
};

export type AssistantMediaResult =
  | { ok: true; kind: 'audio'; transcript: string }
  | { ok: true; kind: 'image'; analysis: ImageAnalysis }
  | { ok: false; error: string };

export function isAssistantMediaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.ASSISTANT_MEDIA ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  return Boolean((env.GEMINI_API_KEY || '').trim());
}

function mediaModel(env: NodeJS.ProcessEnv = process.env): string {
  return (
    (env.ASSISTANT_MEDIA_MODEL || '').trim() ||
    (env.CHATBOT_GEMINI_MODEL || '').trim() ||
    CHATBOT_PRIMARY_MODEL
  );
}

function baseMime(mime: string): string {
  return (mime || '').split(';')[0]!.trim().toLowerCase();
}

const AUDIO_OK = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'video/webm', // some browsers label MediaRecorder output as video/webm
]);
const IMAGE_OK = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export function classifyMediaMime(mime: string): 'audio' | 'image' | null {
  const m = baseMime(mime);
  if (AUDIO_OK.has(m)) return 'audio';
  if (IMAGE_OK.has(m)) return 'image';
  return null;
}

function geminiAudioMime(mime: string): string {
  const m = baseMime(mime);
  if (m === 'video/webm') return 'audio/webm';
  if (m === 'audio/mp3') return 'audio/mpeg';
  if (m === 'audio/x-m4a' || m === 'audio/m4a') return 'audio/mp4';
  if (m === 'audio/x-wav') return 'audio/wav';
  return m;
}

async function callGemini(params: {
  prompt: string;
  mime: string;
  bytes: Buffer;
  maxOutputTokens: number;
  json?: boolean;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const env = params.env || process.env;
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mediaModel(env))}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 25_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: params.prompt },
              { inline_data: { mime_type: params.mime, data: params.bytes.toString('base64') } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: params.maxOutputTokens,
          ...(params.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
    };
    const text = (json.candidates?.[0]?.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text!.trim())
      .join('\n')
      .trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeAudio(input: {
  bytes: Buffer;
  mime: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const text = await callGemini({
    env: input.env,
    mime: geminiAudioMime(input.mime),
    bytes: input.bytes,
    maxOutputTokens: 400,
    prompt:
      'Transcribe fielmente este mensaje de voz en español (o el idioma hablado). ' +
      'Devuelve SOLO el texto que dice la persona, sin comillas, sin comentarios y sin etiquetas. ' +
      'Si no se entiende nada o solo hay ruido/silencio, responde exactamente: [inaudible]',
  });
  if (!text) return null;
  const clean = text.replace(/^["“]|["”]$/g, '').trim();
  if (!clean || /^\[?inaudible\]?\.?$/i.test(clean)) return null;
  return clean.slice(0, 1200);
}

function parseAnalysis(raw: string): ImageAnalysis | null {
  const body = raw.replace(/```(?:json)?/gi, '').trim();
  const s = body.indexOf('{');
  const e = body.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try {
    const j = JSON.parse(body.slice(s, e + 1)) as Record<string, unknown>;
    const tipoRaw = String(j.tipo ?? 'otro').toLowerCase();
    const tipo = (['plato', 'menu', 'comprobante', 'logo', 'captura', 'otro'] as const).find(
      (t) => tipoRaw.includes(t),
    ) ?? 'otro';
    return {
      tipo,
      resumen: String(j.resumen ?? '').trim().slice(0, 400),
      texto: String(j.texto ?? '').trim().slice(0, 1500),
      busqueda: String(j.busqueda ?? '').trim().slice(0, 60),
    };
  } catch {
    return null;
  }
}

export async function analyzeImage(input: {
  bytes: Buffer;
  mime: string;
  audience: AssistantMediaAudience;
  env?: NodeJS.ProcessEnv;
}): Promise<ImageAnalysis | null> {
  const audienceHint =
    input.audience === 'business'
      ? 'La envía el dueño de un restaurante: puede ser la foto de un plato/producto, su carta o lista de precios, un comprobante de pago, un logo o una captura.'
      : 'La envía un cliente hambriento: normalmente es un plato o comida que se le antoja (quiere encontrar dónde pedirlo).';
  const raw = await callGemini({
    env: input.env,
    mime: baseMime(input.mime) === 'image/jpg' ? 'image/jpeg' : baseMime(input.mime),
    bytes: input.bytes,
    maxOutputTokens: 700,
    json: true,
    prompt: [
      'Analiza la imagen y responde SOLO un JSON con estas claves (en español):',
      '{"tipo":"plato|menu|comprobante|logo|captura|otro","resumen":"1-2 frases de lo que ves","texto":"todo texto legible (nombres, precios, montos) o vacío","busqueda":"término de comida para buscar restaurantes (ej: pizza, sushi, hamburguesa) o vacío"}',
      audienceHint,
      'Si es una carta/lista de precios, transcribe en "texto" cada producto con su precio, uno por línea.',
      'Si hay personas o datos sensibles (tarjetas, documentos), no los transcribas: indícalo en el resumen.',
    ].join('\n'),
  });
  return raw ? parseAnalysis(raw) : null;
}
