/**
 * Browser helpers for opaque handoff continuity (sessionStorage after peek/consume).
 */
import {
  BUSINESS_HANDOFF_SESSION_KEY,
  COMMERCE_HANDOFF_SESSION_PREFIX,
  DISCOVERY_HANDOFF_SESSION_KEY,
  sanitizeConversationContext,
  type ConversationContext,
} from '../api/_lib/conversation-context';

export type { ConversationContext };

export {
  buildCommerceHandoffGreeting,
  sanitizeConversationContext,
} from '../api/_lib/conversation-context';

function readJson(key: string): ConversationContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return sanitizeConversationContext(JSON.parse(raw) as ConversationContext);
  } catch {
    return null;
  }
}

function writeJson(key: string, ctx: ConversationContext) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify(sanitizeConversationContext(ctx)));
  } catch {
    // ignore quota
  }
}

export function commerceHandoffStorageKey(comercioId: string) {
  return `${COMMERCE_HANDOFF_SESSION_PREFIX}${comercioId}`;
}

export function loadCommerceHandoffContext(comercioId: string) {
  return readJson(commerceHandoffStorageKey(comercioId));
}

export function saveCommerceHandoffContext(
  comercioId: string,
  ctx: ConversationContext,
) {
  writeJson(commerceHandoffStorageKey(comercioId), {
    ...ctx,
    profile: 'commerce',
    comercioId,
  });
}

export function loadBusinessHandoffContext() {
  return readJson(BUSINESS_HANDOFF_SESSION_KEY);
}

export function saveBusinessHandoffContext(ctx: ConversationContext) {
  writeJson(BUSINESS_HANDOFF_SESSION_KEY, {
    ...ctx,
    profile: 'business',
  });
}

export function loadDiscoveryHandoffContext() {
  return readJson(DISCOVERY_HANDOFF_SESSION_KEY);
}

export function saveDiscoveryHandoffContext(ctx: ConversationContext) {
  writeJson(DISCOVERY_HANDOFF_SESSION_KEY, {
    ...ctx,
    profile: 'consumer_discovery',
  });
}

/** Read ?h= or #h= without putting secrets in logs. */
export function readHandoffCodeFromLocation(
  search: string,
  hash: string,
): string | null {
  try {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const fromQ = (q.get('h') || '').trim();
    if (fromQ) return fromQ;
    const frag = (hash || '').replace(/^#/, '');
    if (frag.startsWith('h=')) {
      return decodeURIComponent(frag.slice(2)).trim() || null;
    }
    const fp = new URLSearchParams(frag);
    const fromH = (fp.get('h') || '').trim();
    return fromH || null;
  } catch {
    return null;
  }
}

export function scrubHandoffCodeFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('h')) {
      url.searchParams.delete('h');
    }
    if (url.hash.includes('h=')) {
      url.hash = '';
    }
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    // ignore
  }
}

export async function peekOrConsumeHandoff(params: {
  code: string;
  destination: 'consumer_discovery' | 'business_assistant' | 'commerce_chatbot';
  action: 'peek' | 'consume';
}): Promise<{ ok: true; payload: ConversationContext } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/wa-handoff/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: params.code,
        destination: params.destination,
        action: params.action,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      payload?: ConversationContext;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: String(json.error || 'redeem_failed') };
    }
    return {
      ok: true,
      payload: sanitizeConversationContext(json.payload || {}),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' };
  }
}
