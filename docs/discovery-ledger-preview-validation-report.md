# Discovery — validación Preview del request ledger

**Fecha:** 2026-11-23  
**Commit código:** (este cierre)  
**Migración:** `supabase/migrations/20261123180000_ai_discovery_request_ledger.sql`  
**Destino aplicado:** Preview `gsfxqzvmyzjjgpigrste` **únicamente**  
**Producción `qqhbera…`:** ledger **null** (no aplicada)  
**Gemini HTTP:** **0** llamadas facturables en esta validación

Artefacto smoke: `docs/discovery-ledger-preview-smoke.json`

---

## 1. Resultado de migración Preview

| Check pre-apply | Resultado |
| --- | --- |
| Destino Preview confirmado | **OK** (`gsfxqzvmyzjjgpigrste`) |
| SQL solo `ai_discovery_*` | **OK** (sin `ai_chatbot_*` / comercios) |
| Esquema existente sessions/usage | Presente; ledger ausente → apply |
| Apply | **OK** |
| RPC firmas post-apply | `reserve…(…, p_request_id)` · `increment…(…, p_request_id)` |
| Prod ledger | Sigue **null** |

---

## 2. Evidencia de idempotencia (entre “instancias” vía concurrencia)

Smoke `discovery-ledger-preview-smoke.mjs` — **todos los steps OK**:

| Prueba | Resultado |
| --- | --- |
| Primera reserva | requests=1, `idempotent=false` |
| Mismo `request_id` otra vez | `idempotent=true`, mes permanece 1 |
| **20 concurrentes mismo ID** | 20 OK · session.requests=**1** |
| IDs independientes | mes +2 |
| Tokens tras reserve | +100/+40 |
| Tokens duplicados mismo ID | **sin** incremento |
| Tokens sin reserve | error `discovery request not reserved` |
| `request_id` inválido | error PG |
| Cap mensual con ledger | `monthly request limit` |
| Fallo parcial (retry reserve) | session requests permanece 1 |
| Chatbot usage | tabla ausente en Preview (sin contaminación) |

---

## 3. Permisos y RLS

| Objeto | Estado |
| --- | --- |
| `ai_discovery_request_ledger` RLS | **ON** |
| Policies | **0** (deny-by-default anon/auth) |
| Grants table | solo `service_role` |
| RPC execute | solo `service_role` |
| Anon RPC | `permission denied` |
| Anon SELECT ledger | `permission denied` |

---

## 4. Fail-closed (código)

Cambios imprescindibles:

1. **Eliminado** el fallback silencioso a RPC legacy no idempotente cuando hay `requestId`.
2. Si falta ledger/RPC o falla PG en reserve con `requestId` → `request_ledger_unavailable` → route responde directory-fallback **sin** llamar Gemini.
3. Token post sin ledger → error (no increment legacy); route ya soft-catch (visibilidad) sin abrir Gemini.
4. Gate prod: `DISCOVERY_ASSISTANT_REQUEST_LEDGER_READY` requerido para `liveGemini` en `NODE_ENV=production`.
5. Gemini OFF: directory-fallback / búsqueda convencional **independiente** del ledger (reserve no se ejecuta si `live.ok=false`).

---

## 5. Pruebas completas

| Suite | Resultado |
| --- | --- |
| Vitest | **128 files / 881 passed / 1 skipped** |
| TypeScript `tsc --noEmit` | **OK** |
| Concurrencia ledger Preview | **OK** (20× same id) |
| Seguridad (anon/RLS) | **OK** |
| Directory prod | napoles=1 · hamburguesas=11 |
| Chatbot Trueno GET | `authorized=true` (sin POST Gemini) |
| Prod/Preview Gemini | ambos `liveGemini=false` |

---

## 6. Riesgos restantes

| Riesgo | Mitigación |
| --- | --- |
| Prod aún sin ledger | Gate `REQUEST_LEDGER_READY` + no ALLOW_GEMINI |
| Deploy Preview antiguo sin fail-closed code | Código en rama; no redeploy obligatorio aquí |
| Consultas 1/3/5 sin retest Gemini post-schema | Plan §8 — solo con autorización |
| Idempotencia tokens cross-instance | Cubierta por ledger Preview; falta apply prod |
| Cuotas ≠ techo USD | Documentado |

---

## 7. Procedimiento: ledger **solo** en producción

**Requiere autorización explícita.** No ejecutar ahora.

```bash
# 1) Confirmar destino
npx supabase db query --remote=qqhberaayhohxlbbhdyi --yes -o json \
  "select to_regclass('public.ai_discovery_request_ledger') as ledger;"
# debe ser null

# 2) Apply
npx supabase db query --remote=qqhberaayhohxlbbhdyi --yes \
  -f supabase/migrations/20261123180000_ai_discovery_request_ledger.sql

# 3) Smoke (synthetic period 2099-xx) — mismo script adaptado o RPC manual
# 4) Verificar ai_chatbot_usage sin delta
# 5) Setear DISCOVERY_ASSISTANT_REQUEST_LEDGER_READY=1 (Production)
# 6) Redeploy — GET debe seguir liveGemini=false hasta ALLOW_GEMINI
```

Recuperación: no dropear tablas; kill flags app; opcional cleanup filas sintéticas `r_ledger%` / period `2099-%`.

---

## 8. Plan activación limitada Gemini (5 consultas pendientes)

Tras ledger prod + `REQUEST_LEDGER_READY=1`, **con autorización aparte**:

| # | Prompt | Estado validación |
| --- | --- | --- |
| 1 | Pizza cerca de mí | Pendiente retest post-schema |
| 2 | Hamburguesas | Ya OK en Preview (2b) — reconfirmar prod |
| 3 | Económico | Pendiente (anti-precio ya visto) |
| 4 | Menú Nápoles | Ya OK en Preview (4b) — reconfirmar prod |
| 5 | Sin resultados | Pendiente retest |

Piloto: ventana corta · caps 15/200/500k/2/512 · ≤5 prompts · **no** es techo monetario.

Priorizar Preview o ventana prod corta (no hay auth de sesión operador).

---

## 9. Kill switch y rollback

1. `DISCOVERY_ASSISTANT_ALLOW_GEMINI=0`  
2. `DISCOVERY_ASSISTANT_REQUEST_LEDGER_READY=0`  
3. `POSTGRES_QUOTA_READY=0` / `ALLOW_PRODUCTION=0` / `ENABLED=0`  
4. Confirmar GET `liveGemini:false`  
5. Directory-fallback sigue operativo  
6. No drop de `ai_discovery_*`

---

## GO / NO-GO

| | |
| --- | --- |
| Ledger Preview validado | **GO** |
| Fail-closed en código | **GO** |
| Migración / Gemini en **producción** | **NO-GO** hasta autorización |
| WaSender inbound / otros asistentes | **NO-GO** (fuera de alcance) |
