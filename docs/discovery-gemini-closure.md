# Discovery Gemini — cierre definitivo (pre-activación)

**Fecha:** 2026-11-23  
**Estado:** código + migración ledger listos · **sin** deploy · **sin** migración prod · **sin** nuevas llamadas Gemini

---

## 1. Contabilización persistente entre instancias

### Hallazgo
La idempotencia de tokens era **solo in-process**. Un mismo `requestId` reintentado en otra instancia de Vercel podía doble-contar tokens vía `increment_ai_discovery_tokens`.

### Solución (preparada, no aplicada en prod)
Migración: `supabase/migrations/20261123180000_ai_discovery_request_ledger.sql`

| Pieza | Comportamiento |
| --- | --- |
| Tabla `ai_discovery_request_ledger` | PK `request_id` (`^r_[a-zA-Z0-9]{8,40}$`) |
| `reserve_ai_discovery_quota(..., p_request_id)` | Insert ledger atómico; si ya existe → **no** incrementa sesión/mes (idempotente) |
| `increment_ai_discovery_tokens(..., p_request_id)` | Marca tokens en ledger solo si `tokens_recorded_at is null`; reintento → no suma |
| Fallo sin reserve previo | `discovery request not reserved` (fail-safe, no infla tokens) |
| App | `requestId` **solo** `createRequestId()` en servidor; validado; se pasa a reserve + record |
| Compat | Si RPC ledger aún no existe, fallback a firma legacy (sin romper prod actual) |
| Aislamiento | Solo `ai_discovery_*` — **cero** cambios a `ai_chatbot_*` |

**No aplicada** a producción ni Preview en este cierre. Requiere tu autorización.

---

## 2. Estado definitivo de las cinco pruebas

| # | Consulta | Antes de `estados_operacion` (suite oficial) | Después del arreglo Preview | ¿Re-ejecutada con Gemini post-fix? |
| --- | --- | --- | --- | --- |
| 1 | Pizza cerca de mí | Live OK · 1 HTTP · 0 cards · pidió ciudad/zona · no inventó | Directory OK | **No** re-ejecutada |
| 2 | Hamburguesas | Live OK · 3 HTTP · 0 cards · tools fallaron · admitió fallo técnico | Directory 11 · **Retest 2b: 11 cards** (Alegría, Edw, Tribu, …) | **Sí** (2b) |
| 3 | Restaurante económico | Live OK · 1 HTTP · 0 cards · **no inventó precios** · pidió aclaración | — | **No** re-ejecutada |
| 4 | Menú Auto Pizzas Nápoles | Live OK · 3 HTTP · 0 cards · “no encontré” (tools rotos) | Directory 1 Nápoles · **Retest 4b: cards incl. `auto-pizzas-napoles` + menú** | **Sí** (4b) |
| 5 | Sin resultados (`xyznoexiste…`) | Live OK · 1 HTTP · 0 cards · mensaje claro | — | **No** re-ejecutada |

**No se declara aprobada con cards** ninguna pregunta que no se re-ejecutó post-fix (1, 3, 5).  
**Aprobadas con Gemini + directory real post-fix:** solo **2** y **4**.  
Conducta anti-alucinación (económico / vacío / pedir ubicación) sí se observó en la suite previa.

HTTP total autorizado: **13/15**. Sin más llamadas Gemini.

---

## 3. Aislamiento verificado (cierre)

| Check | Estado |
| --- | --- |
| Production Gemini | **OFF** (`liveGemini=false`, `gemini_not_opted_in`) |
| Preview Gemini (kill deploy) | **OFF** (`kosmenu-bwwj9ocbu…`) |
| Pedidos creados en prueba | **0** |
| Datos comercios | Sin mutaciones de negocio (solo ADD columna Preview ya hecha antes) |
| Cuotas chatbot restaurantes | Intactas (Preview sin tabla `ai_chatbot_usage`; prod no tocada) |
| WaSender / supervisión | Sin cambios de flags/código en este cierre |

---

## 4. Procedimiento de activación controlada (piloto)

> Las cuotas 15/200/500k son **límites de uso**, no techo monetario garantizado.

### Por qué piloto primero
No hay autenticación de sesión para Gemini solo-operador. `ALLOW_GEMINI=1` en prod abre a **cualquier** visitante de `/asistente` bajo las cuotas globales.

### Opción A — Piloto Preview (recomendado primero)
1. Autorizar aplicar `20261123180000_ai_discovery_request_ledger.sql` en **Preview** `gsfxqzv…`
2. Smoke RPC: reserve×2 mismo `request_id` → requests +1; tokens×2 mismo id → tokens +1 vez
3. `ALLOW_GEMINI=1` solo Preview + caps 15/200/500k/2 rounds/512 out
4. ≤5 prompts live · matar con `ALLOW_GEMINI=0`

### Opción B — Piloto Production ventana corta
**Solo con autorización explícita aparte.**

Pre:
1. Autorizar migración ledger en **prod** `qqhbera…`
2. Smoke RPC (synthetic period) + confirmar `ai_chatbot_*` sin delta
3. Snapshot `ai_discovery_usage` mes actual
4. Confirmar GET prod `liveGemini=false`

Activar:
```
DISCOVERY_ASSISTANT_ALLOW_GEMINI=1
DISCOVERY_ASSISTANT_SIMULATE=0
# ya presentes: ENABLED=1, ALLOW_PRODUCTION=1, QUOTA_BACKEND=postgres,
# POSTGRES_QUOTA_READY=1, caps 15 / 200 / 500000 / 2 / 512
```
Redeploy prod. GET → `liveGemini:true`.

Piloto operativo:
- Ventana corta (p.ej. 15–30 min) o hasta N prompts (≤10)
- Monitorear `ai_discovery_usage.requests` / tokens
- Directory-fallback sigue si Gemini/cuota falla

### Kill / rollback inmediato
1. `DISCOVERY_ASSISTANT_ALLOW_GEMINI=0` → redeploy  
2. O `POSTGRES_QUOTA_READY=0` / `ALLOW_PRODUCTION=0` / `ENABLED=0`  
3. Confirmar GET `liveGemini:false`  
4. Búsqueda convencional `/asistente` sigue (directory-fallback)  
5. No dropear tablas

---

## 5. GO / NO-GO

| | |
| --- | --- |
| Cierre técnico + ledger preparado | **GO** |
| Aplicar migración ledger (Preview/prod) | **NO-GO** hasta tu OK |
| Activar Gemini Discovery público en prod | **NO-GO** |
| Siguiente paso recomendado | Autorizar ledger en Preview → smoke → luego autorización separada para prod piloto |

Siguiente objetivo alineado: publicar Gemini Discovery → acceso universal WhatsApp (fuera de este cierre).
