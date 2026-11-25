/**
 * Click QA commerce chip in Flutter canvas via CDP + screenshot evidence.
 */
import WebSocket from 'ws';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const SHOTS = join(process.cwd(), '../docs/audit/acceptance-screenshots');
mkdirSync(SHOTS, { recursive: true });

const targets = await (await fetch(`${CDP}/json`)).json();
const page =
  targets.find((t) => t.type === 'page' && /5000/.test(t.url || '')) ||
  targets.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('no page');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
await new Promise((r, j) => {
  ws.on('open', r);
  ws.on('error', j);
});

await send('Runtime.enable');
await send('Page.enable');
await send('Input.setIgnoreInputEvents', { ignore: false });

await send('Page.navigate', { url: 'http://127.0.0.1:5000/asistente' });
await new Promise((r) => setTimeout(r, 14000));

const metrics = await send('Page.getLayoutMetrics');
const css = metrics.cssLayoutViewport || metrics.layoutViewport;
const width = css.clientWidth || 929;
const height = css.clientHeight || 917;

// Chips sit near bottom-left above the composer (from prior screenshots).
// Click the second chip area (pizzas el trueno) ~ right of first chip.
const x1 = Math.round(width * 0.28);
const yChip = Math.round(height * 0.88);
const x2 = Math.round(width * 0.62);

async function click(x, y) {
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

await click(x2, yChip);
await new Promise((r) => setTimeout(r, 4000));

// Focus composer (bottom center) and type a harmless query
const yInput = Math.round(height * 0.96);
await click(Math.round(width * 0.4), yInput);
await new Promise((r) => setTimeout(r, 400));
const msg = 'ver menú';
for (const ch of msg) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', text: ch });
}
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13,
});
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'Enter',
  code: 'Enter',
  windowsVirtualKeyCode: 13,
});
await new Promise((r) => setTimeout(r, 6000));

const shot = await send('Page.captureScreenshot', { format: 'png' });
const path = join(SHOTS, 'flutter-asistente-chip-click.png');
writeFileSync(path, Buffer.from(shot.data, 'base64'));

const paint = await send('Runtime.evaluate', {
  expression: `(() => {
    const glass = document.querySelector('flt-glass-pane');
    const sr = glass && glass.shadowRoot;
    const canvas = sr && sr.querySelector('canvas');
    return { hasCanvas: !!canvas, w: canvas?.width, h: canvas?.height };
  })()`,
  returnByValue: true,
});

console.log(
  JSON.stringify(
    {
      click: { x2, yChip, width, height },
      paint: paint.result?.value,
      screenshot: path,
    },
    null,
    2,
  ),
);
ws.close();
