import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
function load(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}
const env = {
  ...load(join(root, '.env.preview.local')),
  ...load(join(root, '.env.preview.keys')),
};
const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
if (!url.includes('gsfxqzvmyzjjgpigrste') || url.includes('qqhbera')) {
  console.error('Refused: not Preview Supabase');
  process.exit(2);
}
const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const a = await sb
  .from('ai_discovery_sessions')
  .delete()
  .eq('session_id', 'discovery-gemini-http-budget-v1');
const b = await sb.from('ai_discovery_usage').delete().eq('period_month', '2099-12');
const month = new Date().toISOString().slice(0, 7);
const usage = await sb
  .from('ai_discovery_usage')
  .select('period_month,requests,tokens_input,tokens_output')
  .eq('period_month', month)
  .maybeSingle();
const chatbot = await sb
  .from('ai_chatbot_usage')
  .select('*', { count: 'exact', head: true });
console.log(
  JSON.stringify(
    {
      ok: !a.error && !b.error,
      budgetSessionDel: a.error?.message || 'ok',
      budgetPeriodDel: b.error?.message || 'ok',
      discoveryMonth: usage.data || null,
      chatbotUsageCount: chatbot.count,
    },
    null,
    2,
  ),
);
