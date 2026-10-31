/**
 * Keeps in-menu navigation (kiosk screens + overlays) aligned with browser Back.
 * Same idea as the Flutter merchant `MerchantShellHistory`.
 */

const MARKER = 'elmenuxfa-menu-shell';

type MenuHistoryState = {
  source: string;
  depth: number;
};

let depth = 0;
let mutePop = false;
let onBrowserBack: (() => void) | null = null;
let listening = false;

function isBrowser() {
  return typeof window !== 'undefined';
}

function onPopState() {
  if (mutePop) {
    mutePop = false;
    return;
  }
  if (depth > 0) {
    depth -= 1;
  }
  onBrowserBack?.();
}

export function attachMenuShellHistory(handler: () => void) {
  if (!isBrowser()) return;
  onBrowserBack = handler;
  if (listening) return;
  window.addEventListener('popstate', onPopState);
  listening = true;
}

export function detachMenuShellHistory() {
  if (!isBrowser()) return;
  if (listening) {
    window.removeEventListener('popstate', onPopState);
    listening = false;
  }
  onBrowserBack = null;
  depth = 0;
  mutePop = false;
}

/** Allow the next popstate to leave the page (confirm leave purchase). */
export function allowMenuShellHistoryLeave() {
  mutePop = true;
  depth = 0;
}

export function setMenuShellHistoryDepth(desiredRaw: number) {
  if (!isBrowser()) return;
  const desired = desiredRaw < 0 ? 0 : Math.floor(desiredRaw);
  if (desired === depth) return;

  if (desired > depth) {
    for (let next = depth + 1; next <= desired; next += 1) {
      const state: MenuHistoryState = { source: MARKER, depth: next };
      window.history.pushState(state, '', window.location.href);
    }
    depth = desired;
    return;
  }

  const delta = depth - desired;
  depth = desired;
  mutePop = true;
  window.history.go(-delta);
}

export function getMenuShellHistoryDepth() {
  return depth;
}
