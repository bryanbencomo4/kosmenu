# Discovery Paso C — autorización de migración (NO ejecutada)

**Fecha:** 2026-11-23  
**SQL:** `supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql`  
**Destino solicitado:** producción `qqhberaayhohxlbbhdyi` (`kosmenú`)  
**Gemini durante/después de esta migración:** permanece **OFF**

---

## Preflight de destino (read-only)

| Check | Resultado |
| --- | --- |
| Project ref | `qqhberaayhohxlbbhdyi` (production) |
| DB | `postgres` |
| `ai_discovery_sessions` / `ai_discovery_usage` | **ausentes** — migración aplicable |
| `reserve_ai_discovery_quota` | **0** funciones — crear |
| `ai_chatbot_usage` | presente (no se modifica) |
| `pedidos` / `chat_conversations` | presentes (no se tocan) |
| Conflictos de nombre | Ninguno (`ai_discovery_*` libre) |
| Preview previo | `gsfxqzvmyzjjgpigrste` — SQL ya validado + concurrencia OK |

## Permisos del SQL

- Tablas RLS ON + revoke anon/authenticated
- RPC `SECURITY DEFINER` solo `service_role`
- No GRANT a `anon` / `authenticated`
- Kill switch DB: `app.discovery_assistant_kill`

## Conflictos

- No `ALTER` de `pedidos`, comercios, supervisión, `ai_chatbot_*`
- `create table if not exists` / `create or replace` solo discovery
- Riesgo residual: operador debe usar **`--project-ref qqhberaayhohxlbbhdyi`** (nunca Preview por error)

## Respaldo / recuperación

Antes de aplicar (recomendado):

1. Snapshot / backup automático de Supabase Pro (punto en el tiempo).
2. Anotar `ai_chatbot_usage` row count del mes actual (aislamiento post-apply).
3. Plan de rollback: **no drop** de emergencia; kill app flags + opcional `app.discovery_assistant_kill=on`. Las tablas son aditivas.

## Comando preparado (NO ejecutar sin tu OK)

```bash
# Gemini must stay OFF. Confirm flags first:
# DISCOVERY_ASSISTANT_ALLOW_GEMINI=0
# DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=0  (until smoke)

npx supabase db query --project-ref qqhberaayhohxlbbhdyi --yes \
  -f supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql
```

Post-apply smoke (service_role): reserve + session/monthly caps + concurrency + anon denied + **0** writes en `ai_chatbot_usage`.

Luego (sin Gemini):  
`DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres` + caps piloto + `POSTGRES_QUOTA_READY=1` + `ALLOW_PRODUCTION=1` + **`ALLOW_GEMINI=0`**.

## Flags actuales en Vercel Production (Paso B)

| Flag | Esperado ahora |
| --- | --- |
| `NEXT_PUBLIC_DISCOVERY_ASSISTANT` | `1` |
| `DISCOVERY_ASSISTANT_ENABLED` | `1` |
| `DISCOVERY_ASSISTANT_ALLOW_GEMINI` | **`0`** |
| `DISCOVERY_ASSISTANT_SIMULATE` | `0` |
| `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION` | `0` |
| `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY` | `0` |

## Veredicto preflight migración

**Listo para tu autorización expresa.**  
**No ejecutada en este turno.**

---

## Código de consumo (este mismo cierre)

Corregido en rama:

- Acumula `usageMetadata` en todas las rondas Gemini (incl. tools)
- `recordDiscoveryTokens` → `increment_ai_discovery_tokens` (postgres) / filesystem
- Idempotencia por `requestId` (in-process)
- Reserva fallida → **no** Gemini
- Presupuesto piloto default: 15 / 200 / 500 000 / 2 tool rounds

Post-token accounting **no** es techo exacto de gasto; el hard stop sigue siendo `reserve` de requests (+ tokens ya acumulados en fila al reservar).
