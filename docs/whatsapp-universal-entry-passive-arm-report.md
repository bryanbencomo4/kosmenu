# Wa-entry — armado pasivo + webhook ELMENUXFA1

**Fecha:** 2026-11-23  
**Deployment:** `dpl_89nLTZKEByG7V5T5uUD9GkmFRWHe`  
**Sesión Wasender:** ELMENUXFA1 (`79701`)

---

## Estado Vercel (listo)

| Flag | Valor |
| --- | --- |
| `PLATFORM_WA_INBOUND` | `1` |
| `PLATFORM_WA_ROUTER` | `0` |
| `PLATFORM_WA_ALLOW_REAL_WASENDER` | `0` |
| `PLATFORM_WA_ADAPTER` | `wasender` |
| `PLATFORM_WA_STORE` | `supabase` |
| `PLATFORM_WA_ENFORCE_ALLOWLIST` | `1` |
| `PLATFORM_WA_ALLOWLIST_DIGITS` | vacío |
| `PLATFORM_WA_WEBHOOK_SECRET` | sincronizado con Wasender · fingerprint `5f99f12df7d2` |
| `PLATFORM_WA_PROD_SUPABASE_URL` | `https://qqhberaayhohxlbbhdyi.supabase.co` |

Health: `inboundEnabled=true`, `routerEnabled=false`, `realWasenderEnabled=false`, `webhookSecretConfigured=true`.

### Prueba pasiva firmada (sin WhatsApp real)

| Check | Resultado |
| --- | --- |
| Firma forjada | **401** `webhook_unauthorized` |
| Firma válida | **200** `router_off` · `replyCount=0` |
| Reintento mismo message id | **200** `duplicate` |
| Respuesta WhatsApp | **ninguna** |

La deduplicación confirma claim durable en Supabase producción (`wa_entry_seen_messages`).

### Superficies existentes

asistente / menú Trueno / directory / chat Trueno / business → **200**.

---

## Estado WaSender (acción pendiente del propietario)

Panel abierto: `wasenderapi.com/whatsapp/79701/webhook`.

**Antes no había webhook activo** (Endpoint OFF, URL vacía, 0 subscriptions) — confirmado.

Pendiente de guardar en el panel (la automatización de UI no pudo cerrar el toggle de forma fiable):

1. **Endpoint Settings → ON**  
2. **Payload URL exacta:** `https://elmenuxfa.com/api/wa-entry/webhook`  
   (evitar truncar en `…/wa-ent`)  
3. **Subscriptions:** solo `messages.received`  
4. **Ignore Groups / Broadcasts / Channels:** ON (ya lo están)  
5. **Webhook Secret** ya sincronizado en Vercel (fingerprint `5f99f12df7d2`) — debe ser el mismo que muestra Wasender  

6. **Save Changes**

Tras guardar, enviar **Hola** desde un teléfono de prueba ≠ +584220451906.

---

## Preparación respuesta real (bloqueada)

| Requisito | Estado |
| --- | --- |
| Credencial de envío ELMENUXFA1 | Presente en Supabase Edge (`WASENDER_API_KEY` / cola) — no en Vercel site env |
| Número allowlist autorizado | **Falta** — NO-GO primer envío real |
| `ROUTER=1` + `ALLOW_REAL=1` | No activados |

---

## GO / NO-GO

| Criterio | Resultado |
| --- | --- |
| Receptor prod pasivo operativo | **GO** |
| Auth + claim + dedupe sin replies | **GO** |
| Sistemas existentes intactos | **GO** |
| Webhook Wasender guardado/activo | **NO-GO** hasta Save en panel |
| Envío real / apertura pública | **NO-GO** |
