# El Menú XFA — Informe Fase 2 (Gemini conversacional, local)

**Fecha:** 2026-11-22  
**Entorno:** local (`next dev`), sin deploy  
**Comercio de prueba visual:** `meal4fit`

---

## A. Resumen

Se conectó la UI de Fase 1 a un motor conversacional de **solo lectura** vía `POST /api/chat/[comercioId]`, con Gemini en backend, tools sobre el catálogo real (`loadPublicMenuByIdentifier`), cuotas independientes del crédito de fotos, historial en `sessionStorage` y gates de servidor (`CHATBOT_ENABLED`). Sin carrito, pedidos ni pagos desde el chat.

## B. Arquitectura

- **Next.js Route Handler** (Node), no Edge Function: reutiliza menú público, Zod y rate-limit del site.
- Flujo: Cliente → `/api/chat/:slug|uuid` → gates + cuota + menú → Gemini (+ tools) → respuesta.
- La clave `GEMINI_API_KEY` solo en servidor. Sin clave → HTTP 503 con mensaje amable (no se inventa respuesta IA).

## C. Modelo

- Primario configurable: `CHATBOT_GEMINI_MODEL` (default `gemini-2.0-flash-lite`).
- Fallback: `CHATBOT_GEMINI_MODEL_FALLBACK` = `gemini-2.5-flash`.
- Separado de modelos de imagen.
- Tarifas: `CHATBOT_PRICE_INPUT_PER_1M` / `CHATBOT_PRICE_OUTPUT_PER_1M` (opcionales). **Pendiente verificación de precios oficiales de Google**; no se usa el factor `0.0005` de `ai-usage.ts`.

## D. Archivos creados / modificados

**Creados**

- `site/app/api/chat/[comercioId]/route.ts`
- `site/app/api/chat/_lib/config.ts`, `quota.ts`, `schema.ts`, `prompt.ts`, `tools.ts`, `gemini.ts`
- `site/app/_lib/chatbot-session.ts`
- `site/tests/chatbot-tools.test.ts`, `chatbot-quota.test.ts`, `chatbot-session.test.ts`, `chatbot-runtime.test.ts`
- `supabase/migrations/20261122120000_ai_chatbot_usage.sql` (**no aplicada a prod**)
- `docs/chatbot-phase2-report.md`
- Capturas: `docs/qa-screenshots/chatbot-phase2/`

**Modificados**

- `site/app/_lib/chatbot-preview.ts` (welcome runtime)
- `site/app/v/[id]/_components/chat/ChatAssistantView.tsx`, `ChatComposer.tsx`, `ChatHeader.tsx`
- `site/app/v/[id]/page.tsx` (wiring props)
- `site/.gitignore` (`.data/`)
- `site/.env.local` (solo flags `CHATBOT_*`, sin secretos en git)

## E. Tools (solo lectura)

`search_products`, `get_product_details`, `get_categories`, `get_business_information`, `get_available_fulfillment_methods`  
Máx. rounds: `CHATBOT_MAX_TOOL_ROUNDS` (default 4). IDs/precios desde snapshot del menú.

## F. Aislamiento multicliente

- Comercio resuelto **solo** desde el path.
- Body `comercio_id` distinto → 403 `tenant_spoof_rejected`.
- Tools amarrados a `resolvedComercioId`.
- Historial / sessionId en cliente keyed por comercio.

## G. Conversaciones

- `sessionStorage` (`elmenuxfa:chat-v1:<id>`), tope ~40 mensajes.
- Sobrevive menú ↔ chat (`router.replace`).
- “Nueva conversación” limpia historial + session id.

## H. Tokens / cuotas / costos

- **Independiente** de `ai_usage_control` / wallet de fotos.
- Store local: `site/.data/chatbot-usage/` (gitignored).
- Límites: IP/min, sesión, mensuales requests/tokens (env).
- Migración SQL lista para prod; **no ejecutada**.

## I. Seguridad

- Zod + límites de tamaño.
- Rate limit IP + cuota disco.
- Anti-spoof tenant, system prompt anti-injection.
- Errores genéricos al cliente; sin logs de conversación completa.
- Gate: `CHATBOT_ENABLED=1` + no-production (salvo `CHATBOT_ALLOW_PRODUCTION`, no usado).

## J. Pruebas

- Vitest: **569** tests OK (Fase 1: 550 → **+19**).
- Cobertura: tools, tenant, cuota, sesión, gates, mock Gemini timeout/respuesta.
- Smoke API local sin clave: **503** `gemini_unconfigured` con mensaje UX correcto.

## K. Typecheck

- **0 errores nuevos** en código Fase 2.
- Preexistentes (3 grupos / 4 errores):
  - `tests/dispatch-order-notification.test.ts`
  - `tests/notify-merchant-new-order.test.ts` (×2)
  - `tests/payment-method-display.test.ts`

## L. Capturas

- `docs/qa-screenshots/chatbot-phase2/01-chat-meal4fit.png` — chat abierto, nombre/logo MEAL4FIT, composer, disclaimer “no modifica el carrito”.
- `docs/qa-screenshots/chatbot-phase2/02-home-meal4fit.png` — home tras volver del chat; botón “Probar asistente”.

Verificado en desktop viewport vía browser MCP (no dispositivo físico). Layout usa `100dvh` + safe-area en composer.

## M. Consumo Gemini real

**No** se realizó prueba manual con API auténtica: `GEMINI_API_KEY` no está en `site/.env.local`.  
Para probar en vivo: añadir la clave y reiniciar `next dev`.

## N. Limitaciones pendientes

- Clave Gemini local pendiente del operador.
- Cuota en disco (no Postgres) hasta aplicar migración.
- Rate limit IP en memoria (igual que otras rutas del site).
- Precios oficiales del modelo pendientes de verificación.
- Emparejamiento fino imagen↔producto del menú (ajeno a Fase 2).
- No hay e2e Playwright dedicado; verificación visual manual + MCP.

## O. Confirmación: sin pedidos / sin carrito vía Gemini

- API responde `cart_actions: []`, `order_actions: []`.
- Tools sin escritura.
- UI no llama APIs de órdenes desde el chat.

## P. Confirmación: menú tradicional operativo

- Home MEAL4FIT carga; `?chatbot=1` abre asistente; “Menú” vuelve a home sin chatbot en query.
- Selector “Probar asistente” visible fuera del chat.

---

**NO DEPLOY. NO FASE 3.** Esperando revisión.
