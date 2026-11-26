/**
 * Optional Gemini TTS → Wasender voice note for Master replies.
 * Fail-closed: missing key / flag / errors → caller keeps text-only.
 */

import {
  sendWasenderDirect,
  uploadWasenderMedia,
} from '../../wa-entry/_lib/wasender-direct';

const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

export function isMasterVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.PLATFORM_WA_MASTER_VOICE || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/** Prefer voice for warm/short turns; skip long link dumps. */
export function shouldOfferVoiceNote(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.length > 320) return false;
  if (/https?:\/\//i.test(t) && (t.match(/https?:\/\//gi) || []).length >= 2) return false;
  if (/\n\d+\.\s+\*/.test(t) && t.split('\n').length > 6) return false;
  return true;
}

export async function synthesizeMasterVoiceNote(params: {
  text: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<{ base64: string; mimeType: string } | null> {
  const apiKey = (params.apiKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  const model =
    (params.model || process.env.PLATFORM_WA_MASTER_TTS_MODEL || DEFAULT_TTS_MODEL).trim() ||
    DEFAULT_TTS_MODEL;
  const spoken = params.text
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[_~`]/g, '')
    .replace(/https?:\/\/\S+/g, 'enlace')
    .trim()
    .slice(0, 400);
  if (!spoken) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: spoken }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
    };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const data = part?.inlineData?.data;
    if (!data) return null;
    const mimeType = (part?.inlineData?.mimeType || 'audio/wav').split(';')[0]!.trim();
    return { base64: data, mimeType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMasterVoiceNote(params: {
  toDigits: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isMasterVoiceEnabled()) return { ok: false, error: 'voice_disabled' };
  if (!shouldOfferVoiceNote(params.text)) return { ok: false, error: 'voice_skipped' };
  const synth = await synthesizeMasterVoiceNote({ text: params.text });
  if (!synth) return { ok: false, error: 'tts_failed' };
  try {
    const dataUrl = `data:${synth.mimeType};base64,${synth.base64}`;
    const uploaded = await uploadWasenderMedia({
      base64: dataUrl,
      mimetype: synth.mimeType,
    });
    const sent = await sendWasenderDirect({
      toDigits: params.toDigits,
      audioUrl: uploaded.publicUrl,
    });
    return sent.ok ? { ok: true } : { ok: false, error: sent.error || 'send_failed' };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'voice_send_error',
    };
  }
}
