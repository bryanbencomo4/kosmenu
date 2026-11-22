import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();

vi.stubGlobal('window', {});
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
});

import {
  clearChatHistory,
  ensureChatSessionId,
  loadChatHistory,
  saveChatHistory,
} from '../app/_lib/chatbot-session';

describe('chatbot session history', () => {
  beforeEach(() => {
    store.clear();
  });

  it('persists history per commerce and clears independently', () => {
    const a = 'commerce-a';
    const b = 'commerce-b';
    saveChatHistory(a, [
      {
        id: '1',
        role: 'user',
        text: 'hola',
        createdAt: 1,
      },
    ]);
    saveChatHistory(b, [
      {
        id: '2',
        role: 'user',
        text: 'otro',
        createdAt: 2,
      },
    ]);
    expect(loadChatHistory(a)?.[0]?.text).toBe('hola');
    expect(loadChatHistory(b)?.[0]?.text).toBe('otro');
    clearChatHistory(a);
    expect(loadChatHistory(a)).toBeNull();
    expect(loadChatHistory(b)?.[0]?.text).toBe('otro');
  });

  it('keeps a stable session id until cleared', () => {
    const id1 = ensureChatSessionId('c1');
    const id2 = ensureChatSessionId('c1');
    expect(id1).toBe(id2);
    clearChatHistory('c1');
    const id3 = ensureChatSessionId('c1');
    expect(id3).not.toBe(id1);
  });
});
