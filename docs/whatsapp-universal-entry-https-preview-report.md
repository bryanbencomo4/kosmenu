# Wa-entry — HTTPS Preview listo

**Fecha:** 2026-11-23  
**Rama:** `feature/wasender-universal-entry`  
**Deploy:** Vercel **Preview** only (`target: null` / Environment Preview) — **no** Production  
**Deployment ID:** `dpl_C2rcav2EHqqmfNcSGj1xF5S58NUP`

---

## URL HTTPS exacta

```text
https://kosmenu-s3mlwfs1x-bryanbencomo4s-projects.vercel.app/api/wa-entry/webhook
```

Health GET (mismo path):

```text
https://kosmenu-s3mlwfs1x-bryanbencomo4s-projects.vercel.app/api/wa-entry/webhook
```

Inspector: https://vercel.com/bryanbencomo4s-projects/kosmenu/C2rcav2EHqqmfNcSGj1xF5S58NUP

---

## Confirmación Supabase Preview

Health response (probado):

```json
{
  "ok": true,
  "module": "wa-entry",
  "inboundEnabled": false,
  "routerEnabled": false,
  "adapter": "preview_isolated",
  "storeKind": "supabase_preview",
  "previewProjectRef": "gsfxqzvmyzjjgpigrste",
  "realWasenderEnabled": false,
  "webhookSecretConfigured": true
}
```

- Store: `supabase_preview` → proyecto `gsfxqzvmyzjjgpigrste`
- Sender: `preview_isolated` (sin cola prod / sin wasenderapi)
- Credenciales de escritura: `PLATFORM_WA_PREVIEW_*` solamente

---

## Flags efectivos (este deploy)

| Flag | Valor |
| --- | --- |
| `PLATFORM_WA_INBOUND` | `0` |
| `PLATFORM_WA_ROUTER` | `0` |
| `PLATFORM_WA_ADAPTER` | `preview_isolated` |
| `PLATFORM_WA_STORE` | `supabase_preview` |
| `PLATFORM_WA_ALLOW_REAL_WASENDER` | `0` |
| `PLATFORM_WA_ENFORCE_ALLOWLIST` | `1` |
| `PLATFORM_WA_ALLOWLIST_DIGITS` | vacío |
| Webhook secret | configurado (fingerprint SHA256 `df92bb8b9170`) — valor solo en `site/.wa-entry-preview-deploy/` (gitignored) |

---

## Pruebas del webhook (PROBE_PASS)

Vía `vercel curl` (bypass de Deployment Protection para automatización):

| Caso | Resultado |
| --- | --- |
| GET health | 200 + Preview ref correcto |
| POST sin firma | **401** `webhook_unauthorized` |
| POST firma falsa | **401** `webhook_unauthorized` |
| POST firma válida | **200** `kill_switch` (flags apagados, sin procesar) |

Persistencia/dedupe con flags ON ya estaba **GO** en Preview DB (10/10 integración local). En este deploy, a propósito **no** se arma el router hasta la sesión secundaria.

Script: `node site/scripts/probe-wa-entry-preview.mjs`

---

## Instrucciones — conectar sesión WaSender secundaria

**No crear sesión todavía sin tu autorización explícita.** Cuando autorices:

1. Crear sesión de prueba (número + QR) — ver `docs/whatsapp-universal-entry-secondary-session.md`. **No tocar ELMENUXFA1.**
2. **Resolver Deployment Protection de Vercel Preview** (bloqueante para Wasender):
   - Opción A: desactivar “Vercel Authentication” solo para Preview, o  
   - Opción B: crear **Protection Bypass for Automation** y usar  
     `https://kosmenu-s3mlwfs1x-bryanbencomo4s-projects.vercel.app/api/wa-entry/webhook?x-vercel-protection-bypass=<SECRET>`
3. En la sesión secundaria solamente:
   - Webhook URL = la URL de arriba (con bypass si aplica)
   - Eventos: `messages.received`
   - Webhook Secret = el mismo valor que `PLATFORM_WA_WEBHOOK_SECRET` del deploy Preview (archivo local gitignored; fingerprint `df92bb8b9170`)
4. Redeploy Preview (o env) con:
   - `PLATFORM_WA_INBOUND=1`
   - `PLATFORM_WA_ROUTER=1`
   - `PLATFORM_WA_ALLOWLIST_DIGITS=<tus dígitos de prueba>`
   - seguir `ALLOW_REAL_WASENDER=0` (sender aislado; sin mensajes reales por WaSender)
5. Probar un “Hola” desde número allowlisted → verificar fila en Preview `wa_entry_*`.
6. Apagar flags si algo falla.

---

## GO / NO-GO

| Pregunta | Veredicto |
| --- | --- |
| ¿HTTPS Preview disponible y aislado de prod? | **GO** |
| ¿Usa Supabase Preview + sender aislado? | **GO** |
| ¿Flags apagados / sin respuestas automáticas? | **GO** |
| ¿Auth de secreto verificada? | **GO** |
| ¿Listo para prueba real limitada con sesión secundaria? | **NO-GO** hasta: (1) tu autorización de crear sesión, (2) bypass/desactivar Deployment Protection para Wasender, (3) encender flags + allowlist en un redeploy Preview, (4) autorización posterior para envío real |

**ELMENUXFA1 / webhook principal / dominios públicos / cola prod:** no modificados.

---

## Nota de seguridad

Durante la preparación, un comando de PowerShell imprimió accidentalmente material sensible en el log del agente. El **webhook secret fue regenerado** antes del deploy actual (fingerprint `df92bb8b9170`). Si el transcript se compartió, conviene rotar también la **service role de Preview** desde el dashboard de Supabase Preview.
