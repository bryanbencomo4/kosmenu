# Wa-entry — informe de despliegue controlado (producción)

**Fecha:** 2026-11-23  
**Rama:** `feature/wasender-universal-entry`  
**Deployment activo:** `dpl_Bh2tTkXUrpr7ZWe8ZEwV2RcY7PLN`  
**URL:** https://elmenuxfa.com (alias) / https://kosmenu-fcgi6bajc-bryanbencomo4s-projects.vercel.app

---

## GO / NO-GO

| Criterio | Resultado |
| --- | --- |
| Código wa-entry en producción, bot apagado | **GO** |
| Schema router solo-objetos propios en Supabase prod | **GO** |
| Flags OFF (inbound/router/real) | **GO** |
| Menús / asistente / directory / Trueno chat | **GO** |
| Auth webhook fail-closed sin secreto | **GO** (401 `webhook_secret_required`) |
| Inspección real webhook ELMENUXFA1 | **NO-GO** — falta Personal Access Token Wasender |
| Apuntar webhook ELMENUXFA1 | **NO-GO** — sin backup del URL/eventos actuales |
| Allowlist / envío real | **NO-GO** — falta número de prueba autorizado |
| Apertura pública | **NO-GO** |

**Veredicto:** bot **restringido / OFF**. Continuidad operativa preservada.  
**Detenido** antes de modificar ELMENUXFA1 y antes del primer envío real.

---

## 1. Commit / deployment

| Campo | Valor |
| --- | --- |
| HEAD local al deploy | `d290c65` + cambios locales wa-entry (store prod, recepción pasiva, health) |
| Deployment ID | `dpl_Bh2tTkXUrpr7ZWe8ZEwV2RcY7PLN` |
| Previo prod | `dpl_8uu2Xykhop2TGftXj8hNUvWX198X` |
| Rollback código | redesplegar deployment previo o `vercel rollback` |

---

## 2. Flags efectivos (producción)

| Flag | Valor |
| --- | --- |
| `PLATFORM_WA_INBOUND` | `0` |
| `PLATFORM_WA_ROUTER` | `0` |
| `PLATFORM_WA_ADAPTER` | `wasender` |
| `PLATFORM_WA_STORE` | `supabase` |
| `PLATFORM_WA_ALLOW_REAL_WASENDER` | `0` |
| `PLATFORM_WA_ENFORCE_ALLOWLIST` | `1` |
| `PLATFORM_WA_ALLOWLIST_DIGITS` | vacío |
| `PLATFORM_WA_WEBHOOK_SECRET` | **no configurado** |
| `PLATFORM_WA_PROD_PROJECT_REF` | `qqhberaayhohxlbbhdyi` |

Health live:

```json
{"ok":true,"inboundEnabled":false,"routerEnabled":false,"adapter":"wasender","storeKind":"supabase","prodProjectRef":"qqhberaayhohxlbbhdyi","realWasenderEnabled":false,"allowlistCount":0,"enforceAllowlist":true,"webhookSecretConfigured":false}
```

---

## 3. Webhook ELMENUXFA1 — estado

| Aspecto | Estado |
| --- | --- |
| Receptor inbound en nuestro backend (antes) | **No existía** (solo cola outbound) |
| URL webhook actual en Wasender | **Desconocida** — `WASENDER_API_KEY` en Vercel está vacío; listar sesiones exige **Personal Access Token** |
| URL candidata (aún no apuntada) | `https://elmenuxfa.com/api/wa-entry/webhook` |
| Método de integración previsto | **Prioridad A:** el mismo endpoint wa-entry es el primer receptor inbound; outbound (pedidos/supervisión) **no depende** del webhook |
| Dual-dispatch | No necesario si el webhook actual está vacío/nulo; **no aplicar** sin backup |
| Secreto | Pendiente de lectura en consola Wasender → `PLATFORM_WA_WEBHOOK_SECRET` |

**No se modificó** la sesión ELMENUXFA1.

---

## 4. Persistencia

| Check | Resultado |
| --- | --- |
| SQL | `supabase/migrations/20261124013000_wa_entry_router.sql` |
| Aplicado a | `qqhberaayhohxlbbhdyi` (solo tablas/RPC `wa_entry_*`) |
| RLS | habilitado; sin policies anon/auth; service_role only |
| Claim atómico | `wa_entry_try_claim_message` |
| Pedidos / cola / supervisión / discovery | no tocados |
| Preview store como backend prod | **no** |

---

## 5. WaSender real / latencia / duplicados

| Métrica | Valor |
| --- | --- |
| Envíos reales del router | **0** (no autorizados / flags OFF) |
| Recepción real | **0** (webhook no apuntado) |
| Latencia health | ~130–140 ms |
| Duplicados | N/A (sin tráfico inbound) |
| Errores auth | 401 esperado sin secreto |

---

## 6. Servicios existentes (post-deploy)

| Superficie | HTTP |
| --- | --- |
| `elmenuxfa.com/asistente` | 200 |
| `/v/pizzas-el-trueno` | 200 |
| `/api/comercios/directory` | 200 |
| `/api/chat/pizzas-el-trueno` | 200 (`authorized=true`) |
| `business.elmenuxfa.com` | 200 |
| `/api/wa-entry/webhook` GET | 200 (flags OFF) |

---

## 7. Tests locales

- Vitest wa-entry router + Preview integration: **38/38**
- Recepción pasiva (`inbound=1`, `router=0` → `router_off` + claim): cubierta

---

## 8. Rollback rápido (preparado)

1. Flags: poner `PLATFORM_WA_INBOUND=0` y `PLATFORM_WA_ROUTER=0` (ya están).  
2. Si se hubiera cambiado el webhook Wasender: restaurar URL/eventos del backup (aún no hay cambio).  
3. Código: redeploy de `dpl_8uu2Xykhop2TGftXj8hNUvWX198X` si el módulo nuevo fallara.  
4. No DROP de tablas `wa_entry_*`.  
5. No desconectar ELMENUXFA1.

---

## 9. Bloqueadores para continuar (imprescindibles)

1. **Personal Access Token Wasender** (o captura de consola) para leer:
   - `webhook_url` / `webhook_enabled` / `webhook_events` / fingerprint del secret de **ELMENUXFA1**
2. **Número(s) de prueba allowlist** (dígitos E.164) distintos del flujo público — no inventados.
3. Tras backup: configurar `PLATFORM_WA_WEBHOOK_SECRET` y, solo si el URL actual es vacío o confirmamos Priority A, apuntar a  
   `https://elmenuxfa.com/api/wa-entry/webhook` con eventos `messages.received` (y los que ya tuviera, si aplica).

### Activación prevista (cuando entregues 1–2)

1. Etapa 1: `INBOUND=1` `ROUTER=0` — recepción pasiva + claim durable.  
2. Etapa 2: `ROUTER=1` + allowlist + `ALLOW_REAL_WASENDER=0` primero, luego `1` solo allowlist.  
3. Etapa 3: prueba real Hola→1→2→MENÚ.  
4. Apertura pública solo si cuotas/allowlist/kill-switch se demuestran entre instancias.

---

## 10. Confirmación

**El bot quedó OFF / restringido por seguridad.**  
No hay respuestas automáticas. No se alteró el webhook de ELMENUXFA1. Las ventas/menús/Discovery/supervisión Trueno siguen operativos.
