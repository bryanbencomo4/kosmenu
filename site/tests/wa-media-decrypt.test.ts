import { createCipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  decryptWaMedia,
  readMediaKey,
  waMediaDownloadUrl,
} from '../app/api/wa-entry/_lib/wa-media-decrypt';

function encrypt(plain: Buffer, key: Buffer, info: string): Buffer {
  const exp = Buffer.from(hkdfSync('sha256', key, Buffer.alloc(32), info, 112));
  const iv = exp.subarray(0, 16);
  const c = createCipheriv('aes-256-cbc', exp.subarray(16, 48), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  const mac = createHmac('sha256', exp.subarray(48, 80)).update(iv).update(body).digest().subarray(0, 10);
  return Buffer.concat([body, mac]);
}

describe('WhatsApp media decrypt', () => {
  it('round-trips audio and image payloads', () => {
    const key = randomBytes(32);
    const plain = randomBytes(5000);
    expect(decryptWaMedia(encrypt(plain, key, 'WhatsApp Audio Keys'), key, 'audio')?.equals(plain)).toBe(true);
    expect(decryptWaMedia(encrypt(plain, key, 'WhatsApp Image Keys'), key, 'image')?.equals(plain)).toBe(true);
  });

  it('rejects a wrong key or tampered data', () => {
    const key = randomBytes(32);
    const enc = encrypt(randomBytes(300), key, 'WhatsApp Audio Keys');
    expect(decryptWaMedia(enc, randomBytes(32), 'audio')).toBeNull();
    enc[3] ^= 0xff;
    expect(decryptWaMedia(enc, key, 'audio')).toBeNull();
  });

  it('reads media keys in the shapes webhooks use', () => {
    const key = randomBytes(32);
    expect(readMediaKey(key.toString('base64'))?.equals(key)).toBe(true);
    expect(readMediaKey({ type: 'Buffer', data: [...key] })?.equals(key)).toBe(true);
    expect(readMediaKey({ ...[...key] })?.equals(key)).toBe(true);
    expect(readMediaKey(null)).toBeNull();
  });

  it('builds the download url from url or directPath', () => {
    expect(waMediaDownloadUrl({ url: 'https://mmg.whatsapp.net/x.enc' })).toBe('https://mmg.whatsapp.net/x.enc');
    expect(waMediaDownloadUrl({ directPath: '/v/t62/abc.enc' })).toBe('https://mmg.whatsapp.net/v/t62/abc.enc');
    expect(waMediaDownloadUrl({})).toBeNull();
  });
});
