/**
 * Local decryption of inbound WhatsApp media (voice notes / photos).
 *
 * WhatsApp stores media encrypted (AES-256-CBC). The webhook carries the CDN `url` (or
 * `directPath`) and the `mediaKey`; the key is expanded with HKDF-SHA256 using a per-type
 * "info" label. Doing this ourselves removes the dependency on a third-party decrypt call.
 */
import { createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

export type WaMediaKind = 'audio' | 'image' | 'document' | 'video';

const INFO: Record<WaMediaKind, string> = {
  audio: 'WhatsApp Audio Keys',
  image: 'WhatsApp Image Keys',
  document: 'WhatsApp Document Keys',
  video: 'WhatsApp Video Keys',
};

export function readMediaKey(raw: unknown): Buffer | null {
  try {
    if (typeof raw === 'string' && raw.trim()) return Buffer.from(raw.trim(), 'base64');
    if (raw && typeof raw === 'object') {
      const o = raw as { type?: string; data?: unknown };
      if (o.type === 'Buffer' && Array.isArray(o.data)) return Buffer.from(o.data as number[]);
      const vals = Object.values(raw as Record<string, unknown>);
      if (vals.length >= 16 && vals.every((v) => typeof v === 'number')) {
        return Buffer.from(vals as number[]);
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

export type WaMediaNode = {
  url?: unknown;
  directPath?: unknown;
  mediaKey?: unknown;
  mimetype?: unknown;
};

export function waMediaDownloadUrl(node: WaMediaNode): string | null {
  const url = typeof node.url === 'string' ? node.url.trim() : '';
  if (/^https:\/\//i.test(url)) return url;
  const direct = typeof node.directPath === 'string' ? node.directPath.trim() : '';
  if (direct.startsWith('/')) return `https://mmg.whatsapp.net${direct}`;
  return null;
}

/** Returns the plain bytes, or null when the key/MAC does not check out. */
export function decryptWaMedia(
  encrypted: Buffer,
  mediaKey: Buffer,
  kind: WaMediaKind,
): Buffer | null {
  try {
    if (encrypted.length <= 10 || mediaKey.length < 16) return null;
    const expanded = Buffer.from(hkdfSync('sha256', mediaKey, Buffer.alloc(32), INFO[kind], 112));
    const iv = expanded.subarray(0, 16);
    const cipherKey = expanded.subarray(16, 48);
    const macKey = expanded.subarray(48, 80);
    const body = encrypted.subarray(0, encrypted.length - 10);
    const mac = encrypted.subarray(encrypted.length - 10);
    const expectedMac = createHmac('sha256', macKey).update(iv).update(body).digest().subarray(0, 10);
    if (expectedMac.length !== mac.length || !timingSafeEqual(expectedMac, mac)) return null;
    const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    return null;
  }
}
