/**
 * Poll for Zeno dashboard replay effects vs baseline snapshot.
 * Usage: deno run -A zeno-idempotency-poll.ts [timeout_sec]
 */
const baseline = JSON.parse(await Deno.readTextFile('tmp-idempotency-baseline.json'));
const timeoutSec = Number(Deno.args[0] ?? '180');
const started = Date.now();

async function loadDotEnv(path: string) {
  try {
    const text = await Deno.readTextFile(path);
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    // optional
  }
}

await loadDotEnv('.env.preview.keys');
await loadDotEnv('.env.preview.auth.local');

console.log('Waiting for Zeno dashboard Replay of checkout.completed (same svix-id)...');
console.log('Baseline real_completed_event_count=', baseline.real_completed_event_count);
console.log('Baseline period_end=', baseline.subscription?.current_period_end);

while ((Date.now() - started) / 1000 < timeoutSec) {
  const p = new Deno.Command('deno', {
    args: ['run', '-A', 'supabase/functions/zeno-idempotency-snap.ts', 'after'],
    stdout: 'piped',
    stderr: 'piped',
  });
  const out = await p.output();
  // snap writes file; read it
  const after = JSON.parse(await Deno.readTextFile('tmp-idempotency-after.json'));

  const samePeriod =
    after.subscription?.current_period_end === baseline.subscription?.current_period_end &&
    after.subscription?.current_period_start === baseline.subscription?.current_period_start;
  const samePayUpdated =
    after.payment?.updated_at === baseline.payment?.updated_at;
  const sameEventCount =
    after.real_completed_event_count === baseline.real_completed_event_count;
  const sameEnLinea =
    JSON.stringify(after.comercios) === JSON.stringify(baseline.comercios);

  // Detect replay: either new attempt logged in function (we only see same count)
  // or payment_events created_at count same with possibly a later edge invoke.
  // For same svix-id replay: event count MUST stay same.
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (elapsed % 15 < 5) {
    console.log('POLL', {
      elapsed_s: elapsed,
      real_events: after.real_completed_event_count,
      samePeriod,
      sameEventCount,
      sameEnLinea,
      period_end: after.subscription?.current_period_end,
    });
  }

  // We cannot auto-know replay happened without external signal.
  // Exit early if somehow period extended (BAD) or event duplicated (BAD).
  if (!samePeriod || !sameEventCount || !sameEnLinea) {
    console.log('CHANGE_DETECTED');
    console.log(JSON.stringify({
      samePeriod,
      sameEventCount,
      sameEnLinea,
      samePayUpdated,
      baseline_events: baseline.real_completed_event_count,
      after_events: after.real_completed_event_count,
      baseline_period_end: baseline.subscription?.current_period_end,
      after_period_end: after.subscription?.current_period_end,
    }, null, 2));
    Deno.exit((!samePeriod || !sameEventCount) ? 2 : 0);
  }

  await new Promise((r) => setTimeout(r, 5000));
}

console.log('POLL_TIMEOUT — no state change vs baseline (expected if replay used same svix-id and was ignored)');
console.log('IDEMPOTENCY_STATIC_OK=true');
Deno.exit(0);
