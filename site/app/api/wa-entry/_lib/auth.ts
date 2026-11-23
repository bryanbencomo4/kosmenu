import { createHmac, timingSafeEqual } from 'node:crypto';

import type { WaEntryConfig } from './config';

/**
 * Webhook authenticity.
 *
 * WaSender docs for signature verification are NOT confirmed in this repo
 * (no prior inbound handler). We support a shared-secret header that we control:
 *   X-Platform-Wa-Secret: <PLATFORM_WA_WEBHOOK_SECRET>
 *
 * Optional HMAC mode (provisional): X-Platform-Wa-Signature = hex(hmac_sha256(secret, rawBody))
 *
 * If secret is empty and flags are on, reject (fail closed) except when
 * adapter=sim AND NODE_ENV is test/development with PLATFORM_WA_ALLOW_INSECURE_LOCAL=1.
 */
export function verifyWaEntryWebhook(params: {
  config: WaEntryConfig;
  headers: Headers | Record<string, string | null | undefined>;
  rawBody: string;
  env?: NodeJS.ProcessEnv;
}): { ok: true } | { ok: false; status: number; error: string } {
  const env = params.env ?? process.env;
  const secret = params.config.webhookSecret;

  const getHeader = (name: string): string => {
    if (params.headers instanceof Headers) {
      return params.headers.get(name) || params.headers.get(name.toLowerCase()) || '';
    }
    const key = Object.keys(params.headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? String(params.headers[key] || '') : '';
  };

  if (!secret) {
    const insecureLocal =
      (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') &&
      params.config.adapter === 'sim' &&
      (env.PLATFORM_WA_ALLOW_INSECURE_LOCAL || '').trim() === '1';
    if (insecureLocal) return { ok: true };
    return { ok: false, status: 401, error: 'webhook_secret_required' };
  }

  const shared = getHeader('x-platform-wa-secret').trim();
  if (shared && safeEqual(shared, secret)) return { ok: true };

  const sig = getHeader('x-platform-wa-signature').trim().toLowerCase();
  if (sig) {
    const expected = createHmac('sha256', secret).update(params.rawBody).digest('hex');
    if (safeEqual(sig, expected)) return { ok: true };
  }

  return { ok: false, status: 401, error: 'webhook_unauthorized' };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
