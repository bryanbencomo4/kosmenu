# Auditoría de requisitos — supervisión humana

**Rama:** `feature/chat-supervision-human` @ `9779353`  
**Fecha evidencia:** 2026-11-22  
**Veredicto:** **NO-GO** (migración remota no aplicada; sin smoke Supabase real ni WaSender real). Preflight: `node site/scripts/chat-supervision-preflight.mjs`.

Leyenda: **DONE** / **PARTIAL** / **BLOCKED** / **N/A**

| # | Requisito | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Auditar WaSender/auth/historial/Realtime/RLS | DONE | `docs/chat-supervision-architecture-audit.md` |
| 2 | Reutilizar WaSender (no segundo proveedor) | DONE | `supervision.ts` → `sendWhatsappText` → `enqueue_wasender_message` |
| 3 | Notificar solo primer mensaje real | DONE | `persistConsumerTurn` + dedupe; E2E `no_notify_on_open` |
| 4 | Enlace seguro `/panel/conversaciones/[id]` | DONE | WaSender → Next panel; `safePanelNext`; sin secretos en URL |
| 5 | Auth comerciante (sin segundo sistema) | DONE | Bearer Supabase + membership; `/panel/login?next=` |
| 6 | Bandeja en panel existente | DONE | Next `/panel/conversaciones` + Flutter; prioridad `needs_attention` |
| 7 | Persistencia servidor (no solo browser) | PARTIAL | Código + migración lista; **tablas null en prod** |
| 8 | Realtime (no polling 1–5s) | PARTIAL | broadcast + `postgres_changes` + `REPLICA IDENTITY FULL`; apply remoto pendiente |
| 9 | Takeover IA→humano atómico | PARTIAL | RPC + lock; dual/Vitest MEMORY OK; **no Postgres remoto** |
| 10 | Respuesta humana → consumidor | PARTIAL | Feed HMAC + remint + broadcast hint; dual **21/21** MEMORY |
| 11 | Devolver a Gemini | PARTIAL | Igual que 9–10 |
| 12 | Escalamiento “necesita humano” | DONE | `detectNeedsHuman` + notify hourly + contacto alternativo |
| 13 | Privacidad discreta | DONE | Welcome v6 + Vitest |
| 14 | Feature flags independientes | DONE | `CHAT_SUPERVISION_{ENABLED,WASENDER,HUMAN_TAKEOVER,COMMERCE_IDS}` |
| 15 | Piloto solo Trueno | PARTIAL | Allowlist en código; **flags no activados en prod** |
| 16 | Outbox / no bloquear chat si WaSender cae | DONE | cola + retry backoff; chat try/catch |
| 17 | Vitest | DONE | **20** passed (helpers, feed token, safePanelNext, memoria) |
| 18 | Playwright dual | PARTIAL | MEMORY local **21/21**; **no** contra tablas reales |
| 19 | Migración reversible | DONE (archivo) / BLOCKED (apply) | static validate **19/19**; prod **SCHEMA_NOT_READY** |
| 20 | Sin merge/deploy prod sin auth | DONE | draft PR #1; Site CI success; sin merge/deploy prod |
| 21 | Criterio principal comerciante | BLOCKED | migración + deploy + flags + smoke real |

## Prerequisites prod (read-only OK)

- `comercio_members` presente  
- `is_comercio_member` / `comercio_has_role` presentes  
- `enqueue_wasender_message` presente  
- `supabase_realtime` publication presente  
- `chat_*` tablas: **ausentes**  
- Trueno `supervision_whatsapp`: **MISSING**

## Para desbloquear GO

Autorizar en el chat:

```text
I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION
```

luego:

```powershell
$env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
$env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
node site/scripts/apply-chat-supervision-migration.mjs
```

Después: deploy/merge + flags Trueno + `I_AUTHORIZE_TRUENO_SUPERVISION_WHATSAPP` + smoke dual **sin** MEMORY.
