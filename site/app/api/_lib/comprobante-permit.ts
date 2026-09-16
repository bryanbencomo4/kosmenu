import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

const PERMIT_TTL_MS = 15 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getComprobantePermitSecret(): string {
  const dedicated = process.env.COMPROBANTE_UPLOAD_SECRET?.trim();
  if (dedicated) return dedicated;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback) return fallback;
  throw new Error('Missing environment variable: COMPROBANTE_UPLOAD_SECRET');
}

export function isComercioUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function issueComprobantePermit(
  comercioId: string,
  now = Date.now(),
): { permit: string; expiresAt: number } {
  const id = comercioId.trim().toLowerCase();
  if (!isComercioUuid(id)) {
    throw new Error('Invalid comercio id.');
  }
  const exp = now + PERMIT_TTL_MS;
  const nonce = randomUUID();
  const payload = `${id}.${exp}.${nonce}`;
  const sig = createHmac('sha256', getComprobantePermitSecret())
    .update(payload)
    .digest('base64url');
  return { permit: `${payload}.${sig}`, expiresAt: exp };
}

export function verifyComprobantePermit(
  permit: string,
  expectedComercioId: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string } {
  const raw = permit.trim();
  const expectedId = expectedComercioId.trim().toLowerCase();
  if (!raw || !isComercioUuid(expectedId)) {
    return { ok: false, error: 'Invalid permit.' };
  }

  const lastDot = raw.lastIndexOf('.');
  if (lastDot <= 0) {
    return { ok: false, error: 'Invalid permit.' };
  }
  const payload = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  const parts = payload.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid permit.' };
  }
  const [cid, expRaw, nonce] = parts;
  const exp = Number(expRaw);
  if (!isComercioUuid(cid) || !Number.isFinite(exp) || !nonce) {
    return { ok: false, error: 'Invalid permit.' };
  }
  if (cid !== expectedId) {
    return { ok: false, error: 'Permit does not match comercio.' };
  }
  if (exp < now) {
    return { ok: false, error: 'Permit expired.' };
  }

  const expectedSig = createHmac('sha256', getComprobantePermitSecret())
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, error: 'Invalid permit.' };
  }
  return { ok: true };
}
