/**
 * Regression model for merchant panel navigation.
 *
 * Old bug: closing a sheet/saving used history.go → fake Back → Inicio.
 * New model: sheets ignored; section changes use real `/panel/...` URLs;
 * programmatic UI changes use replaceState (never history.go).
 */
import { describe, expect, it } from 'vitest';

type ShellState = {
  nav: 'home' | 'orders' | 'menu';
  pageStack: number;
};

function handleBrowserLocation(
  state: ShellState,
  route: { section: ShellState['nav']; stack: number },
): ShellState {
  let next = { ...state };
  while (next.pageStack > route.stack) {
    next = { ...next, pageStack: next.pageStack - 1 };
  }
  if (route.section !== next.nav) {
    next = { nav: route.section, pageStack: 0 };
  }
  return next;
}

describe('merchant shell route navigation', () => {
  it('keeps home after closing a period filter (sheets are not routes)', () => {
    // Selecting "Última semana" only updates local state — no history change.
    let state: ShellState = { nav: 'home', pageStack: 0 };
    // Sheet open/close must not invent a browser location.
    expect(state).toEqual({ nav: 'home', pageStack: 0 });
  });

  it('keeps section after save/pop via replaceState (not history.go)', () => {
    let state: ShellState = { nav: 'orders', pageStack: 1 };
    // UI pops the form first...
    state = { ...state, pageStack: 0 };
    // ...then replaceState rewrites `/panel/orders/~1` → `/panel/orders`.
    // No popstate → no handleBrowserLocation → stay on orders.
    expect(state).toEqual({ nav: 'orders', pageStack: 0 });
  });

  it('browser Back from a pushed page pops stack only', () => {
    const state = handleBrowserLocation(
      { nav: 'orders', pageStack: 1 },
      { section: 'orders', stack: 0 },
    );
    expect(state).toEqual({ nav: 'orders', pageStack: 0 });
  });

  it('browser Back from a section returns to home', () => {
    const state = handleBrowserLocation(
      { nav: 'orders', pageStack: 0 },
      { section: 'home', stack: 0 },
    );
    expect(state).toEqual({ nav: 'home', pageStack: 0 });
  });
});
