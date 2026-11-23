# Discovery Assistant — Preflight Paso C (Gemini)

**Fecha:** 2026-11-23  
**Base prod actual:** Paso B `dpl_G3xi2R8zza249MmXCsu8GZ653CKz`  
**SQL:** `supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql`  
**Estado:** **NO aplicado en producción · sin llamadas Gemini · sin cambios de flags**

---

## GO / NO-GO

| Decisión | |
| --- | --- |
| **GO condicionado** | Autorizar migración + activación gradual **solo si** aceptas el presupuesto reducido por **requests** y el plan abajo |
| **Bloqueante menor** | El agente live **aún no llama** `increment_ai_discovery_tokens` tras Gemini → el techo de **tokens** / `estimated_cost` no se actualiza solo. El techo de **requests** (RPC `reserve_ai_discovery_quota`) sí es atómico y es el control de facturación garantizado para el arranque |
| **NO-GO** | Activar Gemini **antes** de aplicar la migración y poner `QUOTA_BACKEND=postgres` + `POSTGRES_QUOTA_READY=1` |

Esperando tu autorización explícita. Nada aplicado.

---

## 1. Revalidación migración vs producción

Inspección **read-only** de `qqhberaayhohxlbbhdyi` (prod):

| Objeto | Prod hoy |
| --- | --- |
| `ai_discovery_sessions` / `ai_discovery_usage` | **ausentes** (null) |
| `reserve_ai_discovery_quota` / `increment_ai_discovery_tokens` | **ausentes** |
| `ai_chatbot_sessions` / `ai_chatbot_usage` | presentes |
| `reserve_ai_chatbot_quota` (+ session/increment chatbot) | presentes |

La migración es **aditiva** (`create table if not exists` + `create or replace` solo de funciones `ai_discovery_*`).  
Compatible con el esquema actual: no toca tablas de pedidos, chat supervision, comercios ni `ai_chatbot_*`.

Preview (`gsfxqzvmyzjjgpigrste`): ya aplicada + smoke concurrencia OK (20 intentos → cap 5 atómico; anon denied).

---

## 2. Aislamiento (no afecta)

| Sistema | Impacto |
| --- | --- |
| Pedidos / checkout / pagos | Ninguno (sin tools de escritura) |
| Chatbot restaurantes `ai_chatbot_*` | Tablas/RPC distintas |
| Supervisión humana | Sin cambios |
| WaSender | Sin tools / sin colas |
| Otras cuotas (`ai_usage_control`, images) | Sin overlap de nombres |

---

## 3. Límites persistentes / atómicos / multi-instancia

| Control | Compartido entre instancias Vercel? | Notas |
| --- | --- | --- |
| `reserve_ai_discovery_quota` (sesión + mes) | **Sí** (Postgres `FOR UPDATE`) | Probado en Preview |
| Cap tokens vía RPC | **Sí**, si se incrementan tokens | Hoy el agent **no** postea usageMetadata → tokens quedan ~0 |
| `consumeRateLimit` IP in-memory | **No** | Soft; complementar WAF/Cloudflare/Upstash |
| Fail-closed | **Sí** | Error RPC → soft fallback directory, **sin** Gemini |

---

## 4. Presupuesto inicial reducido + kill switch

### Presupuesto recomendado (arranque, no smoke)

| Variable | Valor propuesto | Rol |
| --- | --- | --- |
| `DISCOVERY_ASSISTANT_MAX_REQUESTS_PER_SESSION` | **15** | Techo por conversación |
| `DISCOVERY_ASSISTANT_MAX_MONTHLY_REQUESTS` | **200** | **Control de costo primario** (~200 turns Gemini/mes) |
| `DISCOVERY_ASSISTANT_MAX_MONTHLY_TOKENS` | **500000** | Defensa en profundidad (efectiva tras wire-up de tokens) |
| `DISCOVERY_ASSISTANT_RATE_LIMIT_PER_IP_PER_MIN` | **15** | Soft per-instance |
| `DISCOVERY_ASSISTANT_MAX_TOOL_ROUNDS` | default 2 | Limita cascadas |

No usar 2000/2M del default de código como presupuesto de facturación.

Estimación orden de magnitud (depende del modelo): 200 requests × pocas llamadas tool ≈ coste bajo de prueba; **el hard stop es el monthly request reserve**.

### Kill switch inmediato (orden)

