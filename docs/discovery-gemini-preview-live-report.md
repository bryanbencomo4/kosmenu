# Discovery — prueba final Gemini en Preview (Paso C)

**Fecha:** 2026-11-23  
**Autorización:** Gemini **solo** Vercel Preview + Supabase Preview. Producción **nunca** activada.  
**Commit código:** `fff3535` (HTTP budget + error surfacing)  
**Deploy live:** `dpl_45Zvo8nySGgxpKzimahwvssXKdQh` · https://kosmenu-nl4r882z2-bryanbencomo4s-projects.vercel.app  
**Supabase:** `gsfxqzvmyzjjgpigrste` (confirmado)  
**Producción:** `liveGemini=false` / `gemini_not_opted_in` en todo momento

Artefactos: `docs/discovery-gemini-preview-live-checks.json`

---

## 1. Aislamiento (pre-llamadas)

| Check | Resultado |
| --- | --- |
| Preview → `gsfxqzvmyzjjgpigrste` | **OK** (env branch `feature/discovery-assistant`) |
| Sin credenciales write de prod | **OK** (service role Preview keys) |
| RPC `reserve` / `increment` Discovery | **OK** |
| Prod `ALLOW_GEMINI` | **0** (`liveGemini=false`) |
| Tools solo directory | **OK** (search/filter/info/links) |
| Catálogo Preview | 20 comercios online; incluye Nápoles, Trueno, Edw Burguer, Bladi Jaiper, NelsonBurger, FlavorandFood |

**Defecto crítico hallado y corregido (Preview only):** faltaba columna `comercios.estados_operacion`. Se aplicó `20261023120000_comercios_estados_operacion.sql` **solo** en Preview. Prod ya la tenía. Sin migraciones nuevas en producción.

---

## 2. Presupuesto operativo efectivo

| Control | Valor | Garantía |
| --- | --- | --- |
| `MAX_GEMINI_HTTP_CALLS` | **3**/turno | Código: consume slot **antes** de cada fetch |
| `GEMINI_HTTP_BUDGET` | **15** durable (RPC synthetic `2099-12`) | Código + Postgres Preview |
| `MAX_OUTPUT_TOKENS` | 512 | Env |
| `MAX_TOOL_ROUNDS` | 2 | Env |
| Suite oficial | 5 consultas | Script |

HTTP suite oficial: **9/15**. Retest post-schema (Q2/Q4): **+4** → total sesión budget **13/15**. No se excedió 15.

---

## 3. Suite oficial (5 consultas) — Gemini live

Modelo: `gemini-3.1-flash-lite`. Sesión `preview-gemini-live-1795457479895`.

| # | Prompt | HTTP | Tokens in/out | Cost est. USD | Cards | Evaluación |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Pizza cerca de mí (+ coords) | 1 | 608/36 | ~0.000075 | 0 | Pidió ciudad (no inventó). Tools 0. |
| 2 | Hamburguesas | 3 | 1992/93 | ~0.000236 | 0 | Tools 2 fallaron por schema Preview; Gemini admitió problema técnico, **no inventó lista** |
| 3 | Restaurante económico | 1 | 606/73 | ~0.000090 | 0 | **No inventó precios**; pidió ciudad/preferencia |
| 4 | Menú Auto Pizzas Nápoles | 3 | 2004/81 | ~0.000233 | 0 | Tools fallaron (schema); dijo no encontrado — **no inventó menú** |
| 5 | `xyznoexiste999discovery` | 1 | 608/45 | ~0.000079 | 0 | Sin resultados claros; ofreció categorías |

**Totales suite:** HTTP **9** · tokens **5818/328** · costo est. **~$0.00071** · tiempo ~6–8 s/turno

---

## 4. Retest post-fix schema (dentro del presupuesto restante)

| # | Prompt | HTTP | Cards | Correspondencia directory |
| --- | --- | --- | --- | --- |
| 2b | Hamburguesas | 2 | **11** | Alineado con cat `hamburguesas` Preview (total 11) |
| 4b | Menú Nápoles | 2 | **5** | Incluye `auto-pizzas-napoles` (directory q=napoles → 1) |

Tras el fix, tools devuelven cards reales del directorio Preview.

---

## 5. Metering Preview (`ai_discovery_*`)

| Métrica (mes 2026-11) | Tras suite+retest |
| --- | --- |
| `ai_discovery_usage.requests` | **10** (incluye 1 diag + 5 suite + 2 retest; 2 fallos tempranos previos) |
| `tokens_input` / `tokens_output` | **15197 / 823** |
| `estimated_cost` | **~$0.00185** |
| HTTP budget session | **13/15** |
| `ai_chatbot_usage` | **N/A en Preview** (tabla ausente) → sin contaminación chatbot |
| Pedidos creados | **0** |
| Prod Gemini | **nunca on** |

Reserve vs HTTP: cada turno live hace `reserve` (+1 request) y 1–3 HTTP; tokens suman todas las rondas con `usageMetadata`. Gap observado en fallos tempranos pre-fix: reserve+HTTP slot sin tokens (excepciones) — mitigado con catch en agente.

---

## 6. Cierre

1. `DISCOVERY_ASSISTANT_ALLOW_GEMINI=0` en Preview (`feature/discovery-assistant`) + `GEMINI_HTTP_BUDGET=0`  
2. Redeploy Preview para aplicar kill  
3. Prod verificado: `liveGemini=false`  
4. Sin pedidos · sin WaSender inbound · sin otros asistentes · sin migraciones prod  

---

## 7. GO / NO-GO — activación pública Gemini Discovery

| Criterio | Veredicto |
| --- | --- |
| Gemini real funciona con tools + metering en Preview | **GO técnico** (tras fix schema Preview) |
| No inventa precios / “económico” sin datos | **GO** (pide aclaración) |
| Cuotas Postgres Discovery aisladas | **GO** |
| HTTP budget enforceable | **GO** (13≤15) |
| Idempotencia tokens cross-instance | **Pendiente** (in-process only) |
| Preview schema parity con prod | **Parcial** (faltaba `estados_operacion`; corregido en Preview) |
| Activación **pública** en Production | **NO-GO** hasta autorización explícita separada |

**Recomendación:** NO-GO público. Condiciones previas sugeridas antes de prod Gemini: (1) confirmar parity schema Preview↔prod para directory, (2) ledger durable `request_id` para tokens si se teme doble conteo multi-instancia, (3) ventana corta + kill list, (4) presupuesto 200/500k aceptado como límite de uso no USD.
