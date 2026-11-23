# Wa-entry — listo para vincular sesión secundaria (recepción)

**Fecha:** 2026-11-23  
**Rama:** `feature/wasender-universal-entry`  
**Sin:** prod deploy, migraciones prod, cambios a webs, ELMENUXFA1, WhatsApp real

---

## GO / NO-GO

| Criterio | Resultado |
| --- | --- |
| Escrituras solo Supabase Preview | **GO** |
| Secreto filtrado invalidado + nuevo fuera de Git | **GO** |
| Bypass Vercel dedicado + acceso público estilo WaSender | **GO** |
| Auth webhook (401 forjado / 200 kill_switch) | **GO** |
| Flags idle (sin auto-respuesta) | **GO** |
| Sesión secundaria creada | **NO** (a propósito) |
| Prueba real de recepción ejecutada | **NO** — falta vincular sesión + allowlist + armar |

**Veredicto:** **GO para vincular** `ELMENUXFA-WA-ENTRY-TEST` según el procedimiento.  
**NO-GO** para envío real / armar router hasta que indiques dígitos allowlist y autorices el arm.

---

## 1. Seguridad Preview

Auditoría (`node site/scripts/wa-entry-preview-security-audit.mjs`) → **pass**.

| Check | Estado |
| --- | --- |
| `PLATFORM_WA_PREVIEW_*` → `gsfxqzvmyzjjgpigrste` | OK |
| Adapter `preview_isolated` (sin cola prod) | OK |
| `ALLOW_REAL_WASENDER=0` | OK |
| Secret viejo `4bcf97…` ≠ actual | OK (invalidado) |
| Secret actual fingerprint | `df92bb8b9170` |
| Secret no en Git / docs | OK |
| `vercel-preview.env` gitignored | OK |

Health Preview confirma `previewProjectRef=gsfxqzvmyzjjgpigrste`, `storeKind=supabase_preview`, `realWasenderEnabled=false`.

---

## 2. Vercel Deployment Protection

**Mecanismo oficial:** [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)

- Creado secreto dedicado note: **`wa-entry-wasender-preview`**
- Fingerprint bypass: `15338f6a9e8e`
- SSO del proyecto: `all_except_custom_domains` (Preview `*.vercel.app` protegido; dominios custom de prod no usan ese SSO)
- **No** se desactivó la protección global

**WaSender:** no soporta header custom de Vercel → URL con query:

```text
https://<preview>/api/wa-entry/webhook?x-vercel-protection-bypass=<secret>
```

URL completa (con bypass) guardada **solo** en:

`site/.wa-entry-preview-deploy/wasender-webhook-url.local.txt` (gitignored)

**Limitación Vercel:** el bypass es válido en deployments protegidos del proyecto (no “solo Preview” a nivel de producto). Mitigación: secreto dedicado + revocable + solo en sesión secundaria + no en Git.

**Prueba pública (sin `vercel curl`):** bare URL bloqueada (HTML); con bypass → health JSON + auth webhook OK.

---

## 3. URL HTTPS utilizable por WaSender

Base (sin bypass — bloqueada por SSO):

```text
https://kosmenu-s3mlwfs1x-bryanbencomo4s-projects.vercel.app/api/wa-entry/webhook
```

URL operativa para Wasender: archivo local `wasender-webhook-url.local.txt`.

---

## 4. Flags actuales (deploy idle)

| Flag | Valor |
| --- | --- |
| INBOUND / ROUTER | `0` / `0` |
| ADAPTER | `preview_isolated` |
| STORE | `supabase_preview` |
| ALLOW_REAL_WASENDER | `0` |
| ENFORCE_ALLOWLIST | `1` |
| ALLOWLIST | vacío (idle) |

---

## 5. Sesión secundaria (preparada, no creada)

Ver `docs/whatsapp-universal-entry-secondary-session.md`.

- Nombre: `ELMENUXFA-WA-ENTRY-TEST`
- Número ≠ +584220451906
- Eventos: `messages.received`
- Secret webhook = fingerprint `df92bb8b9170`
- **No tocar ELMENUXFA1**

---

## 6. Primera prueba (solo recepción) — procedimiento

1. Crear/conectar sesión secundaria (tu autorización).  
2. Pegar URL de `wasender-webhook-url.local.txt` + secret.  
3. Armar Preview:

```powershell
$env:CONFIRM_WA_ENTRY_ARM_RECEPTION='1'
$env:PLATFORM_WA_ALLOWLIST_DIGITS='<dígitos-prueba>'
node site/scripts/arm-wa-entry-reception-preview.mjs
```

4. Enviar **Hola** desde número allowlisted.  
5. Verificar Preview: `wa_entry_seen_messages`, thread, outbound `simulated_ok`.  
6. **No** hay WhatsApp de respuesta real.

Persistencia antes de ACK: ya implementada (claim+process → luego 200; 500 invita reintento).

---

## 7. Segunda prueba (futura)

Bienvenida real con API key de la sesión secundaria — **requiere nueva autorización**; sin cola prod.

---

## 8. Riesgos

- Query bypass puede aparecer en logs de proxies → rotar/revocar tras la prueba.  
- Hostname Preview cambia en cada redeploy → regenerar URL local (el script de arm lo refresca).  
- Bypass project-wide: no usar en ELMENUXFA1; revocar al terminar.
