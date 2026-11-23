# Discovery — preparación prueba final Gemini (Paso C)

**Fecha:** 2026-11-23  
**Estado prod:** metering listo · `ALLOW_GEMINI=0` · sin llamadas facturables en este documento  
**Commit referencia prod:** `d5000db` · deploy `dpl_EgnBo1PZe5AP9BSG3ws45AWUdAtC`  
**Alcance:** solo procedimiento. **No** se cambió `ALLOW_GEMINI`. **No** se consumió Gemini.

---

## 1. Veredicto de gating por sesión

| Pregunta | Hallazgo |
| --- | --- |
| ¿Existe allowlist / Bearer / sesión operador para Gemini? | **No.** El gate live es solo env: `DISCOVERY_ASSISTANT_ALLOW_GEMINI` (+ `ALLOW_PRODUCTION` + `POSTGRES_QUOTA_READY` + `quotaBackend=postgres` + `GEMINI_API_KEY`). |
| ¿Se puede confiar en `sessionId` del navegador? | **No.** Es opcional en el body, generado o enviado por el cliente; no autentica. |
| ¿Hay bypass temporal por IP/header? | **No** en el código actual. |

**Implicación:** activar `ALLOW_GEMINI=1` en Production habilita Gemini para **cualquier** visitante de `/asistente` / `POST /api/asistente`, limitado solo por cuotas globales (200 req/mes, 500k tokens, 15/sesión, 15/IP/min).

**Método seguro (recomendado):** entorno de prueba **aislado** (Vercel Preview + Supabase Preview `gsfxqzvmyzjjgpigrste`) con cuotas/tools reales y Gemini ON **solo ahí**. Production permanece `ALLOW_GEMINI=0`.

**Método alternativo (requiere tu OK explícito y ventana corta):** `ALLOW_GEMINI=1` en Production con presupuesto operativo ≤5 turnos y kill switch inmediato. No es “sesión autorizada”; es opt-in público acotado por cuota.

---

## 2. Aislamiento de herramientas (solo lectura)

Tools expuestas a Gemini (únicas):

1. `search_restaurants` → `listClientDirectory`
2. `filter_restaurants` → directory + filtros reales (`isOpen` / currency / payment)
3. `get_restaurant_public_info` → lookup público
4. `prepare_restaurant_links` → `menuUrl` + `chatUrl` condicional

| Capacidad | ¿Puede Gemini Discovery? |
| --- | --- |
| Crear/editar pedidos | **No** |
| Crear/editar productos | **No** |
| Cambiar configuración / branding | **No** |
| WaSender / inbound | **No** |
| Panel admin / RLS mutaciones | **No** |
| Lectura directorio público | Sí |
| Enlace a menú `/v/{slug}` | Sí (URL pública) |

Unknown tool → `error: unknown_tool`. Sin migraciones ni cambios RLS en esta prueba.

---

## 3. Presupuesto máximo operativo (prueba)

Límites **globales de uso** (ya en prod; no son garantía de costo USD):

| Cap | Valor | Rol |
| --- | --- | --- |
| Mensual requests | **200** | Hard stop primario |
| Mensual tokens | **500 000** | Techo adicional post-`usageMetadata` |
| Por sesión | **15** | Hard stop conversación |
| Tool rounds | **2** | ⇒ hasta **3** HTTP Gemini/turno (`round 0..2`) |
| IP / min | **15** | Soft per-instance |
| `maxOutputTokens` | **512** | Por llamada HTTP |
| Timeout | **20 000 ms** | Por llamada |

**Cupo de esta prueba (operativo, no env):**

| Control | Máximo |
| --- | --- |
| Consultas de prueba | **5** (lista fija §5) |
| HTTP Gemini esperados | ≤ **5 × 3 = 15** (peor caso tool-loop); típico 1–2/turno |
| Reintentos modelo | 1 fallback de modelo por fallo HTTP; **no** reintentar el mismo prompt manualmente salvo fallo claro |
| Tokens salida | ≤ 512 × llamadas HTTP reales |
| Pedidos / mutaciones | **0** |
| Activar otros asistentes / WaSender inbound | **No** |

