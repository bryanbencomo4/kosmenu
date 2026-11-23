/**
 * Preview-only smoke for ai_discovery_request_ledger idempotency.
 * NEVER targets production (qqhberaayhohxlbbhdyi). No Gemini HTTP calls.
 *
 *   node site/scripts/discovery-ledger-preview-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PREVIEW_REF = 'gsfxqzvmyzjjgpigrste';
const FORBIDDEN_REF = 'qqhberaayhohxlbbhdyi';
const PERIOD = '2099-11'; // synthetic — never ops month

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
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

const root = resolve(import.meta.dirname, '../..');
loadEnvFile(resolve(root, '.env.preview.local'));
loadEnvFile(resolve(root, '.env.preview.keys'));

const url =
  process.env.SUPABASE_PREVIEW_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const report = {
  target: url ? new URL(url).host : null,
  previewRef: PREVIEW_REF,
  ok: false,
  steps: [],
  errors: [],
};

function assertPreview(targetUrl) {
  if (!targetUrl.includes(PREVIEW_REF)) {
    throw new Error(`Refused: not Preview (${PREVIEW_REF}): ${targetUrl}`);
  }
  if (targetUrl.includes(FORBIDDEN_REF)) {
    throw new Error(`Refused: production ref ${FORBIDDEN_REF}`);
  }
}

function step(name, ok, detail = {}) {
  report.steps.push({ name, ok, ...detail });
  if (!ok) report.errors.push(name);
}

function rid(suffix) {
  // Must match ^r_[a-zA-Z0-9]{8,40}$
  return `r_ledger${suffix}`.slice(0, 42);
}

async function cleanup(service) {
  await service.from('ai_discovery_request_ledger').delete().like('request_id', 'r_ledger%');
  await service.from('ai_discovery_sessions').delete().like('session_id', 'ledger-smoke-%');
  await service.from('ai_discovery_usage').delete().eq('period_month', PERIOD);
}

async function main() {
  try {
    assertPreview(url);
    if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anon = anonKey
      ? createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

    await cleanup(service);

    const session = `ledger-smoke-${Date.now()}`;
    const reqA = rid(`A${Date.now().toString(36)}`);

    // 1) First reserve
    {
      const { data, error } = await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: session,
        p_max_session_requests: 15,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: 500000,
        p_model: 'ledger-smoke',
        p_request_id: reqA,
      });
      step('reserve_first', !error && data?.session?.requests === 1 && data?.idempotent === false, {
        error: error?.message,
        requests: data?.session?.requests,
        idempotent: data?.idempotent,
      });
    }

    // 2) Same request_id again — no counter bump
    {
      const { data, error } = await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: session,
        p_max_session_requests: 15,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: 500000,
        p_model: 'ledger-smoke',
        p_request_id: reqA,
      });
      const { data: usage } = await service
        .from('ai_discovery_usage')
        .select('requests')
        .eq('period_month', PERIOD)
        .maybeSingle();
      step(
        'reserve_idempotent_same_id',
        !error && data?.idempotent === true && usage?.requests === 1,
        {
          error: error?.message,
          idempotent: data?.idempotent,
          monthRequests: usage?.requests,
          sessionRequests: data?.session?.requests,
        },
      );
    }

    // 3) Concurrency 20 × same request_id
    {
      const reqC = rid(`C${Date.now().toString(36)}`);
      const sid = `${session}-conc`;
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.rpc('reserve_ai_discovery_quota', {
            p_session_id: sid,
            p_max_session_requests: 50,
            p_period_month: PERIOD,
            p_max_monthly_requests: 200,
            p_max_monthly_tokens: 500000,
            p_model: 'ledger-smoke',
            p_request_id: reqC,
          }),
        ),
      );
      const okCount = results.filter((r) => !r.error).length;
      const { data: sess } = await service
        .from('ai_discovery_sessions')
        .select('requests')
        .eq('session_id', sid)
        .maybeSingle();
      const { data: usage } = await service
        .from('ai_discovery_usage')
        .select('requests')
        .eq('period_month', PERIOD)
        .maybeSingle();
      // Exactly +1 session request for this concurrent id (prior tests may have +1 on other session)
      step('reserve_concurrency_same_id', okCount === 20 && sess?.requests === 1, {
        okCount,
        sessionRequests: sess?.requests,
        monthRequests: usage?.requests,
      });
    }

    // 4) Independent request ids
    {
      const before = (
        await service
          .from('ai_discovery_usage')
          .select('requests')
          .eq('period_month', PERIOD)
          .maybeSingle()
      ).data?.requests;
      const r1 = rid(`D1${Date.now().toString(36)}`);
      const r2 = rid(`D2${Date.now().toString(36)}`);
      await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${session}-ind`,
        p_max_session_requests: 50,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: 500000,
        p_model: 'ledger-smoke',
        p_request_id: r1,
      });
      await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${session}-ind`,
        p_max_session_requests: 50,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: 500000,
        p_model: 'ledger-smoke',
        p_request_id: r2,
      });
      const after = (
        await service
          .from('ai_discovery_usage')
          .select('requests')
          .eq('period_month', PERIOD)
          .maybeSingle()
      ).data?.requests;
      step('reserve_independent_ids', after === before + 2, { before, after });
    }

    // 5) Token record after valid reserve
    {
      const reqT = rid(`T${Date.now().toString(36)}`);
      await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${session}-tok`,
        p_max_session_requests: 50,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: 500000,
        p_model: 'ledger-smoke',
        p_request_id: reqT,
      });
      const before = (
        await service
          .from('ai_discovery_usage')
          .select('tokens_input,tokens_output')
          .eq('period_month', PERIOD)
          .maybeSingle()
      ).data;
      const { data, error } = await service.rpc('increment_ai_discovery_tokens', {
        p_period_month: PERIOD,
        p_tokens_input: 100,
        p_tokens_output: 40,
        p_estimated_cost: 0.0001,
        p_model: 'ledger-smoke',
        p_request_id: reqT,
      });
      step(
        'tokens_after_reserve',
        !error &&
          Number(data?.tokens_input) === Number(before?.tokens_input || 0) + 100 &&
          Number(data?.tokens_output) === Number(before?.tokens_output || 0) + 40,
        { error: error?.message, before, after: data },
      );

      // 6) Duplicate token record
      const mid = (
        await service
          .from('ai_discovery_usage')
          .select('tokens_input,tokens_output')
          .eq('period_month', PERIOD)
          .maybeSingle()
      ).data;
      const dup = await service.rpc('increment_ai_discovery_tokens', {
        p_period_month: PERIOD,
        p_tokens_input: 100,
        p_tokens_output: 40,
        p_estimated_cost: 0.0001,
        p_model: 'ledger-smoke',
        p_request_id: reqT,
      });
      const afterDup = (
        await service
          .from('ai_discovery_usage')
          .select('tokens_input,tokens_output')
          .eq('period_month', PERIOD)
          .maybeSingle()
      ).data;
      step(
        'tokens_idempotent_duplicate',
        !dup.error &&
          Number(afterDup?.tokens_input) === Number(mid?.tokens_input) &&
          Number(afterDup?.tokens_output) === Number(mid?.tokens_output),
        { error: dup.error?.message, mid, afterDup },
      );
    }

    // 7) Tokens without prior reserve
    {
      const reqX = rid(`X${Date.now().toString(36)}`);
      const { error } = await service.rpc('increment_ai_discovery_tokens', {
        p_period_month: PERIOD,
        p_tokens_input: 10,
        p_tokens_output: 5,
        p_estimated_cost: null,
        p_model: 'ledger-smoke',
        p_request_id: reqX,
      });
      step('tokens_without_reserve', /not reserved/i.test(error?.message || ''), {
        error: error?.message,
      });
    }

    // 8) Invalid request id (PG validation)
    {
      const { error } = await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${session}-bad`,
        p_max_session_requests: 50,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: null,
        p_model: 'ledger-smoke',
        p_request_id: 'not-a-valid-id',
      });
      step('invalid_request_id', /invalid discovery request/i.test(error?.message || ''), {
        error: error?.message,
      });
    }

    // 9) Quota exhaustion still works with ledger
    {
      const month = '2099-10';
      await service.from('ai_discovery_usage').delete().eq('period_month', month);
      await service.from('ai_discovery_request_ledger').delete().like('request_id', 'r_ledgerQ%');
      for (let i = 0; i < 2; i++) {
        await service.rpc('reserve_ai_discovery_quota', {
          p_session_id: `${session}-q${i}`,
          p_max_session_requests: 50,
          p_period_month: month,
          p_max_monthly_requests: 2,
          p_max_monthly_tokens: null,
          p_model: 'ledger-smoke',
          p_request_id: rid(`Q${i}${Date.now().toString(36)}`),
        });
      }
      const { error } = await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${session}-q-over`,
        p_max_session_requests: 50,
        p_period_month: month,
        p_max_monthly_requests: 2,
        p_max_monthly_tokens: null,
        p_model: 'ledger-smoke',
        p_request_id: rid(`Qover${Date.now().toString(36)}`),
      });
      step('monthly_cap_with_ledger', /monthly request limit/i.test(error?.message || ''), {
        error: error?.message,
      });
      await service.from('ai_discovery_usage').delete().eq('period_month', month);
    }

    // 10) Anon denied
    if (anon) {
      const { error } = await anon.rpc('reserve_ai_discovery_quota', {
        p_session_id: `${session}-anon`,
        p_max_session_requests: 5,
        p_period_month: PERIOD,
        p_max_monthly_requests: 5,
        p_max_monthly_tokens: null,
        p_model: 'ledger-smoke',
        p_request_id: rid(`Anon${Date.now().toString(36)}`),
      });
      step('anon_denied', Boolean(error), { error: error?.message });

      const { error: tErr } = await anon.from('ai_discovery_request_ledger').select('*').limit(1);
      step('anon_table_denied', Boolean(tErr), { error: tErr?.message });
    } else {
      step('anon_denied', false, { error: 'no_anon_key' });
      step('anon_table_denied', false, { error: 'no_anon_key' });
    }

    // 11) Partial failure recovery: reserve then failed token must not leave double reserve
    {
      const reqP = rid(`P${Date.now().toString(36)}`);
      const sid = `${session}-partial`;
      await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: sid,
        p_max_session_requests: 50,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: null,
        p_model: 'ledger-smoke',
        p_request_id: reqP,
      });
      const before = (
        await service.from('ai_discovery_sessions').select('requests').eq('session_id', sid).maybeSingle()
      ).data?.requests;
      // Simulate retry after partial (token never recorded): same request_id reserve is idempotent
      await service.rpc('reserve_ai_discovery_quota', {
        p_session_id: sid,
        p_max_session_requests: 50,
        p_period_month: PERIOD,
        p_max_monthly_requests: 200,
        p_max_monthly_tokens: null,
        p_model: 'ledger-smoke',
        p_request_id: reqP,
      });
      const after = (
        await service.from('ai_discovery_sessions').select('requests').eq('session_id', sid).maybeSingle()
      ).data?.requests;
      step('partial_failure_no_double_reserve', before === 1 && after === 1, {
        before,
        after,
      });
    }

    // Chatbot isolation — table should not exist or stay untouched on Preview
    {
      const { error } = await service.from('ai_chatbot_usage').select('*').limit(1);
      step(
        'chatbot_untouched',
        Boolean(error) && /could not find|does not exist|schema cache/i.test(error.message || ''),
        { error: error?.message },
      );
    }

    await cleanup(service);
    report.ok = report.errors.length === 0;
  } catch (err) {
    report.errors.push(String(err?.message || err));
    report.ok = false;
  }

  const out = resolve(root, 'docs/discovery-ledger-preview-smoke.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
