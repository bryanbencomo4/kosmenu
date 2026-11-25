/**
 * Reload Flutter web, collect console/exceptions, wait for paint, screenshot.
 */
import WebSocket from 'ws';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
const outDir = join(process.cwd(), '../docs/audit/acceptance-screenshots');
mkdirSync(outDir, { recursive: true });

const targets = await (await fetch(`${CDP}/json`)).json();
const page =
  targets.find((t) => t.type === 'page' && /5000/.test(t.url || '')) ||
  targets.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) {
  console.error('no page');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const logs = [];

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled') {
    const args = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type);
    logs.push({ type: 'console', level: msg.params.type, args });
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push({
      type: 'exception',
      text: msg.params.exceptionDetails?.text,
      desc: msg.params.exceptionDetails?.exception?.description,
    });
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push({ type: 'log', entry: msg.params.entry });
  }
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
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');

await send('Page.navigate', { url: 'http://127.0.0.1:5000/asistente' });
await new Promise((r) => setTimeout(r, 25000));

const state = await send('Runtime.evaluate', {
  expression: `(() => {
    const glass = document.querySelector('flt-glass-pane');
    const sr = glass && glass.shadowRoot;
    const scene = sr && sr.querySelector('flt-scene-host');
    const sceneChild = scene && scene.firstElementChild;
    const canvasInShadow = sr ? sr.querySelectorAll('canvas').length : 0;
    let flutterErr = null;
    try {
      flutterErr = window._flutter?.loader?.didCreateEngineInitializer ? 'loader-ok' : 'loader';
    } catch (_) {}
    return {
      firstFrame: !!window.__elmxSawFirstFrame,
      shellHidden: !!(document.getElementById('elmx-boot-shell')||{}).hidden,
      sceneTag: sceneChild ? sceneChild.tagName : null,
      sceneChildHTML: sceneChild ? sceneChild.outerHTML.slice(0, 200) : null,
      canvasInShadow,
      glassShadowHTML: sr ? sr.innerHTML.slice(0, 500) : null,
      pTags: Array.from(document.querySelectorAll('body > p')).map(p => p.textContent).slice(0,5),
      localStorageKeys: Object.keys(localStorage).slice(0, 20),
    };
  })()`,
  returnByValue: true,
});

const shot = await send('Page.captureScreenshot', { format: 'png' });
const pngPath = join(outDir, 'flutter-web-asistente-chrome.png');
writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));

console.log(
  JSON.stringify(
    {
      state: state.result?.value,
      logs: logs.slice(0, 40),
      screenshot: pngPath,
    },
    null,
    2,
  ),
);
ws.close();
process.exit(state.result?.value?.canvasInShadow > 0 || state.result?.value?.sceneTag ? 0 : 2);
