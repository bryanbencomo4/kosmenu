/**
 * Master Gemini Preview smoke — ≤10 billable HTTP (counted across turns + retries).
 * Synthetic digits only. Does not persist real pilot phone data.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { loadWaMasterConfig } from '../app/api/wa-master/_lib/config';
import type { WaMasterDiscoveryExecute } from '../app/api/wa-master/_lib/discovery-bridge';
import { resolveWaMasterIdentity } from '../app/api/wa-master/_lib/identity';
import { createEmptyMemory } from '../app/api/wa-master/_lib/memory';
import { runWaMasterOrchestrator } from '../app/api/wa-master/_lib/orchestrator';
import {
  createMemoryWaMasterQuotaStore,
  waMasterQuotaMonth,
} from '../app/api/wa-master/_lib/quota';

/** Local mock — avoids server-only Discovery import outside Next runtime. */
const mockDiscovery: WaMasterDiscoveryExecute = async (name, args) => {
  if (name === 'search_restaurants') {
    return {
      ok: true,
      tool: name,
      restaurants: [
        {
          id: 'r1',
          slug: 'burger-lab-demo',
          nombre: 'Burger Lab Demo',
          menuUrl: 'https://elmenuxfa.com/v/burger-lab-demo',
          isOpen: true,
          openLabel: 'Abierto',
        },
        {
          id: 'r2',
          slug: 'casa-burger-demo',
          nombre: 'Casa Burger Demo',
          menuUrl: 'https://elmenuxfa.com/v/casa-burger-demo',
          isOpen: true,
          openLabel: 'Abierto',
        },
      ],
      text: `query=${String(args.query || '')}`,
    };
  }
  if (name === 'prepare_restaurant_links') {
    const slug = String(args.slug || 'x');
    return {
      ok: true,
      tool: name,
      menuUrl: `https://elmenuxfa.com/v/${slug}`,
      restaurant: {
        id: slug,
        slug,
        nombre: slug,
        menuUrl: `https://elmenuxfa.com/v/${slug}`,
      },
    };
  }
  return { ok: false, tool: name, error: 'unknown_tool' };
};

const MAX_HTTP = Number(process.env.WA_MASTER_SMOKE_MAX_HTTP || 10);
const FROM = '584149999001'; // synthetic — not the prod pilot number

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnvLocal();

let httpBudget = 0;
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('generativelanguage.googleapis.com')) {
    httpBudget += 1;
    if (httpBudget > MAX_HTTP) {
      throw new Error(`smoke_budget_exceeded:${httpBudget}>${MAX_HTTP}`);
    }
    console.log(`[smoke] gemini HTTP #${httpBudget}/${MAX_HTTP}`);
  }
  return originalFetch(input, init);
}) as typeof fetch;

async function main() {
  if (!(process.env.GEMINI_API_KEY || '').trim()) {
    console.error('Refused: GEMINI_API_KEY missing');
    process.exit(1);
  }

  const config = loadWaMasterConfig({
    PLATFORM_WA_MASTER: '1',
    PLATFORM_WA_MASTER_ALLOW_GEMINI: '1',
    PLATFORM_WA_MASTER_SIMULATE: '0',
    PLATFORM_WA_MASTER_MAX_MONTHLY_REQUESTS: String(MAX_HTTP),
    PLATFORM_WA_MASTER_MAX_GEMINI_HTTP_PER_TURN: '2',
  } as unknown as NodeJS.ProcessEnv);

  const quota = createMemoryWaMasterQuotaStore();
  const identity = resolveWaMasterIdentity({ fromDigits: FROM, catalog: [] });
  let memory = createEmptyMemory(FROM, Date.now(), 86400000 * 7);
  const turns = [
    'Hola, quiero información',
    'Quiero pedir hamburguesas en Caracas',
  ];

  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < turns.length; i += 1) {
    if (httpBudget >= MAX_HTTP) break;
    const text = turns[i];
    const out = await runWaMasterOrchestrator(
      {
        fromDigits: FROM,
        text,
        messageId: `smoke_${i}_${Date.now()}`,
        nowMs: Date.now(),
        identity,
        memory,
        forceDeterministic: false,
      },
      config,
      {
        quota,
        forceSimulateAgent: false,
        executeDiscovery: mockDiscovery,
        discoveryCtx: { pageSize: 3, region: 'Caracas' },
        maxMonthlyGeminiRequests: MAX_HTTP,
      },
    );
    memory = out.memory;
    results.push({
      text,
      mode: out.mode,
      specialist: out.specialist,
      reply: (out.replies[0] || '').slice(0, 220),
      tools: out.toolsUsed,
      httpSoFar: httpBudget,
    });
    console.log(JSON.stringify(results[results.length - 1], null, 2));
  }

  const snap = await quota.snapshot(waMasterQuotaMonth());
  const summary = {
    ok: httpBudget <= MAX_HTTP && results.some((r) => r.mode === 'gemini'),
    geminiHttpCalls: httpBudget,
    maxHttp: MAX_HTTP,
    quotaRequests: snap.requests,
    tokensInput: snap.tokensInput,
    tokensOutput: snap.tokensOutput,
    turns: results.length,
    modes: results.map((r) => r.mode),
  };
  console.log('SUMMARY', JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