Estimación grosera (no factura): con ~2–8k tokens/turno × 5 turnos ≪ 500k; el riesgo real de costo es **activar Gemini públicamente** y que terceros consuman el cupo de 200.

---

## 4. Método de activación temporal

### A — Preview aislado (recomendado)

1. Confirmar Supabase Preview (`gsfxqzvmyzjjgpigrste`) con RPCs discovery ya aplicadas.
2. En Vercel **Preview only** (no Production):
   - `DISCOVERY_ASSISTANT_ENABLED=1`
   - `NEXT_PUBLIC_DISCOVERY_ASSISTANT=1`
   - `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION=1` (si el Preview corre `NODE_ENV=production`)
   - `DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres`
   - `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1`
   - `DISCOVERY_ASSISTANT_ALLOW_GEMINI=1`
   - `DISCOVERY_ASSISTANT_SIMULATE=0`
   - Caps: 15 / 200 / 500000 / 2 rounds / 15 IP
   - `GEMINI_API_KEY` (misma clave; contadores **aislados** en tablas `ai_discovery_*` del Preview)
   - Supabase URL/keys del **Preview**, no prod
3. Redeploy Preview. GET Preview `/api/asistente` → `liveGemini:true`.
4. GET Production → debe seguir `liveGemini:false` / `gemini_not_opted_in`.
5. Ejecutar solo las 5 consultas en la URL Preview.

### B — Production ventana corta (solo con tu autorización final)

1. Snapshot pre-prueba: `ai_discovery_usage` mes actual + `ai_chatbot_usage` count.
2. `vercel env` Production: `DISCOVERY_ASSISTANT_ALLOW_GEMINI=1` (resto ya listo).
3. Redeploy / reinicio env. Confirmar GET `liveGemini:true`.
4. Ejecutar ≤5 POSTs controlados (misma máquina/sesión).
5. Apagado inmediato (§4 kill).

**No ejecutar A ni B sin tu “autorización final”.**

---

## 5. Método de apagado inmediato

Orden de kill (cualquiera basta; preferir el 1):

1. `DISCOVERY_ASSISTANT_ALLOW_GEMINI=0` → redeploy/restart env  
2. `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=0`  
3. `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION=0`  
4. `DISCOVERY_ASSISTANT_ENABLED=0` (API → directory-only)

Verificación kill: GET `/api/asistente` → `liveGemini:false`.  
POST convencional → `skippedLlm:true` / `directory-fallback` y **sin** incremento de `ai_discovery_usage.requests` del mes real.

No dropear tablas. No tocar `CHATBOT_*` / `CHAT_SUPERVISION_*` / WaSender inbound.

---

## 6. Procedimiento de prueba (cuando autorices)

### Pre-checks (sin Gemini)

- [ ] Prod GET: `liveGemini=false`, `quotaBackend=postgres`
- [ ] Baseline directorio (§7) anotado
- [ ] Contadores mes: `discovery_req`, `discovery_tokens_in/out`, `chatbot_usage` rows
- [ ] Kill switch listo (comando env ya preparado)

### Por cada una de las 5 consultas

Registrar:

| Campo | Fuente |
| --- | --- |
| `requestId` / `sessionId` | response JSON |
| `model`, `skippedLlm`, `fallback` | response |
| `toolCalls`, `geminiHttpCalls` (si expuesto) | response / logs |
| Cards (slugs) | response `restaurants` |
| Tokens in/out sumados | `usageMetadata` → `recordDiscoveryTokens` |
| Δ `ai_discovery_usage.requests` | +1 por `reserve` si `live.ok` |
| Δ tokens mes | RPC increment |
| Δ `ai_chatbot_usage` | debe ser **0** |
| HTTP Google | solo si live; 0 en fallback |

### Gap reserve vs llamadas reales (a medir)

| Caso | `reserve` (request) | HTTP Google | Tokens |
| --- | --- | --- | --- |
| Live OK | +1 | ≥1 | >0 si metadata |
| Live falla tras reserve | +1 | 0 o parcial | 0 o parcial |
| Gemini OFF / directory-fallback | **0** | **0** | **0** |
| Reintento token mismo `requestId` misma instancia | — | — | no doble (mapa in-process) |
| Reintento entre instancias Vercel | — | — | **posible doble conteo de tokens**; requests Postgres sí atómicos |

