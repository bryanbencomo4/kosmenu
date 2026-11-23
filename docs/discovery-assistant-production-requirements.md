# Discovery Assistant — requisitos exactos para producción

**Estado:** código listo en `feature/discovery-assistant`.  
**Migración preparada, NO aplicada:** `supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql`

## 1. Kill switches / flags (orden de activación)

| Variable | Valor prod inicial | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_DISCOVERY_ASSISTANT` | `0` hasta UX OK | UI shell |
| `DISCOVERY_ASSISTANT_ENABLED` | `0` | API agent |
| `DISCOVERY_ASSISTANT_ALLOW_PRODUCTION` | `0` | Master prod |
| `DISCOVERY_ASSISTANT_ALLOW_GEMINI` | `0` | Opt-in Google |
| `DISCOVERY_ASSISTANT_SIMULATE` | unset / `0` | Forzado off en prod |
| `DISCOVERY_ASSISTANT_QUOTA_BACKEND` | `postgres` (tras migración) | Nunca `filesystem` en prod |
| `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY` | `0` hasta RPC verificada | Gate explícito |
| `DISCOVERY_ASSISTANT_MAX_REQUESTS_PER_SESSION` | p.ej. `40` | Sesión |
| `DISCOVERY_ASSISTANT_MAX_MONTHLY_REQUESTS` | p.ej. `2000` | Global mensuales discovery |
| `DISCOVERY_ASSISTANT_MAX_MONTHLY_TOKENS` | p.ej. `2000000` | Techo tokens |
| `DISCOVERY_ASSISTANT_RATE_LIMIT_PER_IP_PER_MIN` | p.ej. `30` | In-memory por instancia; complementar con WAF/Upstash |
| `GEMINI_API_KEY` | ya existente | Compartida con chatbot; cuotas **aisladas** |
| `NEXT_PUBLIC_CHATBOT_PREVIEW` | según política | Necesario para CTAs `?chatbot=1` |
| `CHATBOT_ALLOWED_COMMERCE_IDS` | UUIDs reales | CTAs de chat en prod |

Kill switch DB opcional tras migración:  
`ALTER DATABASE … SET app.discovery_assistant_kill = 'on';`

## 2. Plan de aplicación de cuota (sin Gemini aún)

1. Revisar SQL `20261123160000_ai_discovery_assistant_quota.sql` (tablas `ai_discovery_*` + RPCs).
2. Aplicar en staging → verificar `reserve_ai_discovery_quota` con service_role.
3. En Vercel staging: `QUOTA_BACKEND=postgres` + `POSTGRES_QUOTA_READY=1` **sin** `ALLOW_GEMINI`.
4. Smoke: POST `/api/asistente` con simulate/fallback; confirmar escritura en `ai_discovery_usage` y **cero** filas nuevas en `ai_chatbot_usage`.
5. Solo con autorización: `ALLOW_PRODUCTION=1` + `ALLOW_GEMINI=1` + presupuesto.

## 3. Aislamiento respecto a restaurantes

- Tablas y RPCs **distintas** (`ai_discovery_*` vs `ai_chatbot_*`).
- Caps mensuales independientes.
- No reutiliza `commerce_id` de restaurantes (agent global `discovery`).

## 4. Rate limiting entre instancias

- Hoy: `consumeRateLimit` in-memory (por instancia serverless).
- Producción: frentear con Vercel WAF / Cloudflare / Upstash Redis (mismo contrato que chatbot). La cuota postgres es atómica entre instancias; el rate limit IP no lo es.

## 5. Checklist GO prod Gemini

- [ ] Migración aplicada y RPC smoke OK  
- [ ] `POSTGRES_QUOTA_READY=1`  
- [ ] Caps sesión/mes/tokens definidos  
- [ ] WAF/IP rate limit  
- [ ] `ALLOW_GEMINI` autorizado explícitamente  
- [ ] Monitoreo costo (`ai_discovery_usage.estimated_cost`)  
- [ ] Kill switches probados  
