/**
 * Private ephemeral media staging store (disk under .data, never public buckets).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

function mediaDir(env: NodeJS.ProcessEnv = process.env) {
  const explicit = (env.CHATBOT_MEDIA_STAGING_DIR || '').trim();
  if (explicit) return explicit;
  // Vercel/serverless: cwd is often read-only; keep ephemeral media under /tmp.
  if ((env.NODE_ENV || '').toLowerCase() === 'production') {
    return join(tmpdir(), 'elmenuxfa-chat-media');
  }
  return join(process.cwd(), '.data', 'chat-media-staging');
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function purgeExpiredMedia(params?: {
  ttlMs?: number;
  env?: NodeJS.ProcessEnv;
}) {
  const dir = mediaDir(params?.env);
  const ttl = params?.ttlMs ?? DEFAULT_TTL_MS;
  if (!existsSync(dir)) return { removed: 0 };
  let removed = 0;
  const now = Date.now();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      const st = statSync(path);
      if (now - st.mtimeMs > ttl) {
        unlinkSync(path);
        removed += 1;
      }
    } catch {
      /* ignore */
    }
  }
  return { removed };
}

export function storeEphemeralMedia(params: {
  bytes: Buffer;
  mime: string;
  kind: string;
  env?: NodeJS.ProcessEnv;
}): { id: string; path: string } {
  const dir = mediaDir(params.env);
  ensureDir(dir);
  purgeExpiredMedia({ env: params.env });
  const id = `${Date.now()}_${randomBytes(8).toString('hex')}`;
  const path = join(dir, `${id}.bin`);
  writeFileSync(path, params.bytes);
  writeFileSync(
    join(dir, `${id}.meta.json`),
    JSON.stringify({
      id,
      mime: params.mime,
      kind: params.kind,
      size: params.bytes.length,
      createdAt: new Date().toISOString(),
    }),
  );
  return { id, path };
}

export function readEphemeralMedia(
  id: string,
  env?: NodeJS.ProcessEnv,
): { bytes: Buffer; meta: Record<string, unknown> } | null {
  const dir = mediaDir(env);
  const path = join(dir, `${id}.bin`);
  const metaPath = join(dir, `${id}.meta.json`);
  if (!existsSync(path) || !existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<
      string,
      unknown
    >;
    return { bytes: readFileSync(path), meta };
  } catch {
    return null;
  }
}
