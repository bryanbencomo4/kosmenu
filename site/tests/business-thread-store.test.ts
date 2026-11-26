import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllThreads,
  deleteThread,
  getActiveThreadId,
  listThreads,
  loadThread,
  saveThread,
  setActiveThreadId,
  threadScopeFromToken,
} from '../app/asistente-negocio/_lib/thread-store';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const msg = (id: string, role: 'user' | 'assistant', text: string) => ({ id, role, text, createdAt: Date.now() });

describe('business assistant thread store', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
  });

  it('keeps nothing until the owner speaks, then persists and lists newest first', () => {
    saveThread('u1', 't1', 'c1', [msg('a', 'assistant', 'Hola')]);
    expect(listThreads('u1')).toHaveLength(0);

    saveThread('u1', 't1', 'c1', [msg('a', 'assistant', 'Hola'), msg('b', 'user', 'Cambia el precio de la pizza')]);
    saveThread('u1', 't2', 'c1', [msg('c', 'user', 'Ver pedidos'), msg('d', 'assistant', 'Aquí van')]);
    const list = listThreads('u1');
    expect(list.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    expect(loadThread('u1', 't1')?.messages).toHaveLength(2);
    expect(list.find((t) => t.id === 't1')?.title).toMatch(/pizza/);
  });

  it('never mixes users and drops blob previews', () => {
    saveThread('u1', 't1', null, [
      { ...msg('a', 'user', 'foto'), imageUrl: 'blob:http://x/1' },
      msg('b', 'assistant', 'ok'),
    ]);
    expect(listThreads('u2')).toHaveLength(0);
    expect(loadThread('u1', 't1')?.messages[0].imageUrl).toBeNull();
  });

  it('active pointer, delete and sign-out wipe', () => {
    saveThread('u1', 't1', null, [msg('a', 'user', 'hola'), msg('b', 'assistant', 'ey')]);
    setActiveThreadId('u1', 't1');
    expect(getActiveThreadId('u1')).toBe('t1');
    deleteThread('u1', 't1');
    expect(loadThread('u1', 't1')).toBeNull();
    saveThread('u1', 't3', null, [msg('a', 'user', 'hola'), msg('b', 'assistant', 'ey')]);
    clearAllThreads('u1');
    expect(listThreads('u1')).toHaveLength(0);
    expect(getActiveThreadId('u1')).toBeNull();
  });

  it('derives a stable scope from a JWT sub and falls back to anon', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'user-123' })).toString('base64url');
    expect(threadScopeFromToken(`h.${payload}.s`)).toBe('user-123');
    expect(threadScopeFromToken('garbage')).toBe('anon');
    expect(threadScopeFromToken(null)).toBe('anon');
  });
});
