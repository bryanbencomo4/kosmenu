import { afterEach, describe, expect, it, vi } from 'vitest';

describe('menu-shell-history', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  function stubWindow() {
    const pushState = vi.fn(
      (state: unknown, _title: string, _url: string) => {
        (window as unknown as { history: { state: unknown } }).history.state =
          state;
      },
    );
    const go = vi.fn();
    const listeners = new Map<string, EventListener>();
    let state: unknown = null;

    const history = {
      get state() {
        return state;
      },
      set state(value: unknown) {
        state = value;
      },
      pushState: (next: unknown, title: string, url: string) => {
        state = next;
        pushState(next, title, url);
      },
      go,
    };

    vi.stubGlobal('window', {
      location: { href: 'https://elmenuxfa.com/v/demo' },
      history,
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
      setTimeout: (fn: () => void, _ms?: number) => {
        // Tests drive popstate explicitly; skip watchdog timers.
        void fn;
        return 0 as unknown as number;
      },
      clearTimeout: () => {},
    });

    return { pushState, go, listeners, history };
  }

  it('pushes and shrinks history depth without firing muted pops', async () => {
    const { pushState, go, listeners, history } = stubWindow();

    const mod = await import('../app/v/[id]/_lib/menu-shell-history');
    const onBack = vi.fn();
    mod.attachMenuShellHistory(onBack);
    mod.setMenuShellHistoryDepth(2);
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(mod.getMenuShellHistoryDepth()).toBe(2);

    mod.setMenuShellHistoryDepth(1);
    expect(go).toHaveBeenCalledWith(-1);
    expect(mod.getMenuShellHistoryDepth()).toBe(1);
    expect(mod.isMenuShellHistorySyncing()).toBe(true);

    history.state = { source: 'elmenuxfa-menu-shell', depth: 1 };
    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).not.toHaveBeenCalled();
    expect(mod.isMenuShellHistorySyncing()).toBe(false);

    history.state = { source: 'elmenuxfa-menu-shell', depth: 0 };
    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mod.getMenuShellHistoryDepth()).toBe(0);

    mod.detachMenuShellHistory();
  });

  it('does not fire shell back when shrinking multiple levels after an action', async () => {
    const { go, listeners, history } = stubWindow();

    const mod = await import('../app/v/[id]/_lib/menu-shell-history');
    const onBack = vi.fn();
    mod.attachMenuShellHistory(onBack);
    mod.setMenuShellHistoryDepth(3);

    mod.setMenuShellHistoryDepth(0);
    expect(go).toHaveBeenCalledWith(-3);
    history.state = null;
    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).not.toHaveBeenCalled();
    expect(mod.getMenuShellHistoryDepth()).toBe(0);

    mod.detachMenuShellHistory();
  });

  it('ignores browser forward instead of treating it as back', async () => {
    const { listeners, history } = stubWindow();

    const mod = await import('../app/v/[id]/_lib/menu-shell-history');
    const onBack = vi.fn();
    mod.attachMenuShellHistory(onBack);
    mod.setMenuShellHistoryDepth(2);

    // Simulate Back to depth 1
    history.state = { source: 'elmenuxfa-menu-shell', depth: 1 };
    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mod.getMenuShellHistoryDepth()).toBe(1);

    // Simulate Forward to depth 2 — must NOT call onBack again
    history.state = { source: 'elmenuxfa-menu-shell', depth: 2 };
    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mod.getMenuShellHistoryDepth()).toBe(2);

    mod.detachMenuShellHistory();
  });

  it('queues depth changes while a shrink go() is in flight', async () => {
    const { pushState, go, listeners, history } = stubWindow();

    const mod = await import('../app/v/[id]/_lib/menu-shell-history');
    const onBack = vi.fn();
    mod.attachMenuShellHistory(onBack);
    mod.setMenuShellHistoryDepth(2);
    mod.setMenuShellHistoryDepth(0);
    expect(go).toHaveBeenCalledWith(-2);

    // While go is in flight, a new push request must be queued (not applied yet).
    mod.setMenuShellHistoryDepth(1);
    expect(pushState).toHaveBeenCalledTimes(2);

    history.state = null;
    listeners.get('popstate')?.(new Event('popstate'));
    expect(onBack).not.toHaveBeenCalled();
    // After muted pop settles, pending depth 1 is applied.
    expect(pushState).toHaveBeenCalledTimes(3);
    expect(mod.getMenuShellHistoryDepth()).toBe(1);

    mod.detachMenuShellHistory();
  });
});
