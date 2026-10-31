import { afterEach, describe, expect, it, vi } from 'vitest';

describe('menu-shell-history', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('pushes and shrinks history depth without firing muted pops', async () => {
    const pushState = vi.fn();
    const go = vi.fn();
    const listeners = new Map<string, EventListener>();

    vi.stubGlobal('window', {
      location: { href: 'https://elmenuxfa.com/v/demo' },
      history: { pushState, go },
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    });

    const mod = await import('../app/v/[id]/_lib/menu-shell-history');
    const onBack = vi.fn();
    mod.attachMenuShellHistory(onBack);
    mod.setMenuShellHistoryDepth(2);
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(mod.getMenuShellHistoryDepth()).toBe(2);

    mod.setMenuShellHistoryDepth(1);
    expect(go).toHaveBeenCalledWith(-1);
    expect(mod.getMenuShellHistoryDepth()).toBe(1);

    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).not.toHaveBeenCalled();

    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mod.getMenuShellHistoryDepth()).toBe(0);

    mod.detachMenuShellHistory();
  });
});
