# Auditoría de requisitos — supervisión humana

**Rama:** `feature/chat-supervision-human`  
**Fecha evidencia:** 2026-11-22  
**Veredicto:** **NO-GO** (migración remota no aplicada; sin smoke Supabase real ni WaSender real)

Leyenda: **DONE** / **PARTIAL** / **BLOCKED** / **N/A**

| # | Requisito | Estado | Evidencia |
| --- | --- | --- | --- |
| 1 | Auditar WaSender/auth/historial/Realtime/RLS | DONE | `docs/chat-supervision-architecture-audit.md` |
| 2 | Reutilizar WaSender (no segundo proveedor) | DONE | `supervision.ts` → `sendWhatsappText` → `enqueue_wasender_message` (RPC existe en prod) |
| 3 | Notificar solo primer mensaje real | DONE | `persistConsumerTurn` + dedupe `chat_supervision:new:{id}`; E2E `no_notify_on_open` |
| 4 | Enlace seguro `/panel/conversaciones/[id]` | DONE | WaSender → `elmenuxfa.com/panel/...` (Next); Flutter inbox opcional; sin secretos en URL |
| 5 | Auth comerciante (sin segundo sistema) | DONE | Bearer Supabase + membership; `/panel/login`; `/api/panel/conversaciones/me` |
| 6 | Bandeja en panel existente | DONE | Next `/panel/conversaciones` + Flutter Configuración → Conversaciones (API + Realtime; prioridad `needs_attention`; propuestas de producto en payload) |
| 7 | Persistencia servidor (no solo browser) | PARTIAL | Código + migración lista; **tablas null en prod/preview** (read-only) |
| 8 | Realtime (no polling 1–5s) | PARTIAL | Cliente `postgres_changes` + broadcast best-effort; publication pendiente de apply |
| 9 | Takeover IA→humano atómico | PARTIAL | RPC `chat_take_conversation` + `chat_user_can_supervise` (fix service-role); E2E memoria OK; **no probado en Postgres remoto** |
| 10 | Respuesta humana → consumidor | PARTIAL | Panel UI + feed session-scoped; E2E 14/14 memoria; falta DB remota |
| 11 | Devolver a Gemini | PARTIAL | Igual que 9–10 |
| 12 | Escalamiento “necesita humano” | DONE | `detectNeedsHuman` + status `needs_attention` + notify hourly dedupe |
| 13 | Privacidad discreta | DONE | Welcome v6 + Vitest |
| 14 | Feature flags independientes | DONE | `CHAT_SUPERVISION_{ENABLED,WASENDER,HUMAN_TAKEOVER,COMMERCE_IDS}` |
| 15 | Piloto solo Trueno | PARTIAL | Allowlist en código/docs; **flags no activados en prod** |
| 16 | Outbox / no bloquear chat si WaSender cae | DONE | cola wasender + retry backoff 1m/5m/15m; chat try/catch |
| 17 | Vitest | DONE | supervisión 11 (flags, backoff, memoria, privacy) |
| 18 | Playwright dual | PARTIAL | 14/14 MEMORY local (último: 2026-11-22); **no** contra tablas reales |
| 19 | Migración reversible | DONE (archivo) / BLOCKED (apply) | static validate 15/15; apply gated; prod readiness **SCHEMA_NOT_READY** |
| 20 | Sin merge/deploy prod sin auth | DONE | solo rama feature + draft PR; sin merge/deploy prod |
| 21 | Criterio principal comerciante | BLOCKED | migración + deploy + flags; readiness: chat_* null, take_rpc false |

## Prerequisites prod (read-only OK)

- `comercio_members` presente  
- `is_comercio_member` / `comercio_has_role` presentes  
- `enqueue_wasender_message` presente  
- `supabase_realtime` publication presente  
- `chat_*` tablas: **ausentes**

## Para desbloquear GO

Autorizar en el chat una de:

```text
I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION
```

luego:

```powershell
$env:CHAT_SUPERVISION_MIGRATE_CONFIRM='I_AUTHORIZE_CHAT_SUPERVISION_MIGRATION'
$env:CHAT_SUPERVISION_MIGRATE_TARGET='prod'
node site/scripts/apply-chat-supervision-migration.mjs
```

Después: activar flags Trueno en el entorno de app + smoke dual sin MEMORY + 1 WaSender real.
