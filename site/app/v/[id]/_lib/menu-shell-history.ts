/**
 * Keeps in-menu navigation (kiosk screens + overlays) aligned with browser Back.
 * Same idea as the Flutter merchant `MerchantShellHistory`.
 *
 * Shrinking depth uses `history.go`, which emits a popstate we must mute so
 * closing an overlay / finishing checkout does not re-trigger shell back.
 */

const MARKER = 'elmenuxfa-menu-shell';

type MenuHistoryState = {
  source: string;
  depth: number;
};

let depth = 0;
let mutePops = 0;
let goInFlight = false;
let pendingDesired: number | null = null;
let onBrowserBack: (() => void) | null = null;
let listening = false;
let muteWatchdog: ReturnType<typeof setTimeout> | null = null;

function isBrowser() {
  return typeof window !== 'undefined';
}

function depthFromHistoryState(state: unknown): number {
  if (!state || typeof state !== 'object') return 0;
  const record = state as Record<string, unknown>;
  if (record.source !== MARKER) return 0;
  const raw = record.depth;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  return 0;
}

function clearMuteWatchdog() {
  if (muteWatchdog != null) {
    clearTimeout(muteWatchdog);
    muteWatchdog = null;
  }
}

function flushPending() {
  const pending = pendingDesired;
  pendingDesired = null;
  if (pending == null) return;
  applyDepth(pending);
}

function applyDepth(desired: number) {
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
  mutePops += 1;
  goInFlight = true;
  clearMuteWatchdog();
  muteWatchdog = setTimeout(() => {
    if (!goInFlight && mutePops <= 0) return;
    mutePops = 0;
    goInFlight = false;
    flushPending();
  }, 400);
  window.history.go(-delta);
}

function onPopState() {
  if (mutePops > 0) {
    mutePops -= 1;
    goInFlight = false;
    clearMuteWatchdog();
    flushPending();
    return;
  }

  const stateDepth = depthFromHistoryState(window.history.state);
  if (stateDepth > depth) {
    // Browser Forward — adopt depth, never treat as shell Back.
    depth = stateDepth;
    return;
  }

  depth = stateDepth;
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
  clearMuteWatchdog();
  onBrowserBack = null;
  depth = 0;
  mutePops = 0;
  goInFlight = false;
  pendingDesired = null;
}

/** Allow the next popstate to leave the page (confirm leave purchase). */
export function allowMenuShellHistoryLeave() {
  mutePops += 1;
  depth = 0;
  pendingDesired = null;
}

export function setMenuShellHistoryDepth(desiredRaw: number) {
  if (!isBrowser()) return;
  const desired = desiredRaw < 0 ? 0 : Math.floor(desiredRaw);
  if (goInFlight) {
    pendingDesired = desired;
    return;
  }
  applyDepth(desired);
}

export function getMenuShellHistoryDepth() {
  return depth;
}

export function isMenuShellHistorySyncing() {
  return mutePops > 0 || goInFlight;
}
