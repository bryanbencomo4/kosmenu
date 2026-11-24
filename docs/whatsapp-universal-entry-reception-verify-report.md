# Wa-entry — CIERRE FUNCIONAL (allowlist)

**Fecha:** 2026-11-23 21:48 VET  
**Allowlist:** solo `584140821633`  
**Público:** **NO abierto**

---

## GO / NO-GO

| Decisión | Resultado |
| --- | --- |
| Ensayo allowlist (funcional) | **GO** |
| Apertura pública del router | **NO-GO** (mantener allowlist) |

---

## 1. Negocio

| Paso | Router | Cola WaSender |
| --- | --- | --- |
| MENÚ → bienvenida | replied ~0.5–0.7 s | **sent** primary |
| 2 → submenú negocio | replied · `awaiting_business_action` | **sent** |
| 1 → registro | replied · links `business.elmenuxfa.com/` + `app.elmenuxfa.com/?tab=register` | **sent** |
| MENÚ → bienvenida | replied | **sent** |
| 2 → submenú | replied | **sent** |
| 2 → administración | replied · `https://app.elmenuxfa.com/` | **sent** primary |

HTTP de enlaces: directory / business / app / register / asistente → **200**.

---

## 2. Duplicados / concurrencia

| Prueba | Resultado |
| --- | --- |
| Mismo `message_id` en paralelo | 1× `replied` + 1× `ignored/duplicate` |
| Mismo texto, IDs distintos | 2× `replied` (no confundido con webhook dup) |
| Fuera de contexto | help-audience (sin bucles) |

---

## 3. Intervención humana

| Prueba | Resultado |
| --- | --- |
| `fromMe` = texto bienvenida (eco bot) | `ignored` / `bot_echo` |
| `fromMe` = texto operador | `ignored` / `from_me` → pause |
| Cliente durante pause | `ignored` / `human_handling` (0 outbound) |
| Tras expirar pause + MENÚ | `replied` (reanudación) |

---

## 4. Seguridad

| Check | Resultado |
| --- | --- |
| Allowlist | `allowlistCount=1` · solo `584140821633` |
| Outsider `584129990099` | `not_allowlisted` · outbound outsider **0** |
| Firma forjada | **401** |
| Rate limit | `rate_limited` observado bajo ráfaga (cuota activa) |
| Kill switch | `PLATFORM_WA_INBOUND=0` (código + health; no se apagó prod en este cierre) |

**Fallo corregido en el cierre:** cola Edge usaba `WASENDER_API_KEY_SECONDARY` inválida → mensajes `session_key=secondary` fallaban con `invalid API key`. Se **eliminó** ese secret en Supabase. Retest: solo `primary` · **sent**.

---

## 5. Servicios existentes (humo)

| Superficie | HTTP |
| --- | --- |
| elmenuxfa.com | 200 |
| /asistente (+ `?ref=wa`) | 200 |
| business.elmenuxfa.com | 200 |
| app.elmenuxfa.com (+ `?tab=register`) | 200 |
| wa-entry health | inbound/router/real/allowlist=1 OK |

Notificaciones WaSender existentes: misma cola/`primary`; secondary deshabilitada (ya no enruta a key inválida).

---

## 6. Estado de producción

| Flag | Valor |
| --- | --- |
| INBOUND | 1 |
| ROUTER | 1 |
| ALLOW_REAL | 1 |
| ENFORCE_ALLOWLIST | 1 |
| ALLOWLIST | `584140821633` únicamente |
| Adapter / store | wasender / supabase `qqhberaayhohxlbbhdyi` |

**Latencias típicas (allowlist):** webhook process ~0.2–0.9 s · enqueue→sent ~0.3–1.0 s (primary).

Evidencia JSON: `site/.wa-entry-prod-deploy/closure-trial-report.json`, `business-retest-steps.json`.

---

## Decisión recomendada

- **Activación pública: NO-GO** hasta que decidas ampliar allowlist / cuotas.
- **Mantener** allowlist de prueba.
- Ensayo allowlist: **cerrado en GO** tras fix de secondary key.
