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
  console.error('Refused: not Preview');
  process.exit(2);
}
const sb = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const month = new Date().toISOString().slice(0, 7);
const discovery = await sb
  .from('ai_discovery_usage')
  .select('*')
  .eq('period_month', month);
const budget = await sb
  .from('ai_discovery_sessions')
  .select('*')
  .eq('session_id', 'discovery-gemini-http-budget-v1')
  .maybeSingle();
const budgetPeriod = await sb
  .from('ai_discovery_usage')
  .select('*')
  .eq('period_month', '2099-12')
  .maybeSingle();
const chatbot = await sb
  .from('ai_chatbot_usage')
  .select('period_month,requests,tokens_input,tokens_output,agent');
console.log(
  JSON.stringify(
    {
      host: new URL(url).host,
      month,
      discovery: discovery.data,
      discoveryErr: discovery.error?.message || null,
      httpBudgetSession: budget.data,
      httpBudgetPeriod: budgetPeriod.data,
      chatbot: chatbot.data,
      chatbotErr: chatbot.error?.message || null,
    },
    null,
    2,
  ),
);
