/**
 * Read-only readiness probe for chat supervision tables / Trueno notify target.
 * Does NOT apply migrations. Uses supabase CLI if available via shell caller,
 * or prints the SQL to run manually.
 *
 * Usage: node scripts/chat-supervision-remote-readiness.mjs
 */
const TRUENO = '0aa8c53b-07f1-446e-8b88-66c2b7ae89ea';

console.log(`
# Chat supervision remote readiness (manual / CI)

Run with supabase CLI (read-only):

  npx supabase db query --remote=<ref> --read-only -o json "select to_regclass('public.chat_conversations') as chat_conversations, to_regclass('public.chat_messages') as chat_messages, to_regclass('public.chat_supervision_events') as events;"

  npx supabase db query --remote=<ref> --read-only -o json "select id, nombre, whatsapp, branding_ia->'config_negocio'->>'supervision_whatsapp' as supervision_whatsapp, branding_ia->'config_negocio'->>'notify_whatsapp' as notify_whatsapp from public.comercios where id = '${TRUENO}';"

Expected before GO:
  - chat_* regclass not null
  - supervision_whatsapp or notify_whatsapp or whatsapp present
  - CHAT_SUPERVISION_* flags on for Trueno only
  - CHAT_SUPERVISION_MEMORY unset
`);
