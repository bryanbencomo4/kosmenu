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
import { buildImageTurnText } from '../../wa-master/_lib/image-turn';
import type { WaInboundMedia } from './contract';
import { decryptWasenderMedia } from './wasender-direct';
import {
  decryptWaMedia,
  readMediaKey,
  waMediaDownloadUrl,
  type WaMediaNode,
} from './wa-media-decrypt';

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

/**
 * Get the plain bytes of an inbound voice note / photo.
 * 1) Decrypt locally from the webhook's CDN url + mediaKey (no third party involved).
 * 2) Fall back to Wasender's decrypt endpoint.
 */
async function fetchMediaBytes(media: WaInboundMedia, maxBytes: number): Promise<Buffer | null> {
  const content =
    media.message && typeof media.message === 'object'
      ? (media.message as Record<string, unknown>)
      : {};
  const wrapped = (content.documentWithCaptionMessage as { message?: Record<string, unknown> } | undefined)
    ?.message;
  const nodeKey =
    media.kind === 'audio'
      ? 'audioMessage'
      : media.kind === 'image'
        ? 'imageMessage'
        : media.kind === 'video'
          ? 'videoMessage'
          : 'documentMessage';
  const node = (content[nodeKey] ?? wrapped?.[nodeKey]) as WaMediaNode | undefined;

  if (node && typeof node === 'object') {
    const url = waMediaDownloadUrl(node);
    const key = readMediaKey(node.mediaKey);
    if (url && key) {
      const encrypted = await download(url, maxBytes + 64);
      if (encrypted) {
        const plain = decryptWaMedia(encrypted, key, media.kind);
        if (plain && plain.length > 200 && plain.length <= maxBytes) return plain;
        console.warn('[wa-entry] media', { step: 'local_decrypt_failed', kind: media.kind });
      } else {
        console.warn('[wa-entry] media', { step: 'cdn_download_failed', kind: media.kind });
      }
    } else {
      console.warn('[wa-entry] media', {
        step: 'no_url_or_key',
        kind: media.kind,
        hasUrl: Boolean(url),
        hasKey: Boolean(key),
        nodeKeys: Object.keys(node).slice(0, 20),
      });
    }
  } else {
    console.warn('[wa-entry] media', { step: 'no_media_node', contentKeys: Object.keys(content).slice(0, 12) });
  }

  const decrypted = await decryptWasenderMedia({ key: media.key, message: media.message });
  if (!decrypted) {
    console.warn('[wa-entry] media', { step: 'wasender_decrypt_failed', kind: media.kind });
    return null;
  }
  const bytes = await download(decrypted.publicUrl, maxBytes);
  if (!bytes) console.warn('[wa-entry] media', { step: 'wasender_download_failed', kind: media.kind });
  return bytes;
}

export type InboundMediaUnderstanding =
  | { ok: true; text: string }
  | { ok: false; reply: string };

export const WA_MEDIA_FALLBACK_REPLY =
  'Te escuché 🎧 pero no logré abrir ese audio o foto desde aquí. ¿Me lo escribes en un mensajito? Así te ayudo al instante 🙌';

export async function understandInboundWaMedia(
  media: WaInboundMedia,
  caption: string,
  opts?: { master?: boolean },
): Promise<InboundMediaUnderstanding> {
  try {
    if (!isAssistantMediaEnabled()) return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
    if (media.kind === 'video') {
      return {
        ok: false,
        reply:
          'Recibí tu video 🎥 pero por aquí no puedo verlos. Cuéntame con un mensaje o mándame una foto/captura de lo importante y te ayudo al instante 🙌',
      };
    }
    const isPdf = /pdf/i.test(media.mimetype || '');
    if (media.kind === 'document' && !isPdf && !/^image\//i.test(media.mimetype || '')) {
      return {
        ok: false,
        reply:
          'Recibí tu archivo 📎 pero solo puedo abrir fotos y PDF. ¿Me lo mandas como foto o me cuentas qué necesitas?',
      };
    }
    const maxBytes =
      media.kind === 'audio' ? ASSISTANT_MEDIA_MAX_AUDIO_BYTES : ASSISTANT_MEDIA_MAX_IMAGE_BYTES;
    const bytes = await fetchMediaBytes(media, maxBytes);
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
      mime: media.mimetype || (media.kind === 'document' ? 'application/pdf' : 'image/jpeg'),
      audience: 'whatsapp',
    });
    if (!analysis) return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
    if (!opts?.master) {
      // Classic router (non-pilot numbers) keeps the plain-text hint it always understood.
      if (caption) return { ok: true, text: `${caption} (foto: ${analysis.resumen})`.slice(0, 600) };
      if (analysis.busqueda) return { ok: true, text: `quiero ${analysis.busqueda}` };
      return { ok: true, text: `Te mandé una foto: ${analysis.resumen}`.slice(0, 600) };
    }
    return {
      ok: true,
      text: buildImageTurnText({
        tipo: analysis.tipo,
        resumen: analysis.resumen,
        texto: analysis.texto,
        busqueda: analysis.busqueda,
        monto: analysis.monto,
        referencia: analysis.referencia,
        banco: analysis.banco,
        fecha: analysis.fecha,
        pie: caption,
      }),
    };
  } catch {
    return { ok: false, reply: WA_MEDIA_FALLBACK_REPLY };
  }
}
