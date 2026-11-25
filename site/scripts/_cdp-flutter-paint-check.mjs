/**
 * Probe Flutter web paint state via Chrome remote debugging (port 9222).
 */
import WebSocket from 'ws';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const targets = await (await fetch(`${CDP}/json`)).json();
const page =
  targets.find((t) => t.type === 'page' && /5000/.test(t.url || '')) ||
  targets.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) {
  console.error(JSON.stringify({ error: 'no page', targets }, null, 2));
  process.exit(1);
}

const expression = `(() => {
  const shell = document.getElementById('elmx-boot-shell');
  const fv = document.querySelector('flutter-view');
  const glass = document.querySelector('flt-glass-pane');
  const scene = document.querySelector('flt-scene-host');
  const canvas = document.querySelector('canvas');
  return {
    href: location.href,
    shellHidden: !!(shell && shell.hidden),
    shellAria: shell ? shell.getAttribute('aria-busy') : null,
    hasFlutterView: !!fv,
    hasGlass: !!glass,
    hasScene: !!scene,
    hasCanvas: !!canvas,
    canvasW: canvas ? canvas.width : 0,
    canvasH: canvas ? canvas.height : 0,
    glassKids: glass ? glass.children.length : -1,
    bodyText: ((document.body && document.body.innerText) || '').slice(0, 240),
    title: document.title,
  };
})()`;

const ws = new WebSocket(page.webSocketDebuggerUrl);
const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('cdp timeout')), 20000);
  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }),
    );
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id === 1) {
      clearTimeout(timer);
      resolve(msg.result?.result?.value ?? msg);
      ws.close();
    }
  });
  ws.on('error', reject);
});

console.log(JSON.stringify({ pageUrl: page.url, paint: result }, null, 2));
const ok =
  result?.hasCanvas &&
  result.canvasW > 0 &&
  result.canvasH > 0 &&
  (result.hasScene || result.glassKids > 0);
process.exit(ok ? 0 : 2);
