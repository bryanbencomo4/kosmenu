# Discovery — deploy metering (Gemini OFF)

**Fecha:** 2026-11-23  
**Commit:** `d5000db` (incluye metering `d198fa1` + docs)  
**Deployment:** `dpl_EgnBo1PZe5AP9BSG3ws45AWUdAtC`  
**Alias:** https://elmenuxfa.com  
**Vercel:** Ready  
**Migraciones en este paso:** ninguna

---

## Flags efectivos

| Flag | Valor |
| --- | --- |
| `NEXT_PUBLIC_DISCOVERY_ASSISTANT` | `1` |
| `DISCOVERY_ASSISTANT_ENABLED` | `1` |
| `DISCOVERY_ASSISTANT_QUOTA_BACKEND` | `postgres` |
| `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY` | `1` |
| `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION` | `1` |
| `DISCOVERY_ASSISTANT_ALLOW_GEMINI` | **`0`** |
| `DISCOVERY_ASSISTANT_SIMULATE` | `0` |
| `MAX_REQUESTS_PER_SESSION` | `15` |
| `MAX_MONTHLY_REQUESTS` | `200` |
| `MAX_MONTHLY_TOKENS` | `500000` |
| `MAX_TOOL_ROUNDS` | `2` |
| `RATE_LIMIT_PER_IP_PER_MIN` | `15` |

GET `/api/asistente`:

```json
{"enabled":true,"simulate":false,"liveGemini":false,"liveReason":"gemini_not_opted_in","quotaBackend":"postgres"}
```

---

## Idempotencia tokens (revisión)

| Capa | Comportamiento |
| --- | --- |
| Con Gemini OFF | `live.ok=false` → **no** `reserve` ni `recordDiscoveryTokens` → búsqueda convencional **no** quema cuota |
| Con Gemini ON (futuro) | Idempotencia `requestId` **in-process** (misma instancia). Reintentos HTTP entre instancias podrían doble-contar tokens; el hard stop de **requests** vía Postgres sí es atómico |
| Mitigación actual | Suficiente para este deploy (Gemini off). Antes de Gemini live: valorar ledger durable `request_id` (migración aparte) |

---

## Pruebas post-deploy

| Check | Resultado |
| --- | --- |
| Vercel Ready / health | OK (`version=d5000db…`) |
| `/asistente` shell | OK |
| `liveGemini=false` | OK (`gemini_not_opted_in`) |
| Búsqueda determinista pizza | OK (`directory-fallback`, Nápoles) |
| Postgres backend preparado | OK (`quotaBackend=postgres`) |
| RPC smoke controlado (mes sintético + cleanup) | OK |
| Cuota mes real tras POST | **`discovery_req_month=0`** (sin burn) |
| 0 HTTP Google en path convencional | OK (skippedLlm, no live) |
| Menús Trueno + otro | OK 200 |
| Directory napoles | OK |
| Supervisión Trueno | `authorized=true`, postgres |
| Checkout surface | OK (sin pedidos) |
| `ai_chatbot_usage` | 1 fila (sin cambio) |

---

## GO / NO-GO Gemini

| | |
| --- | --- |
| Deploy metering + postgres ready | **GO completado** |
| Activar Gemini (`ALLOW_GEMINI=1`) | **NO-GO** hasta tu autorización explícita (+ prueba live acotada) |

Detenido. Sin Gemini, sin WaSender inbound, sin nuevas migraciones.
