#!/usr/bin/env node
/** Read-only smoke of production surfaces before/after wa-entry deploy. */
const BASE = process.env.WA_ENTRY_PROD_BASE || 'https://elmenuxfa.com';

async function check(path, opts = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body,
      redirect: 'manual',
    });
    const text = await res.text();
    return {
      path,
      status: res.status,
      ms: Date.now() - started,
      snippet: text.replace(/\s+/g, ' ').slice(0, 120),
    };
  } catch (err) {
    return {
      path,
      status: 0,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const results = {
  asistente: await check('/asistente'),
  menu: await check('/v/pizzas-el-trueno'),
  business: await check('https://business.elmenuxfa.com/'.replace(BASE, '') || '/'),
  directory: await check('/api/comercios/directory?mode=clientes&limit=1'),
  chat: await check('/api/chat/pizzas-el-trueno'),
  waEntry: await check('/api/wa-entry/webhook'),
};

// business host separate
results.businessHost = await (async () => {
  const started = Date.now();
  try {
    const res = await fetch('https://business.elmenuxfa.com/', { redirect: 'manual' });
    return { path: 'business.elmenuxfa.com/', status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { path: 'business.elmenuxfa.com/', status: 0, error: String(err) };
  }
})();

console.log(JSON.stringify(results, null, 2));
const criticalOk =
  results.asistente.status === 200 &&
  results.menu.status === 200 &&
  results.directory.status === 200;
process.exit(criticalOk ? 0 : 2);
