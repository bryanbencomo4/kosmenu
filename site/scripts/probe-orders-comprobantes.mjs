/**
 * Staging probe: orders + comprobantes with hard timeouts (no hang).
 * Does not mutate productive comprobante logic.
 */
const BASE = process.env.STAGING_BASE_URL || 'http://127.0.0.1:3001';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 8000);

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: true, status: res.status, body, timedOut: false };
  } catch (e) {
    const timedOut =
      e?.name === 'AbortError' || /aborted|timeout/i.test(String(e));
    return {
      ok: false,
      status: 0,
      body: String(e?.message || e).slice(0, 200),
      timedOut,
    };
  } finally {
    clearTimeout(t);
  }
}

const orders = await fetchWithTimeout(`${BASE}/api/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});

// Intentionally invalid JSON content-type for form endpoint — must fail fast,
// never hang waiting for multipart.
const comprobantes = await fetchWithTimeout(`${BASE}/api/orders/comprobantes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});

const report = {
  timeoutMs: TIMEOUT_MS,
  orders,
  comprobantes,
  ordersBlocked:
    orders.status === 403 &&
    String(orders.body?.error || '').includes('orders_blocked'),
  comprobantesDidNotHang: !comprobantes.timedOut,
};

console.log(JSON.stringify(report, null, 2));
process.exit(
  report.ordersBlocked && report.comprobantesDidNotHang ? 0 : 1,
);
