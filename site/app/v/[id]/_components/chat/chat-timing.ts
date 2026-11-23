/**
 * Human-feel timing for assistant replies.
 * Keeps the "escribiendo…" indicator on screen long enough that fast Gemini
 * (or local catalog) answers don't feel robotic.
 */

export function sleep(ms: number): Promise<void> {
  const n = Math.max(0, Math.floor(ms));
  if (n <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, n);
  });
}

/** Small jitter so consecutive turns don't share the exact same pause. */
function jitter(spanMs: number): number {
  return Math.floor(Math.random() * Math.max(0, spanMs));
}

/**
 * Minimum time the typing indicator should stay visible for a reply of
 * roughly `replyLen` characters (clamped). Includes a short "reading" beat.
 */
export function humanTypingMinMs(replyLen: number): number {
  const len = Math.max(0, Math.min(220, Math.floor(replyLen || 0)));
  // ~35–45 WPM reading + typing feel; never under ~1s or over ~2.8s.
  return Math.min(2800, 950 + len * 11 + jitter(280));
}

/** Pause before firing a local (no-network) catalog reply. */
export function humanLocalReplyMs(): number {
  return 700 + jitter(450);
}

/** Short "read the message" beat before the network request starts. */
export function humanReadBeatMs(): number {
  return 320 + jitter(280);
}
