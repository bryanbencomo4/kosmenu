# Discovery Paso C — migración de cuotas aplicada en producción

**Fecha:** 2026-11-23  
**Proyecto:** `qqhberaayhohxlbbhdyi` (kosmenú · production)  
**SQL:** `supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql`  
**SHA256:** `27F08E88B09E1320038195719C4FC723E77BB26C3B289FB58300464FC19402B4`  
**Gemini / flags / deploy:** **sin cambios** (Gemini sigue OFF)

---

## Preflight (antes de aplicar)

| Check | Resultado |
| --- | --- |
| Destino | `qqhberaayhohxlbbhdyi` confirmado |
| SQL = Preview | Firmas RPC idénticas a Preview |
| Backup | Physical backup **COMPLETED** `2026-11-23T06:57:37Z` (id `2352776443`); WAL-G enabled |
| Objetos previos | `ai_discovery_*` ausentes; 0 RPC discovery |
| Gemini | `liveGemini=false` (`production_blocked`), `quotaBackend=none` |
| Scope SQL | Solo `ai_discovery_*`; revoke anon/auth; grant service_role |

## Resultado de migración

**Aplicada con éxito** (`--yes` en production).

| Objeto | Estado |
| --- | --- |
| `ai_discovery_sessions` | creado |
| `ai_discovery_usage` | creado |
| `reserve_ai_discovery_quota` | 1 |
| `increment_ai_discovery_tokens` | 1 |
| RLS | ON en ambas tablas |
| Policies | **0** (deny-by-default) |

## Permisos

| Privilege | Valor |
| --- | --- |
| anon → reserve / tokens / INSERT sessions | **false** |
| authenticated → reserve / INSERT | **false** |
| service_role → reserve / tokens | **true** |

## Cuotas / smoke post-apply

| Prueba | Resultado |
| --- | --- |
| Reserve básico | OK (session=1, period requests++) |
| Tope sesión | OK (`discovery session request limit`) |
| Tope mensual | OK (`discovery monthly request limit`) |
| Concurrencia 12→cap 4 | OK (**requests=4** exacto; ≥8 rechazos) |
| `increment_ai_discovery_tokens` | OK (10/5 + cost 0.0001) |
| Idempotencia app-layer | Cubierta en código `d198fa1` (requestId); RPC suma (esperado) |
| Cleanup synthetic `2099-*` | Hecho |

## Aislamiento

| Check | Resultado |
| --- | --- |
| `ai_chatbot_usage` rows | **1** (sin cambio vs baseline) |
| Meses discovery “reales” post-cleanup | **0** |
| Pedidos / supervision / WaSender | Sin DDL tocado; rutas públicas intactas |

## Estado de producción (app)

| Check | Resultado |
| --- | --- |
| `/api/asistente` | `liveGemini=false`, `production_blocked` |
| `/asistente` | 200, shell ON (Paso B) |
| Trueno menú | 200 |
| Chat Trueno | `authorized=true`, `quotaBackend=postgres` |
| Health | ok |
| Flags Vercel | **no modificados** en este paso |

---

## GO / NO-GO — siguiente paso

| | |
| --- | --- |
| Migración cuotas prod | **GO completado** |
| Deploy del registro de tokens (`d198fa1`) con **Gemini apagado** | **GO técnico** — pendiente de tu autorización de deploy |
| Activar Gemini (`ALLOW_GEMINI=1`) | **NO-GO** hasta autorización separada |

### Para el deploy de tokens (cuando autorices)

Sin tocar Gemini:

1. Deploy código `d198fa1+` (metering).
2. Setear (sin ALLOW_GEMINI):  
   `DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres`  
   `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1`  
   `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION=1`  
   caps 15 / 200 / 500000  
   **`ALLOW_GEMINI=0`**
3. Verificar directory-fallback + que reserve postgres responde (aún sin Google).

Detenido tras verificación de migración.
