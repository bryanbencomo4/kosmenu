# Sesión WaSender secundaria — ELMENUXFA-WA-ENTRY-TEST

**Estado:** configuración preparada · **sesión NO creada ni conectada**  
**Prohibido:** modificar ELMENUXFA1 (webhook, eventos, secret, QR, estado).

---

## Objetivo

Recibir en Preview mensajes de un **número de prueba distinto de +584220451906**, validarlos y persistirlos en Supabase Preview, con salida **simulada** (`ALLOW_REAL_WASENDER=0`).

---

## Requisitos antes de vincular

1. Endpoint HTTPS Preview vivo (ver `docs/whatsapp-universal-entry-real-test-ready-report.md`).
2. Bypass de automatización Vercel dedicado (`wa-entry-wasender-preview`) guardado localmente en:
   - `site/.wa-entry-preview-deploy/wasender-webhook-url.local.txt` (gitignored)
3. Secret de webhook Wa-entry (fingerprint `df92bb8b9170`) en el mismo dir gitignored.
4. Dígitos E.164 del número de prueba (allowlist).
5. Autorización explícita del propietario para **crear** la sesión y, después, para **armar** recepción.

---

## Qué debes hacer tú (cuando autorices)

### A. Crear sesión (dashboard Wasender)

1. WhatsApp Sessions → **Create Session**
2. Name: `ELMENUXFA-WA-ENTRY-TEST`
3. Phone: número de prueba (≠ +584220451906)
4. `account_protection`: true  
5. `log_messages`: true (opcional)
6. Webhook: **aún vacío** hasta tener la URL con bypass
7. Guardar → escanear **QR** con el teléfono de prueba  
8. Confirmar estado `connected`

### B. Configurar webhook (solo esa sesión)

1. Abrir `site/.wa-entry-preview-deploy/wasender-webhook-url.local.txt`
2. Pegar esa URL completa en el webhook de **ELMENUXFA-WA-ENTRY-TEST**
3. Events: **`messages.received`** (preferible)
4. Webhook Secret: el valor de `PLATFORM_WA_WEBHOOK_SECRET` del archivo local `vercel-preview.env` (mismo fingerprint `df92bb8b9170`)
5. Guardar

### C. Armar recepción Preview (sin envío real)

```powershell
cd <repo>
$env:CONFIRM_WA_ENTRY_ARM_RECEPTION='1'
$env:PLATFORM_WA_ALLOWLIST_DIGITS='58412XXXXXXX'   # solo números de prueba
node site/scripts/arm-wa-entry-reception-preview.mjs
```

Efecto:

- `INBOUND=1` `ROUTER=1`
- `ALLOW_REAL_WASENDER=0` (outbound simulado en Preview)
- allowlist obligatoria
- redeploy Preview (nunca `--prod`)

### D. Primera prueba

Desde el número allowlisted: enviar **Hola**  
Esperado: fila en Preview `wa_entry_seen_messages` + thread + outbound `simulated_ok`  
**No** llega WhatsApp real de vuelta.

### E. Apagado

- Flags a 0 + redeploy idle, o  
- Revocar bypass `wa-entry-wasender-preview` en Vercel, o  
- Deshabilitar webhook en la sesión secundaria

---

## Segunda fase (posterior, requiere nueva autorización)

Envío real de bienvenida con **API key de la sesión secundaria**, sin cola `wasender_message_queue` de producción.
