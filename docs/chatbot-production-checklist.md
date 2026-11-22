# Checklist de producción — Chatbot (El Menú XFA)

**Estado (2026-11-22 blockers):** código voz + SQL RLS listos en aislamiento.  
**Piloto público: NO-GO** hasta auth para (1) DROP RLS en prod y (2) smoke live voz.  
Informe: [`docs/chatbot-blockers-closure-report.md`](./chatbot-blockers-closure-report.md).

## Bloqueante seguridad (orden estricto)

- [ ] Autorización explícita para aplicar `supabase/sql/apply-drop-pedidos-emergency-anon-insert.sql`
- [ ] Ejecutar auditoría RO previa (`read-only-audit-pedidos-emergency-anon-insert.sql`)
- [ ] Aplicar DROP + REVOKE en transacción
- [ ] Auditoría RO post: policy **ausente**
- [ ] Smoke checkout tradicional vía `POST /api/orders` (service_role) — 1 pedido controlado
- [ ] Verificar anon no puede `.from('pedidos').insert(...)` (PostgREST)
- [ ] Plan de rollback a mano (recrear policy solo si hace falta revertir)

## Bloqueante voz

- [ ] Código parcial-fulfill + soft-recovery mergeado
- [ ] Suites verdes (Vitest / tsc / E2E sim)
- [ ] Autorización presupuesto live mínimo (≤6 HTTP / ≤US$0,02 / 1 media)
- [ ] Smoke: audio → STT → **primer** turno con 2 `propose_add` → confirm → checkout 12,25 → 0 pedidos
- [ ] Validación manual iPhone Safari + Android Chrome

## Activación piloto (solo después de ambos)

URL exclusiva: `https://elmenuxfa.com/v/pizzas-el-trueno?chatbot=1`

```
CHATBOT_ENABLED=1
CHATBOT_SIMULATE_GEMINI=0
CHATBOT_STAGING_MODE=0
CHATBOT_BLOCK_ORDERS=0
CHATBOT_MEDIA_LIVE=0   # 1 solo con presupuesto media
CHATBOT_ALLOWED_COMMERCE_IDS=<uuid Trueno>
CHATBOT_QUOTA_BACKEND=filesystem|supabase
CHATBOT_LIVE_HARD_CAPS=1
CHATBOT_LIVE_MAX_GEMINI_CALLS=<piloto>
CHATBOT_LIVE_MAX_COST_USD=<piloto>
CHATBOT_LIVE_BUDGET_FILE=<volumen persistente>
GEMINI_API_KEY=<secret>
```

- No modificar `en_linea`
- No allowlist global de comercios
- Multimedia gated; ephemeral disk only

## Kill-switch / rollback

1. Vaciar `CHATBOT_ALLOWED_COMMERCE_IDS` o `CHATBOT_ENABLED=0`
2. `CHATBOT_MEDIA_LIVE=0`
3. Restart
4. DB: solo revertir DROP si el checkout tradicional fallara por RLS (no esperado con service_role)

## Evidencia local

- Voz/tests: `site/tests/chatbot-voice-first-turn-blockers.test.ts`
- RLS aislado: `site/.data/rls-isolated/report.json`
- SQL apply: `supabase/sql/apply-drop-pedidos-emergency-anon-insert.sql`
- Probe: `site/scripts/probe-orders-comprobantes.mjs`

---

**DETENTE.** Sin deploy ni migración prod sin autorización.
