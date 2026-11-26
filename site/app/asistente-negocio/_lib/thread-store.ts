/**
 * Local conversation history for the business assistant.
 *
 * Why local: the chat is a convenience view over the owner's own, already-authenticated
 * account. Nothing here grants access to data (every action still needs the owner's
 * session + a confirm token), so keeping the history on the device costs the server nothing
 * and survives link expiry, reloads and re-opening the app.
 *
 * Design for speed: a tiny index (id/title/date) is read to list conversations; each
 * conversation lives under its own key and is only parsed when opened.
 * Namespaced per user so a shared device never mixes two owners; wiped on sign-out.
 */

export type StoredMsg = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
  imageUrl?: string | null;
};

export type ThreadMeta = {
  id: string;
  comercioId: string | null;
  title: string;
  updatedAt: number;
  count: number;
};

const PREFIX = 'elmenuxfa:ba:v1';
const MAX_THREADS = 30;
const MAX_MESSAGES = 60;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function ls(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Namespace from the JWT `sub` (unverified: used only to separate local data per user). */
export function threadScopeFromToken(token: string | null | undefined): string {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return 'anon';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
    return String(json.sub || 'anon').slice(0, 64);
  } catch {
    return 'anon';
  }
}

const idxKey = (scope: string) => `${PREFIX}:${scope}:index`;
const threadKey = (scope: string, id: string) => `${PREFIX}:${scope}:t:${id}`;
const activeKey = (scope: string) => `${PREFIX}:${scope}:active`;

function readIndex(scope: string): ThreadMeta[] {
  try {
    const raw = ls()?.getItem(idxKey(scope));
    const list = raw ? (JSON.parse(raw) as ThreadMeta[]) : [];
    const now = Date.now();
    return Array.isArray(list) ? list.filter((m) => m && m.id && now - m.updatedAt < MAX_AGE_MS) : [];
  } catch {
    return [];
  }
}

function writeIndex(scope: string, list: ThreadMeta[]) {
  try {
    ls()?.setItem(idxKey(scope), JSON.stringify(list));
  } catch {
    /* quota / private mode: history is best-effort */
  }
}

export function newThreadId(): string {
  return `th_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function listThreads(scope: string): ThreadMeta[] {
  return readIndex(scope).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveThreadId(scope: string): string | null {
  try {
    return ls()?.getItem(activeKey(scope)) || null;
  } catch {
    return null;
  }
}

export function setActiveThreadId(scope: string, id: string | null) {
  try {
    if (id) ls()?.setItem(activeKey(scope), id);
    else ls()?.removeItem(activeKey(scope));
  } catch {
    /* ignore */
  }
}

export function loadThread(scope: string, id: string): { meta: ThreadMeta; messages: StoredMsg[] } | null {
  try {
    const meta = readIndex(scope).find((m) => m.id === id);
    const raw = ls()?.getItem(threadKey(scope, id));
    if (!meta || !raw) return null;
    const messages = JSON.parse(raw) as StoredMsg[];
    return Array.isArray(messages) && messages.length ? { meta, messages } : null;
  } catch {
    return null;
  }
}

function titleFrom(messages: StoredMsg[]): string {
  const first = messages.find((m) => m.role === 'user' && m.text.trim());
  const t = (first?.text || 'Conversación').replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

export function saveThread(
  scope: string,
  id: string,
  comercioId: string | null,
  messages: Array<StoredMsg & Record<string, unknown>>,
) {
  const clean: StoredMsg[] = messages
    .filter((m) => m.text && String(m.text).trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: String(m.text).slice(0, 1500),
      createdAt: m.createdAt,
      imageUrl: m.imageUrl && /^https?:/i.test(String(m.imageUrl)) ? String(m.imageUrl) : null,
    }));
  // Nothing worth keeping until the owner actually says something.
  if (!clean.some((m) => m.role === 'user')) return;
  try {
    ls()?.setItem(threadKey(scope, id), JSON.stringify(clean));
    const index = readIndex(scope).filter((m) => m.id !== id);
    index.push({ id, comercioId, title: titleFrom(clean), updatedAt: Date.now(), count: clean.length });
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    const keep = index.slice(0, MAX_THREADS);
    for (const dropped of index.slice(MAX_THREADS)) ls()?.removeItem(threadKey(scope, dropped.id));
    writeIndex(scope, keep);
  } catch {
    /* ignore */
  }
}

export function deleteThread(scope: string, id: string) {
  try {
    ls()?.removeItem(threadKey(scope, id));
    writeIndex(
      scope,
      readIndex(scope).filter((m) => m.id !== id),
    );
  } catch {
    /* ignore */
  }
}

/** Sign-out: remove every conversation stored for this user. */
export function clearAllThreads(scope: string) {
  try {
    for (const m of readIndex(scope)) ls()?.removeItem(threadKey(scope, m.id));
    ls()?.removeItem(idxKey(scope));
    ls()?.removeItem(activeKey(scope));
  } catch {
    /* ignore */
  }
}
