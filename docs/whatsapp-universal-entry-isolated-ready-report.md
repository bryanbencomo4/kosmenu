# Wa-entry — entorno aislado PREPARADO (Preview)

**Rama:** `feature/wasender-universal-entry`  
**Fecha:** 2026-11-23  
**Autorización usada:** schema + pruebas en Supabase Preview únicamente.  
**Prohibido / no hecho:** producción, webhook ELMENUXFA1, cola `wasender_message_queue`, envíos reales, merge, `vercel --prod`.

---

## GO / NO-GO

| Criterio | Resultado |
| --- | --- |
| Schema Preview aplicado (`gsfxqzvmyzjjgpigrste`) | **GO** |
| Persistencia Preview (estado, dedupe, locks, outbound) | **GO** (10/10 integración) |
| Sender aislado (sin cola prod) | **GO** |
| Vitest local router | **GO** (27/27) |
| Contrato webhook documentado + auth | **GO** |
| Endpoint HTTPS **público** en internet | **NO-GO parcial** — código listo; falta host HTTPS (Preview Vercel o túnel) |
| Sesión secundaria creada/conectada | **NO-GO** — no creada (requiere acción del propietario + número/QR) |
| Prueba real entre números | **NO-GO** — requiere sesión secundaria + HTTPS + allowlist |

**Veredicto de integración aislada (sin WhatsApp real):** **GO**  
**Veredicto de prueba real allowlisted:** **NO-GO** hasta completar requisitos de la §8

---

## 1. Schema Preview aplicado

- Archivo: `supabase/preview-bootstrap/12-wa-entry-router.sql`
- Target verificado: `gsfxqzvmyzjjgpigrste`
- Verify RPC/tablas: `wa_entry_threads`, `wa_entry_seen_messages`, `wa_entry_outbound`, `wa_entry_send_locks`, `wa_entry_try_claim_message`, `wa_entry_match_bot_echo` = presentes
- RLS: enabled; anon/authenticated sin grants; service_role con grants
- Producción `qqhberaayhohxlbbhdyi`: **no migrada**

---

## 2. Persistencia real

Adapter: `PLATFORM_WA_STORE=supabase_preview` + `PLATFORM_WA_ADAPTER=preview_isolated`

Probado contra Preview:

1. Hola → bienvenida + thread `awaiting_audience`
2. `1` → enlace `https://elmenuxfa.com/asistente?ref=wa`
3. Dedupe atómico
4. Concurrencia (mismo `messageId`)
5. Fallo de envío + reintento acotado
6. Kill switch
7. Recuperación tras “reinicio” (nuevo client store → mismo thread)
8. Outbound aislado en `wa_entry_outbound`

Script: `node site/scripts/wa-entry-preview-integration.mjs`

---

## 3. Sender aislado

`createIsolatedPreviewSender` — **no** importa `sendWhatsappText`, **no** usa `wasender_message_queue`, **no** llama wasenderapi.com.

Guarda payloads en Preview para inspección/idempotencia/reintentos.

`PLATFORM_WA_ALLOW_REAL_WASENDER` permanece `0`. Adaptador `wasender` real sigue gated.

---

## 4. Endpoint webhook (código)

Ruta: `POST /api/wa-entry/webhook`  
GET health: `/api/wa-entry/webhook`

Comportamiento:

- Auth `X-Webhook-Signature` (contrato Wasender) + modos platform
- Límite de body + rate limit por IP
- **Procesamiento durable (claim + route + outbound aislado) antes de ACK 200**
- 500 en error de envío (invitar reintento proveedor)
- Logs enmascarados (sin secretos ni números completos)

### HTTPS público

El código está listo. **No se desplegó** Preview Vercel en esta sesión (evitar mezcla accidental de env Production).

Para exponer HTTPS **sin tocar prod**:

**Opción A — Túnel local**

```bash
cd site
# vars Preview en shell / .env.wa-entry.local
npm run dev:wa-entry
# túnel HTTPS → http://localhost:3030/api/wa-entry/webhook
```

**Opción B — Vercel Preview (no `--prod`)**  
Deploy de la rama con env Preview-only (`PLATFORM_WA_*` + Preview Supabase). Requiere autorización explícita de deploy Preview.

---

## 5. Contrato real del webhook

| Item | Valor |
| --- | --- |
| Header | `X-Webhook-Signature` = webhook secret (igualdad exacta) |
| Evento preferido | `messages.received` |
| Alternativa | `messages.upsert` (incluye fromMe) |
| Teléfono | `key.cleanedSenderPn` |
| Texto | `messageBody` |
| Id | `key.id` |
| ACK | HTTP 200 tras persistir/procesar en este diseño |

---

## 6. Segunda sesión

Ver `docs/whatsapp-universal-entry-secondary-session.md`.

- La cuenta **puede** crear otra sesión (API/docs), sujeta a límite del plan.
- **No conectamos** ningún número.
- Necesitas: número de prueba + QR + PAT/dashboard + webhook solo en esa sesión.

---

## 7. Mensajes

Sin cambios: bienvenida 1/2, consumidor → asistente `?ref=wa`, negocio → register/manage URLs oficiales. Sin Gemini en WhatsApp.

---

## 8. Requisitos exactos para prueba real allowlisted

1. Número de prueba + crear sesión secundaria (no ELMENUXFA1).  
2. Host HTTPS aislado (túnel o Vercel Preview) apuntando a `/api/wa-entry/webhook`.  
3. En **solo** esa sesión: webhook + secret + `messages.received`.  
4. Env aislado: `INBOUND=1`, `ROUTER=1`, `ADAPTER=preview_isolated`, store Preview, `ENFORCE_ALLOWLIST=1`, allowlist de dígitos.  
5. `ALLOW_REAL_WASENDER=0` mientras el sender aislado valide el flujo; autorización **posterior** para envío real.  
6. Backup/lectura de ELMENUXFA1 confirmando que **no** cambió.  
7. Un mensaje “Hola” desde número allowlisted → una respuesta → apagar flags.

---

## 9. Riesgos pendientes

- Límite de sesiones del plan Wasender.
- Exponer Preview service role en un host mal configurado.
- Activar envío real por error (mitigado: flag off + sender aislado por defecto en Preview).
- Túnel HTTPS efímero / URL Vercel Preview rotatoria.
- Diferencias menores de payload de la sesión real vs fixtures oficiales (mitigar con 1 captura allowlisted).

---

## 10. Evidencia de no tocar producción

- Migración solo `--remote=gsfxqzvmyzjjgpigrste`
- Tests Preview usan `.env.preview.*`, no escriben a `qqhbera…`
- Sin `vercel --prod`, sin merge, sin cambio de webhook ELMENUXFA1
- Sin uso de `wasender_message_queue` en el path aislado

---

## Comandos

```bash
cd site
npm run test:wa-entry
node ../site/scripts/wa-entry-preview-integration.mjs   # desde root: node site/scripts/...
npm run typecheck   # errores preexistentes de discovery pueden aparecer; wa-entry corregido
npm run dev:wa-entry
```