**Acción en la prueba:** anotar `requests_reserved` vs `geminiHttpCalls` vs tokens por `requestId`. No hace falta migración ahora; es input GO/NO-GO Gemini público.

### Post-checks

- [ ] Exactamente ≤5 reserves del mes de prueba (o 0 si solo Preview)
- [ ] Cards ⊆ directorio real (sin inventados)
- [ ] 0 pedidos / 0 writes productos
- [ ] Menús / chatbot restaurante / supervisión / checkout siguen OK
- [ ] Kill aplicado; prod `liveGemini=false`

---

## 7. Consultas y baseline directorio (prod, Gemini OFF)

Captura 2026-11-23 vía `mode=clientes` + POST directory-fallback (sin quemar cuota facturable):

| # | Prompt | Baseline directory | Fallback observado (Gemini OFF) | Criterio Gemini live |
| --- | --- | --- | --- | --- |
| 1 | Quiero comer pizza cerca de mí | `q=pizza` → 2 (MEAL4FIT; **Auto Pizzas Nápoles**); cat `pizzas` → 1 Nápoles | `directory-fallback`, 0 cards sin geo | Debe usar tool search/filter pizzas o pedir ubicación; cards reales |
| 2 | ¿Qué restaurantes tienen hamburguesas? | cat `hamburguesas` → **11** (LA TRIBU, Edw Burguer, Pa' Que Komais, …) | 8 cards (Alegría, MEAL4FIT, LA TRIBU, …) | Category hamburguesas; slugs ⊆ directory |
| 3 | Busco un restaurante económico | `q=economico` → **0** (no hay campo precio en tools) | Fallback devolvió listado amplio (13) — **no es “económico” real** | **No inventar precios**; pedir aclaración o filtrar currency/payment reales |
| 4 | Muéstrame el menú de Auto Pizzas Nápoles | `q=napoles` → 1 Nápoles; menú `/v/auto-pizzas-napoles` | 1 card Nápoles | `get_restaurant_public_info` / `prepare_restaurant_links` → menú correcto |
| 5 | Búsqueda sin resultados (`xyznoexiste999discovery`) | total **0** | 0 cards | Mensaje claro + 0 cards |

Coords opcionales para #1 (si se usan en la prueba): lat/lng de Táchira/Táriba alineados al directorio Nápoles — no inventar distancia.

---

## 8. Verificación de aislamiento de otros servicios

Antes y después de la ventana Gemini:

| Servicio | Check |
| --- | --- |
| Chatbots restaurante (piloto) | Flags `CHATBOT_*` intactos; smoke Trueno sin Δ discovery |
| Supervisión humana | `CHAT_SUPERVISION_*` / WaSender outbound piloto sin cambio; **no** activar inbound |
| Menús `/v/*` | 200 en Nápoles + Trueno |
| Checkout | Superficie OK; **0** pedidos creados en la prueba |
| Cuotas chatbot | `ai_chatbot_usage` sin delta por discovery |
| Discovery tables | Solo `ai_discovery_*` |

---

## 9. GO / NO-GO (estado actual)

| Ítem | Estado |
| --- | --- |
| Metering + postgres ready en prod | **GO** (ya desplegado) |
| Procedimiento de prueba documentado | **GO** |
| Mecanismo sesión autorizada | **Ausente** → usar Preview aislado |
| Ejecutar llamadas facturables ahora | **NO-GO** |
| `ALLOW_GEMINI=1` (prod o preview) | **NO-GO** hasta tu autorización final |
| WaSender inbound / otros asistentes | **NO-GO** (fuera de alcance) |

---

## 10. Qué se pide para el siguiente paso

Autorización explícita de **una** de:

1. **Preview aislado:** Gemini ON solo Preview + ejecutar 5 prompts ahí; o  
2. **Production ventana corta:** `ALLOW_GEMINI=1` ≤5 prompts + kill inmediato.

Hasta entonces: prod permanece `ALLOW_GEMINI=0`, sin spend Gemini, sin nuevas features/migraciones/RLS.
