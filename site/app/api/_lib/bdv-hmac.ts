import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_MAX_SKEW_SECONDS = 300;

export function getBdvSharedSecret(): string | null {
  const value = process.env.BDV_SHARED_SECRET?.trim();
  return value || null;
}

export function bdvHmacHex(secret: string, timestamp: string, nonce: string, rawBody: string) {
  const signingData = `${timestamp}\n${nonce}\n${rawBody}`;
  return createHmac('sha256', secret).update(signingData, 'utf8').digest('hex');
}

function readHeader(headers: Headers, name: string) {
  return (headers.get(name) ?? headers.get(name.toLowerCase()) ?? '').trim();
}

export type BdvHmacFailure = {
  ok: false;
  status: 401 | 503;
  error: string;
};

export type BdvHmacSuccess = {
  ok: true;
  deviceId: string;
  timestamp: string;
  nonce: string;
};

export function verifyBdvRequestHmac(
  headers: Headers,
  rawBody: string,
  options?: { nowSeconds?: number; maxSkewSeconds?: number; secret?: string | null },
): BdvHmacSuccess | BdvHmacFailure {
  const secret = options?.secret === undefined ? getBdvSharedSecret() : options.secret;
  if (!secret) {
    return { ok: false, status: 503, error: 'BDV_SHARED_SECRET is not configured.' };
  }

  const deviceId = readHeader(headers, 'X-BDV-Device');
  const timestamp = readHeader(headers, 'X-BDV-Timestamp');
  const nonce = readHeader(headers, 'X-BDV-Nonce');
  const signature = readHeader(headers, 'X-BDV-Signature').toLowerCase();

  if (!deviceId || !timestamp || !nonce || !signature) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxSkew = options?.maxSkewSeconds ?? Number(process.env.BDV_HMAC_MAX_SKEW_SECONDS ?? DEFAULT_MAX_SKEW_SECONDS);
  if (Math.abs(nowSeconds - timestampSeconds) > maxSkew) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const expected = bdvHmacHex(secret, timestamp, nonce, rawBody);
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true, deviceId, timestamp, nonce };
}
