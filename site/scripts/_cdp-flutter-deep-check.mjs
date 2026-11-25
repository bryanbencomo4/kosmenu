/**
 * Deep CDP inspect: console, network, shadow DOM, Flutter loader state.
 */
import WebSocket from 'ws';

const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';
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
  setTimeout(() => j(new Error('open timeout')), 10000);
});

await send('Runtime.enable');
await send('Network.enable');
await send('Console.enable');

const evalRes = await send('Runtime.evaluate', {
  expression: `(() => {
    function dig(root, depth) {
      if (!root || depth > 4) return [];
      const out = [];
      const kids = root.children ? Array.from(root.children) : [];
      for (const el of kids) {
        out.push({
          tag: el.tagName,
          id: el.id || null,
          aria: el.getAttribute('aria-label'),
          childCount: el.children ? el.children.length : 0,
          shadow: !!(el.shadowRoot),
        });
        if (el.shadowRoot) out.push(...dig(el.shadowRoot, depth + 1).map(x => ({...x, via:'shadow'})));
        if (el.tagName === 'FLT-GLASS-PANE' || el.tagName === 'FLUTTER-VIEW' || el.shadowRoot) {
          out.push(...dig(el, depth + 1));
        }
      }
      return out;
    }
    const errors = [];
    // Capture late errors from window
    const ck = window.flutterCanvasKit || window._flutter_web_canvaskit || null;
    return {
      href: location.href,
      flutterLoader: typeof _flutter,
      hasFlutterCanvasKit: !!ck,
      flutterFirstFrameFired: !!window.__elmxSawFirstFrame,
      shellHtml: (document.getElementById('elmx-boot-shell') || {}).outerHTML?.slice(0, 180) || null,
      tree: dig(document.body, 0).slice(0, 80),
      scripts: Array.from(document.scripts).map(s => s.src).filter(Boolean).slice(0, 20),
    };
  })()`,
  returnByValue: true,
});

// Reload with instrumentation
await send('Page.enable');
await send('Runtime.evaluate', {
  expression: `window.addEventListener('flutter-first-frame', () => { window.__elmxSawFirstFrame = true; }); true`,
  returnByValue: true,
});

await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 12000));

const after = await send('Runtime.evaluate', {
  expression: `(() => {
    const shell = document.getElementById('elmx-boot-shell');
    const glass = document.querySelector('flt-glass-pane');
    const all = Array.from(document.querySelectorAll('*')).map(e => e.tagName).reduce((a,t)=>{a[t]=(a[t]||0)+1;return a;},{});
    const canvases = Array.from(document.querySelectorAll('canvas')).map(c => ({w:c.width,h:c.height,aria:c.getAttribute('aria-label')}));
    // shadow canvases
    let shadowCanvas = 0;
    document.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) shadowCanvas += el.shadowRoot.querySelectorAll('canvas').length;
    });
    return {
      firstFrame: !!window.__elmxSawFirstFrame,
      shellHidden: !!(shell && shell.hidden),
      tagCounts: all,
      canvases,
      shadowCanvas,
      glassInnerHTML: glass ? glass.innerHTML.slice(0, 300) : null,
      glassChildElementCount: glass ? glass.childElementCount : -1,
      perfErrors: (window.performance.getEntriesByType('resource') || [])
        .filter(e => e.name.includes('canvaskit') || e.name.includes('main.dart') || e.name.includes('flutter'))
        .map(e => ({name: e.name.split('/').slice(-2).join('/'), dur: Math.round(e.duration), transfer: e.transferSize})),
    };
  })()`,
  returnByValue: true,
});

console.log(
  JSON.stringify(
    {
      beforeReload: evalRes.result?.value,
      afterReload: after.result?.value,
    },
    null,
    2,
  ),
);
ws.close();
