# Wa-entry — preparación para prueba real (sin tocar producción)

**Rama:** `feature/wasender-universal-entry`  
**Fecha:** 2026-11-23  
**Estado:** preparado para revisión del propietario · **NO-GO** para prueba real hasta resolver bloqueantes  
**Hecho:** contrato proveedor documentado en código, auth Wasender, persistencia Preview SQL, adaptador de envío preparado (off), bot vs humano, 27 tests Vitest  
**No hecho:** deploy, migración Preview aplicada, cambio de webhook ELMENUXFA1, envío real

---

## Veredicto

| Pregunta | Respuesta |
| --- | --- |
| ¿Listo para simulación local? | **Sí** (`npm run test:wa-entry`, `/dev/wa-entry`) |
| ¿Listo para primera prueba real entre números autorizados **sin afectar producción**? | **NO** — ver bloqueantes exactos abajo |
| ¿Se puede reemplazar el webhook de ELMENUXFA1? | **No autorizado** y además **rompe** el modelo de 1 URL por sesión |

---

## 1. Contrato real de mensajes entrantes (proveedor)

Fuentes oficiales consultadas:

- [Webhook setup](https://www.wasenderapi.com/api-docs/webhooks/webhook-setup) — auth
- [messages.upsert](https://www.wasenderapi.com/api-docs/webhooks/webhook-message-upsert)
- [messages.received](https://www.wasenderapi.com/api-docs/webhooks/webhook-message-received)
- [How to receive messages](https://wasenderapi.com/api-docs/getting-started/how-to-receive-messages-and-media-from-wasenderapi)
- [Update session](https://www.wasenderapi.com/api-docs/sessions/update-whatsapp-session) — un `webhook_url` por sesión

### Auth

| Campo | Valor documentado |
| --- | --- |
| Header | `X-Webhook-Signature` |
| Verificación | **igualdad exacta** con el Webhook Secret de la sesión (no HMAC del body) |

Implementado en `site/app/api/wa-entry/_lib/auth.ts` (`mode: wasender_signature`), además de modos locales `X-Platform-Wa-*`.

### Payload (normalizado en `contract.ts`)

| Evento | Forma de `data.messages` | Uso |
| --- | --- | --- |
| `messages.received` | objeto único | Solo entrantes (preferible) |
| `messages-personal.received` | objeto | Solo 1:1 |
| `messages.upsert` | **array** | Entrantes + salientes (`fromMe`) |

Campos preferidos: `key.id`, `key.fromMe`, `key.cleanedSenderPn`, `messageBody`.  
`remoteJid` puede ser `@lid` — no usarlo como teléfono.

**Pendiente de captura real ELMENUXFA1:** confirmar si la sesión emite `sessionId` en el body y si el secret actual ya está configurado en consola. El normalizer ya acepta ausencia de `sessionId`.

---

## 2. Persistencia compartida (Preview)

SQL preparado (no aplicado):

`supabase/preview-bootstrap/12-wa-entry-router.sql`

Tablas: `wa_entry_threads`, `wa_entry_seen_messages`, `wa_entry_outbound`, `wa_entry_send_locks`  
RPCs atómicos: `wa_entry_try_claim_message`, `wa_entry_match_bot_echo`, `wa_entry_try_acquire_send_lock`, `wa_entry_release_send_lock`

Script guardado:

```bash
CONFIRM_WA_ENTRY_PREVIEW=1 node site/scripts/apply-wa-entry-preview-schema.mjs
```

Solo acepta ref `gsfxqzvmyzjjgpigrste`. **No se ejecutó** en esta sesión.

Store TS: `createSupabasePreviewAsyncStore` + `PLATFORM_WA_STORE=supabase_preview` + URL/key Preview dedicadas.

---

## 3. Adaptador de envío real (preparado, off)

`createPreparedWasenderSender`:

- Reutiliza `sendWhatsappText` → RPC `enqueue_wasender_message` con `source: platform-wa-entry`
- Registra outbound bot **antes** del enqueue (anti-eco)
- Exige `PLATFORM_WA_ALLOW_REAL_WASENDER=1` + `PLATFORM_WA_ALLOWLIST_DIGITS`
- **Default: off** (`createRefusingWasenderSender` / adapter `sim`)

Riesgo inherente: la cola kick apunta al worker de **producción** (`qqhbera…`). Cualquier enable real usa las API keys WaSender ya existentes → mismo número/sesión.

---

## 4. Bot vs operador humano

| Señal | Comportamiento |
| --- | --- |
| `fromMe` + texto coincide outbound bot reciente (`echoWindowMs`) | `bot_echo` — **no** pausa humana |
| `fromMe` sin match | `human_handling` + TTL |
| Entrante durante pausa humana | ignore |

---

## 5. ¿Webhooks independientes?

**No.** Documentación de sesión: un solo campo `webhook_url` / `webhook_enabled` / `webhook_events[]` por sesión.

Implicación: **no** se puede suscribir el router a ELMENUXFA1 en paralelo al webhook actual sin:

1. **Dual-dispatch proxy** (una URL que reenvía al endpoint actual + al wa-entry), o  
2. **Sesión WaSender secundaria** solo para pruebas, o  
3. Reemplazar el webhook (prohibido).

Diseño dual-dispatch: `docs/whatsapp-universal-entry-dual-dispatch.md` (no desplegado, no enlazado a ELMENUXFA1).

---

## 6. Pruebas ejecutadas

```text
npm run test:wa-entry  →  27 passed
```

Incluye: flujos 1/2, dedupe, race, retry, kill switch, grupo/status, firma Wasender, contrato oficial received/upsert, bot_echo vs human, allowlist, sender preparado, rechazo Preview→prod.

---

## 7. Bloqueantes exactos para prueba real autorizada

Ordenados por dependencia:

| # | Bloqueante | Por qué bloquea | Cómo desbloquear (requiere autorización nueva) |
| --- | --- | --- | --- |
| **B1** | **Una sola `webhook_url` por sesión** | No hay forma documentada de añadir wa-entry sin tocar la URL activa de ELMENUXFA1 | Autorizar **proxy dual-dispatch** (cambio único y reversible de URL) **o** sesión secundaria de prueba |
| **B2** | **URL pública HTTPS** para recibir webhooks | Localhost no es alcanzable por Wasender | Túnel seguro temporal (p.ej. Cloudflare Tunnel) hacia `localhost:3030` **o** Preview deploy **aislado** (no prod) |
| **B3** | **Schema Preview no aplicado** | Store `supabase_preview` fallaría sin tablas/RPCs | Ejecutar `apply-wa-entry-preview-schema.mjs` con `CONFIRM_WA_ENTRY_PREVIEW=1` (solo Preview) |
| **B4** | **Credenciales Preview dedicadas** | Faltan `PLATFORM_WA_PREVIEW_SUPABASE_URL` + `SERVICE_ROLE` en entorno local | Crear/usar service role Preview (nunca prod) en `.env.wa-entry.local` |
| **B5** | **Allowlist de números** | Sin `PLATFORM_WA_ALLOWLIST_DIGITS` el adaptador real se niega | Listar dígitos E.164 de números propios autorizados |
| **B6** | **Webhook secret real de la sesión** | Auth exige `X-Webhook-Signature` = secret de consola | Leer secret en dashboard Wasender (solo lectura) y mapear a `PLATFORM_WA_WEBHOOK_SECRET` |
| **B7** | **Confirmación de webhook actual** | Sin backup del URL/eventos actuales, un proxy mal configurado puede romper notificaciones/supervisión | Lectura/backup de config ELMENUXFA1 antes de cualquier cambio |
| **B8** | **Cola outbound = prod** | `sendWhatsappText` / kick worker usan proyecto prod | Aceptar envíos allowlisted por la cola existente **o** construir sender HTTP directo aislado (nuevo trabajo, aún no hecho) |
| **B9** | **Flags explícitos** | Fail-closed | `PLATFORM_WA_INBOUND=1`, `ROUTER=1`, `ADAPTER=wasender`, `ALLOW_REAL_WASENDER=1`, `ENFORCE_ALLOWLIST=1` solo en el proceso de prueba |
| **B10** | **Captura real de un payload ELMENUXFA1** | Fixtures oficiales del proveedor pueden diferir en campos de sesión | Tras B1–B2, loguear un evento allowlisted (sin PII en logs) y fijar fixture |

### Mínimo viable para prueba allowlisted (propuesta)

1. Autorizar **sesión secundaria** *o* **proxy dual-dispatch** con backup del webhook actual.  
2. Aplicar SQL **solo Preview** + credenciales Preview.  
3. Túnel → `/api/wa-entry/webhook`.  
4. Flags + allowlist de 1–2 números propios.  
5. Un mensaje “Hola” → verificar una respuesta → apagar flags.

Hasta que B1 y B2 estén resueltos con autorización explícita, **no hay prueba real segura**.

---

## 8. Evidencia de no tocar producción

- No `vercel --prod`, no push, no merge a rama publicada.
- No migraciones sobre `qqhberaayhohxlbbhdyi`.
- Script Preview exige `CONFIRM_WA_ENTRY_PREVIEW=1` y rechaza prod.
- No se cambió webhook ELMENUXFA1.
- Mensajes/enlaces del router: sin cambios de copy.

---

## 9. Cómo probar ahora (solo local)

```bash
cd site
npm run test:wa-entry
npm run dev:wa-entry
# http://localhost:3030/dev/wa-entry
```

---

## 10. GO / NO-GO

**NO-GO** para prueba real / publicación.  
**GO** para que el propietario pruebe el simulador y revise el plan de desbloqueo B1–B10.

Detenido aquí a la espera de autorización para: (a) proxy dual-dispatch o sesión secundaria, y/o (b) apply Preview schema.