1. `DISCOVERY_ASSISTANT_ALLOW_GEMINI=0` (corta Google al instante tras redeploy/restart de env)
2. `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=0` o `ALLOW_PRODUCTION=0`
3. `DISCOVERY_ASSISTANT_ENABLED=0` (API → directory-only)
4. DB: `ALTER DATABASE … SET app.discovery_assistant_kill = 'on';` (RPC reserve falla)
5. Rollback deploy a `dpl_G3xi2R8zza249MmXCsu8GZ653CKz` si hace falta (Supabase intacto)

---

## 5. Herramientas = solo directorio real

Tools expuestas a Gemini (únicas):

1. `search_restaurants` → `listClientDirectory`
2. `filter_restaurants` → directory + filtros `isOpen` / currency / payment reales
3. `get_restaurant_public_info` → lookup en directory
4. `prepare_restaurant_links` → `menuUrl` + `chatUrl` condicional

- Unknown tool → `error: unknown_tool`
- Prompt: no inventar restaurantes, precios, horarios, coords
- Cards usan `isOpen` / `openLabel` del directorio; sin precios de menú en el tool surface
- Sin tools de admin, pedidos, productos, WaSender, panel

---

## 6. Prueba live corta (preparada — **no ejecutada**)

Ejecutar **solo tras** migración + flags Gemini, con presupuesto 200:

| # | Prompt | Esperado |
| --- | --- | --- |
| 1 | «Quiero comer pizza cerca de mí» | Pide geo/región o usa coords; pizzas del directory |
| 2 | «¿Qué restaurantes tienen hamburguesas?» | category hamburguesas reales |
| 3 | «Busco un restaurante económico» | No inventar precios; filtrar con currency/payment reales o pedir aclaración |
| 4 | «Muéstrame el menú de Auto Pizzas Nápoles» | `prepare_restaurant_links` / info → `/v/auto-pizzas-napoles` |
| 5 | Consulta sin resultados (`xyznoexiste…`) | Mensaje claro + 0 cards |

Verificar por request: `skippedLlm:false`, `model` Gemini, fila en `ai_discovery_usage`, **0** delta en `ai_chatbot_usage`, 0 pedidos creados.

---

## 7. Superficie de ataque admin / mutaciones

| Capacidad | ¿Gemini puede? |
| --- | --- |
| Admin panel / RBAC | No |
| Crear/editar productos | No |
| Crear pedidos | No |
| WaSender | No |
| Lectura directory público | Sí (solo tools) |
| Enlace menú / chat CTA | Sí (flags reales) |

---

## 8. Procedimiento (migración → activación → verify → rollback)

### A — Migración prod (requiere tu OK)

```bash
# SOLO tras autorización. Target EXPLÍCITO producción.
npx supabase db query --project-ref qqhberaayhohxlbbhdyi --yes \
  -f supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql
```

Smoke service_role (como Preview): reserve + session cap + monthly cap + concurrency + anon denied + 0 writes chatbot.

### B — Flags (sin Gemini aún)

```
DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres
DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1
DISCOVERY_ASSISTANT_ALLOW_PRODUCTION=1
DISCOVERY_ASSISTANT_ALLOW_GEMINI=0   # sigue off
+ caps del presupuesto reducido
```

Redeploy. Confirmar GET: `liveGemini:false`, backend postgres ready path ok.

### C — Gemini (segundo OK)

```
DISCOVERY_ASSISTANT_ALLOW_GEMINI=1
DISCOVERY_ASSISTANT_SIMULATE=0
```

Redeploy (si hace falta por env). Ejecutar prueba live §6. Monitorear `ai_discovery_usage.requests`.

### D — Rollback

- Flags off (kill list §4) **sin** drop de tablas
- O revert Vercel a Paso B deploy
- Supabase: dejar tablas (aditivas); opcional kill DB setting

---

## Checklist autorización Paso C

- [ ] Autorizas aplicar SQL en **producción** `qqhberaayhohxlbbhdyi`
- [ ] Aceptas presupuesto **200 req/mes** + **15/sesión** como hard stop
- [ ] Aceptas que el techo de tokens queda secundario hasta wire-up de `increment_ai_discovery_tokens`
- [ ] Autorizas después (paso separado) `ALLOW_GEMINI=1` y ≤5 prompts live de prueba
- [ ] Confirmas no tocar `CHATBOT_*` / `CHAT_SUPERVISION_*`

---

## Resumen ejecutivo

Migración lista y aislada; Preview OK; prod aún sin tablas discovery.  
Herramientas seguras (solo directory).  
Presupuesto y kill switches definidos.  
**Detenido** — sin migración prod, sin Gemini, sin spend.
