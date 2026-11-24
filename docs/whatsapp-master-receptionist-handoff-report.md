# CIERRE FINAL — Handoff WhatsApp → asistentes (elmenuxfa.com)

**Fecha:** 2026-11-24  
**Rama:** `feature/wa-master-assistant`  
**Base previa:** `f74d557`  
**Commit final:** *(ver `git rev-parse HEAD` tras el commit de este cierre)*  
**Producción:** sin deploy, sin migraciones, flags públicos sin activar.

---

## URL empresarial realmente implementada

| Capa | URL | Estado |
|------|-----|--------|
| Canónica (comerciante) | `https://app.elmenuxfa.com/asistente` | Implementada en **código Flutter** (`BusinessAssistantScreen` + ruta `/asistente`). **No se redeployó Flutter** (restricción de este cierre). El host vivo responde 200 con shell SPA/splash; la pantalla conversacional viaja en el próximo build Flutter habitual. |
| Fallback interno Next | `/asistente-negocio` (y rewrite `business.*/asistente`) | Operativo en local/Preview. No es la URL que se ofrece al comerciante. |
| Backend | `POST /api/asistente-negocio` | Bearer Supabase + handoff peek/consume. |
| Consumidor | `https://elmenuxfa.com/asistente` | Continuidad con seed/`#h=` + auto-búsqueda preparada. |

Enlaces Master por defecto: `PLATFORM_WA_BUSINESS_ASSISTANT_URL` → `https://app.elmenuxfa.com/asistente` (fragmento `#h=`).

---

## Método de integración con Flutter

**Decisión:** pantalla nativa Flutter en `/asistente` (misma SPA del panel), **sin redirect externo** a Next.

1. Reutiliza `Supabase.instance.client.auth` (misma sesión del panel).
2. Llama a Next `POST /api/asistente-negocio` con `Authorization: Bearer <access_token>`.
3. Lee `#h=` / `?h=` en boot (`peek`); consume en el primer envío del usuario.
4. Si no hay sesión: banner “Entrar” → `/` del panel; al autenticar, re-boot y recupera la solicitud.
5. Recarga: hash + sessionStorage del navegador; no depende de un segundo login si la sesión Supabase sigue válida.

`/asistente-negocio` queda solo como detalle interno / fallback Next.

---

## Resultado del handoff seguro

| Control | Resultado |
|---------|-----------|
| Código opaco (base64url ~18 bytes) | OK |
| TTL ~5 min | OK |
| Peek vs consume | OK — boot/preview = `peek`; acción usuario = `consume` |
| GET `/api/wa-handoff/redeem` | **405** (Playwright mobile+desktop) |
| Destino restringido | `consumer_discovery` \| `business_assistant` |
| Sin teléfono en URL | OK (`#h=` preferido; hash reduce referrer/logs) |
| Reutilización / manipulación | redeem atómico; mismatch → error |
| WhatsApp preview | no consume (sin GET redeem; peek no quema) |

---

## Continuidad de sesión

- **Autenticado + membresía:** consulta menú/precios/FX y propone cambios con enlace al panel.
- **Sin sesión:** saludo con solicitud preparada + `needsAuth`; no se pierde el handoff hasta TTL/consumo.
- **Sin membresía / no autorizado:** mensaje claro + registro panel; sin escritura.
- **WhatsApp digits:** solo señal contextual hasheada en store; nunca autorización de escritura.

---

## Funciones administrativas reales (lectura / propuesta)

- Consulta productos y precios (Supabase, scoped a comercio de la membresía).
- Consulta moneda / tasa.
- Info de negocio seleccionado (o lista si hay varios).
- Preparación de cambio de precio / alta de producto → **propuesta + transición al panel** (sin afirmar “completado”).
- Orientación a registro (`?tab=register`).
- Recuperación de solicitud desde handoff (`pendingOperation`, `conversationHint`, etc.).

## Funciones todavía pendientes

- APIs de **escritura** autorizadas (precio/producto/config) desde el asistente — hoy solo proponen + panel.
- **Build/deploy Flutter** que publique `BusinessAssistantScreen` en `app.elmenuxfa.com` (excluido de este cierre).
- Activación de flags en Preview/prod y tabla `wa_handoff_codes` en el entorno objetivo (Preview ya contemplada; prod no tocada).

---

## Pruebas

### Vitest / TypeScript

- `tsc --noEmit`: OK (superficies afectadas + casts WA entry).
- `wa-handoff-receptionist.test.ts`: 8/8.
- `asistente-negocio-api.test.ts`: 2/2.
- `wa-entry-router.test.ts`: 35/35.
- Suites Master relacionadas: orchestrator/closure OK.

### Playwright (móvil + escritorio) — local `:3023`

Script: `site/scripts/wa-handoff-assistants-playwright.mjs`  
Reporte JSON: `docs/wa-handoff-assistant-screenshots/wa-handoff-assistants-report.json`

| Recorrido | Resultado |
|-----------|-----------|
| Consumidor seed `q=hamburguesas&zone=Caracas` | Contexto “Retomo…”, draft preparado, sin 404 |
| Negocio Next `/asistente-negocio` | Chat shell + URL canónica visible |
| GET redeem | 405 |
| `app.elmenuxfa.com/asistente` | 200 (shell); conversación Flutter pendiente de build |

---

## Regresiones

- Sin cambios a WhatsApp oficial, router público, allowlist Master `584140821633`, menús/pedidos, Gemini Discovery, supervision, webhooks.
- Flags públicos **no** activados en producción.
- Deploy Flutter **no** modificado.
- Redirect externo como UX final: **no** usado.

---

## GO / NO-GO — piloto limitado

| Criterio | Veredicto |
|----------|-----------|
| Consumidor WA → `/asistente` con contexto | **GO** (Preview/local con flags) |
| Handoff seguro peek/consume | **GO** |
| Asistente negocio conversacional (API + Next fallback) | **GO** (Preview/local) |
| URL viva `app.elmenuxfa.com/asistente` con UI Flutter | **NO-GO hasta próximo build Flutter** (código listo; deploy diferido a propósito) |
| Producción / flags públicos / migraciones | **NO-GO** (explícito: no publicar) |

**Veredicto global piloto limitado:** **GO condicional en Preview** (Next + flags + handoff).  
**NO-GO producción** y **NO-GO URL Flutter viva** hasta rebuild del panel web.

Detenerse aquí — no publicar en producción.
