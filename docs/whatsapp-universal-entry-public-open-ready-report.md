# Wa-entry — APERTURA PÚBLICA CONTROLADA (ejecutada)

**Fecha:** 2026-11-23 23:22 VET  
**Veredicto:** **GO — bot público activo**  
**Deployment final:** `dpl_7z5ijsGjxc4yAXmoVS22S6A8mqFH`  
**Alias:** https://elmenuxfa.com

---

## Flags efectivos (live health)

| Flag | Valor |
| --- | --- |
| INBOUND | `1` |
| ROUTER | `1` |
| ALLOW_REAL | `1` |
| ENFORCE_ALLOWLIST | `0` |
| ALLOWLIST_DIGITS | *(vacío)* · `allowlistCount=0` |
| MAX_REPLIES_PER_HOUR | `12` |
| WEBHOOK_RATE_PER_MINUTE | `60` |
| Adapter / store | wasender / supabase `qqhberaayhohxlbbhdyi` |

---

## Controles previos a abrir

| Control | Resultado |
| --- | --- |
| `MAX_REPLIES=12` por remitente | **OK** — 12 slots en `wa_entry_threads` → probe `rate_limited` (Postgres, multi-instancia) |
| `WEBHOOK_RATE=60` | Configurado. Alcance: **por instancia Vercel** (Map en memoria). Defensa auxiliar 429; cuota dura = replies/hora en DB |
| Kill switch router | **OK** — `ROUTER=0` → `router_off`; wall ~**74 s** (incluye deploy). Sesión ELMENUXFA1 no tocada |
| Fix crítico apertura | Assert/sender bloqueaban allowlist vacía → corregido (enforce off + empty = público). 28 tests OK |

---

## Conversación pública

| Paso | Resultado |
| --- | --- |
| Número nuevo (antes outsider) | Router `replied` (envío WaSender falló: JID inexistente — esperado) |
| MENÚ → bienvenida | replied · **sent** primary |
| 1 → consumidor / asistente | replied · **sent** |
| MENÚ → 2 → 1 negocio/registro | replied · **sent** |
| Cola 15 min | 7 **sent** primary · 1 failed (JID fake) |

---

## Superficies

directory / asistente / `/v/trueno` / business / app / register → **200**.

---

## Reversión (si hace falta)

1. `PLATFORM_WA_ROUTER=0` + redeploy (~1–2 min) — deja de responder; no desconecta WaSender.  
2. O reponer allowlist: `ENFORCE=1` + `ALLOWLIST_DIGITS=584140821633`.

---

## Nota operativa

No reintroducir `WASENDER_API_KEY_SECONDARY` sin sesión válida.  
Bot responde solo a inbound válido (sin campañas).
