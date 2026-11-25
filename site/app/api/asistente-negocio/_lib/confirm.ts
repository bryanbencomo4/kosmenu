import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  isBusinessAllowedOp,
  type BusinessAllowedOp,
} from './config';

export type ConfirmPayload = {
  op: BusinessAllowedOp;
  userId: string;
  comercioId: string;
  /** Op-specific JSON-serializable fields. */
  data: Record<string, unknown>;
};

type IssuedConfirm = {
  token: string;
  expiresAt: number;
  nonce: string;
  op: BusinessAllowedOp;
};

const usedNonces = new Map<string, number>();

function getConfirmSecret(env: NodeJS.ProcessEnv = process.env): string {
  const dedicated = (env.BUSINESS_ASSISTANT_CONFIRM_SECRET ?? '').trim();
  if (dedicated) return dedicated;
  const fallback = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (fallback) return fallback;
  // Dev/test only — never rely on this in production.
  return 'business-assistant-dev-confirm-secret';
}

function pruneNonces(now: number) {
  for (const [nonce, exp] of usedNonces) {
    if (exp <= now) usedNonces.delete(nonce);
  }
}

function stableData(data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = data[k];
  return JSON.stringify(ordered);
}

export function issueConfirmToken(
  payload: ConfirmPayload,
  ttlMs: number,
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
): IssuedConfirm {
  if (!isBusinessAllowedOp(payload.op)) {
    throw new Error('invalid_op');
  }
  const exp = now + ttlMs;
  const nonce = randomUUID();
  const body = [
    payload.op,
    payload.userId,
    payload.comercioId,
    String(exp),
    nonce,
    stableData(payload.data),
  ].join('|');
  const sig = createHmac('sha256', getConfirmSecret(env)).update(body).digest('base64url');
  return {
    token: `${Buffer.from(body, 'utf8').toString('base64url')}.${sig}`,
    expiresAt: exp,
    nonce,
    op: payload.op,
  };
}

export function verifyConfirmToken(
  token: string,
  expected: { userId: string; comercioId: string },
  now = Date.now(),
  env: NodeJS.ProcessEnv = process.env,
):
  | { ok: true; payload: ConfirmPayload; nonce: string; expiresAt: number }
  | { ok: false; error: string } {
  pruneNonces(now);
  const raw = (token || '').trim();
  const lastDot = raw.lastIndexOf('.');
  if (lastDot <= 0) return { ok: false, error: 'invalid_token' };
  const bodyB64 = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  let body: string;
  try {
    body = Buffer.from(bodyB64, 'base64url').toString('utf8');
  } catch {
    return { ok: false, error: 'invalid_token' };
  }
  const expectedSig = createHmac('sha256', getConfirmSecret(env)).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'invalid_signature' };
  }
  const parts = body.split('|');
  if (parts.length !== 6) return { ok: false, error: 'invalid_token' };
  const [op, userId, comercioId, expRaw, nonce, dataJson] = parts;
  if (!isBusinessAllowedOp(op)) return { ok: false, error: 'invalid_op' };
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return { ok: false, error: 'expired' };
  if (userId !== expected.userId || comercioId !== expected.comercioId) {
    return { ok: false, error: 'scope_mismatch' };
  }
  if (usedNonces.has(nonce)) return { ok: false, error: 'replay' };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataJson) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'invalid_payload' };
  }
  return {
    ok: true,
    payload: { op, userId, comercioId, data },
    nonce,
    expiresAt: exp,
  };
}

/** Mark nonce consumed after a successful apply. */
export function consumeConfirmNonce(nonce: string, expiresAt: number) {
  usedNonces.set(nonce, expiresAt);
}

/** Test helper */
export function __resetConfirmNoncesForTests() {
  usedNonces.clear();
}
