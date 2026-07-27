/**
 * Re-deliver the stored real checkout.completed with the SAME svix-id.
 * Uses ZENO_WEBHOOK_SECRET from env (must match preview Edge secret).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Webhook } from 'https://esm.sh/svix@1.37.0';

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
await loadDotEnv('supabase/functions/.env.zeno.preview.local');

const secret = Deno.env.get('ZENO_WEBHOOK_SECRET')?.trim() ?? '';
if (!secret) {
  console.log(JSON.stringify({ ok: false, reason: 'no_local_webhook_secret' }));
  Deno.exit(2);
}

const admin = createClient(
  'https://gsfxqzvmyzjjgpigrste.supabase.co',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const { data: ev } = await admin
  .from('payment_events')
  .select('provider_event_id, payload, processed')
  .eq('provider', 'zeno')
  .eq('event_type', 'checkout.completed')
  .like('provider_event_id', 'msg_3H66%')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!ev) {
  console.log(JSON.stringify({ ok: false, reason: 'real_event_not_found' }));
  Deno.exit(2);
}

const baseline = JSON.parse(await Deno.readTextFile('tmp-idempotency-baseline.json'));

const rawBody = JSON.stringify(ev.payload);
const wh = new Webhook(secret);
const msgId = String(ev.provider_event_id);
const ts = Math.floor(Date.now() / 1000);
const signature = (wh as unknown as { sign: (id: string, t: Date, body: string) => string })
  .sign(msgId, new Date(ts * 1000), rawBody);

const res = await fetch(
  'https://gsfxqzvmyzjjgpigrste.supabase.co/functions/v1/zeno-webhook',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'svix-id': msgId,
      'svix-timestamp': String(ts),
      'svix-signature': signature,
    },
    body: rawBody,
  },
);
const text = await res.text();
let json: Record<string, unknown> = {};
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text.slice(0, 200) };
}

// After snap
const p = new Deno.Command('deno', {
  args: ['run', '-A', 'supabase/functions/zeno-idempotency-snap.ts', 'after_replay'],
  stdout: 'null',
  stderr: 'null',
});
await p.output();
const after = JSON.parse(await Deno.readTextFile('tmp-idempotency-after_replay.json'));

const mask = (s: string) => `${s.slice(0, 12)}…`;
console.log(
  JSON.stringify(
    {
      http: res.status,
      body: {
        ok: json.ok ?? null,
        duplicate: json.duplicate ?? null,
        error: json.error ?? null,
      },
      svix: mask(msgId),
      event_was_processed_before: ev.processed === true,
      same_event_count:
        after.real_completed_event_count === baseline.real_completed_event_count,
      period_unchanged:
        after.subscription?.current_period_end ===
          baseline.subscription?.current_period_end &&
        after.subscription?.current_period_start ===
          baseline.subscription?.current_period_start,
      comercios_unchanged:
        JSON.stringify(after.comercios) === JSON.stringify(baseline.comercios),
      signature_valid: res.status !== 400,
    },
    null,
    2,
  ),
);

if (res.status === 400) Deno.exit(3); // secret mismatch — need dashboard replay
if (res.status === 200 && (json.duplicate === true || json.ok === true)) Deno.exit(0);
Deno.exit(1);
