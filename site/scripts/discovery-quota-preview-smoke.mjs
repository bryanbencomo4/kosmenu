/**
 * Preview-only smoke for ai_discovery_* quota RPCs.
 * NEVER targets production (qqhberaayhohxlbbhdyi).
 *
 *   node site/scripts/discovery-quota-preview-smoke.mjs
 *
 * Expects env (from .env.preview.*):
 *   SUPABASE_PREVIEW_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (optional — anon denial checks)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const FORBIDDEN_REF = 'qqhberaayhohxlbbhdyi';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const root = resolve(import.meta.dirname, '../..');
loadEnvFile(resolve(root, '.env.preview.local'));
loadEnvFile(resolve(root, '.env.preview.keys'));

const url =
  process.env.SUPABASE_PREVIEW_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

const report = {
  target: url,
  previewRef: PREVIEW_REF,
  ok: false,
  steps: [],
  errors: [],
};

function assertPreview(targetUrl) {
  if (!targetUrl.includes(PREVIEW_REF)) {
    throw new Error(`Refused: URL is not Preview (${PREVIEW_REF}): ${targetUrl}`);
  }
  if (targetUrl.includes(FORBIDDEN_REF)) {
    throw new Error(`Refused: production ref ${FORBIDDEN_REF}`);
  }
}

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  if (!ok) report.errors.push(name);
}

async function main() {
  try {
    assertPreview(url);
    if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for Preview');

    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const period = `2099-01`; // synthetic far-future month — never collide with real ops
    const baseSession = `preview-smoke-${Date.now()}`;

    // Cleanup synthetic rows if re-running
    await service.from('ai_discovery_sessions').delete().like('session_id', 'preview-smoke-%');
    await service.from('ai_discovery_usage').delete().eq('period_month', period);

    // 1) Basic reserve
    {
      const { data, error } = await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${baseSession}-a`,
        p_max_session_requests: 5,
        p_period_month: period,
        p_max_monthly_requests: 100,
        p_max_monthly_tokens: 1_000_000,
        p_model: 'smoke-test',
      });
      step('reserve_basic', !error && data?.session?.requests === 1, {
        error: error?.message,
        data,
      });
    }

    // 2) Session exhaustion
    {
      const sid = `${baseSession}-session-cap`;
      let hit = false;
      for (let i = 0; i < 3; i++) {
        const { error } = await service.rpc('reserve_ai_discovery_quota', {
          p_session_id: sid,
          p_max_session_requests: 2,
          p_period_month: period,
          p_max_monthly_requests: 1000,
          p_max_monthly_tokens: null,
          p_model: 'smoke-test',
        });
        if (i < 2 && error) {
          step('session_cap_setup', false, { i, error: error.message });
          break;
        }
        if (i === 2) {
          hit = /session request limit/i.test(error?.message || '');
          step('session_cap', hit, { error: error?.message });
        }
      }
    }

    // 3) Monthly exhaustion
    {
      const month = `2099-02`;
      await service.from('ai_discovery_usage').delete().eq('period_month', month);
      for (let i = 0; i < 2; i++) {
        await service.rpc('reserve_ai_discovery_quota', {
          p_session_id: `${baseSession}-month-${i}`,
          p_max_session_requests: 50,
          p_period_month: month,
          p_max_monthly_requests: 2,
          p_max_monthly_tokens: null,
          p_model: 'smoke-test',
        });
      }
      const { error } = await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${baseSession}-month-overflow`,
        p_max_session_requests: 50,
        p_period_month: month,
        p_max_monthly_requests: 2,
        p_max_monthly_tokens: null,
        p_model: 'smoke-test',
      });
      step('monthly_cap', /monthly request limit/i.test(error?.message || ''), {
        error: error?.message,
      });
      await service.from('ai_discovery_usage').delete().eq('period_month', month);
    }

    // 4) Concurrent reserves — must not exceed monthly cap
    {
      const month = `2099-03`;
      await service.from('ai_discovery_usage').delete().eq('period_month', month);
      const maxMonthly = 5;
      const attempts = 20;
      const results = await Promise.all(
        Array.from({ length: attempts }, (_, i) =>
          service.rpc('reserve_ai_discovery_quota', {
            p_session_id: `${baseSession}-conc-${i}`,
            p_max_session_requests: 50,
            p_period_month: month,
            p_max_monthly_requests: maxMonthly,
            p_max_monthly_tokens: null,
            p_model: 'smoke-test',
          }),
        ),
      );
      const okCount = results.filter((r) => !r.error).length;
      const limitHits = results.filter((r) =>
        /monthly request limit/i.test(r.error?.message || ''),
      ).length;
      const { data: usage } = await service
        .from('ai_discovery_usage')
        .select('requests')
        .eq('agent', 'discovery')
        .eq('period_month', month)
        .maybeSingle();
      const requests = Number(usage?.requests ?? 0);
      step('concurrency_atomic', okCount === maxMonthly && requests === maxMonthly, {
        okCount,
        limitHits,
        requests,
        maxMonthly,
        attempts,
      });
      await service.from('ai_discovery_usage').delete().eq('period_month', month);
    }

    // 5) Anon cannot call RPC / mutate tables
    if (anonKey) {
      const anon = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: rpcErr } = await anon.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${baseSession}-anon`,
        p_max_session_requests: 5,
        p_period_month: period,
        p_max_monthly_requests: 100,
        p_max_monthly_tokens: null,
        p_model: 'smoke-test',
      });
      const { error: insertErr } = await anon.from('ai_discovery_sessions').insert({
        session_id: `${baseSession}-anon-insert`,
        requests: 99,
      });
      const { data: leak, error: selectErr } = await anon
        .from('ai_discovery_usage')
        .select('*')
        .limit(1);
      step('anon_denied', Boolean(rpcErr) && Boolean(insertErr) && (Boolean(selectErr) || !leak?.length), {
        rpcErr: rpcErr?.message,
        insertErr: insertErr?.message,
        selectErr: selectErr?.message,
        leakCount: leak?.length ?? 0,
      });
    } else {
      step('anon_denied', false, { error: 'missing SUPABASE_ANON_KEY' });
    }

    // 6) Isolation: discovery writes must not create ai_chatbot_* rows for this period
    {
      const { count: chatbotCount, error } = await service
        .from('ai_chatbot_usage')
        .select('*', { count: 'exact', head: true })
        .eq('period_month', period);
      // Table may not exist on Preview — that is also isolation OK.
      const missing = /does not exist|schema cache|Could not find/i.test(error?.message || '');
      step('isolation_chatbot_untouched', missing || chatbotCount === 0 || chatbotCount == null, {
        chatbotCount,
        error: error?.message,
        missing,
      });
    }

    // 7) Token increment + kill switch probe (optional DB setting may be unset)
    {
      const { data, error } = await service.rpc('increment_ai_discovery_tokens', {
        p_period_month: period,
        p_tokens_input: 10,
        p_tokens_output: 5,
        p_estimated_cost: 0.0001,
        p_model: 'smoke-test',
      });
      step('increment_tokens', !error && Number(data?.tokens_input) >= 10, {
        error: error?.message,
        data,
      });
    }

    // Cleanup
    await service.from('ai_discovery_sessions').delete().like('session_id', `${baseSession}%`);
    await service.from('ai_discovery_usage').delete().eq('period_month', period);

    report.ok = report.steps.every((s) => s.ok);
  } catch (err) {
    report.errors.push(String(err && err.message ? err.message : err));
    report.ok = false;
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
