/**
 * Inbound WhatsApp voice notes / photos → text the Master brain can act on.
 * Runs only for the authorized pilot sender (called after the allowlist gates).
 * Never throws: on any failure the caller sends a friendly "write it" reply.
 */
import {
  analyzeImage,
  ASSISTANT_MEDIA_MAX_AUDIO_BYTES,
  ASSISTANT_MEDIA_MAX_IMAGE_BYTES,
  isAssistantMediaEnabled,
  transcribeAudio,
} from '../../_lib/assistant-media';
import type { WaInboundMedia } from './contract';
import { decryptWasenderMedia } from './wasender-direct';

async function download(url: string, maxBytes: number): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 200 && buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type InboundMediaUnderstanding =
  | { ok: true; text: string }
  | { ok: false; reply: string };

export const WA_MEDIA_FALLBACK_REPLY =
  'Te escuché 🎧 pero no logré abrir ese audio o foto desde aquí. ¿Me lo escribes en un mensajito? Así te ayudo al instante 🙌';

export async function understandInboundWaMedia(
  media: WaInboundMedia,
  caption: string,
): Promise<InboundMediaUnderstanding> {
  try {
    if (!isAssistantMediaEnabled()) return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
    const decrypted = await decryptWasenderMedia({ key: media.key, message: media.message });
    if (!decrypted) return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
    const bytes = await download(
      decrypted.publicUrl,
      media.kind === 'audio' ? ASSISTANT_MEDIA_MAX_AUDIO_BYTES : ASSISTANT_MEDIA_MAX_IMAGE_BYTES,
    );
    if (!bytes) return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };

    if (media.kind === 'audio') {
      const transcript = await transcribeAudio({ bytes, mime: media.mimetype || 'audio/ogg' });
      if (!transcript) {
        return {
          ok: false,
          reply: 'No alcancé a entender tu audio 🎧 ¿Me lo repites o me lo escribes?',
        };
      }
      return { ok: true, text: transcript };
    }

    const analysis = await analyzeImage({
      bytes,
      mime: media.mimetype || 'image/jpeg',
      audience: 'discovery',
    });
    if (!analysis) return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
    if (caption) return { ok: true, text: `${caption} (foto: ${analysis.resumen})`.slice(0, 600) };
    if (analysis.busqueda) return { ok: true, text: `quiero ${analysis.busqueda}` };
    return { ok: true, text: `Te mandé una foto: ${analysis.resumen}`.slice(0, 600) };
  } catch {
    return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
  }
}
