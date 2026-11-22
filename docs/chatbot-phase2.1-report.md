# El Menú XFA — Informe Fase 2.1

**Fecha:** 2026-11-22  
**Alcance:** estabilización, seguridad y preparación para producción del chatbot  
**Restricciones respetadas:** sin funciones de compra; sin deploy; migraciones chatbot no aplicadas a producción; sin pruebas Gemini de costo real (sin `--authorize-live`); sin cambios a `pedidos_emergency_anon_insert`; sin facturación Plan Pro.

**Línea base de tests:** 569 → **578 aprobados** (+9).

---

## 1. Arquitectura final del control de cuotas

### Capas

| Capa | Rol |
|------|-----|
| `CHATBOT_QUOTA_BACKEND` | `filesystem` (dev) o `postgres` (producción por defecto) |
| Reserva previa a Gemini | Bloquea la llamada al modelo si no hay cupo |
| Contadores | Solicitudes, conversaciones, tokens in/out, errores, costo estimado |
| Tenant | Siempre el UUID resuelto en servidor (`loadPublicMenuByIdentifier`), nunca el body |

### Producción (PostgreSQL / Supabase)

1. `reserve_ai_chatbot_session(session_id, commerce_id, max)` — `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE` + incremento atómico; rechaza reuso cross-tenant y exceso de sesión.
2. `increment_ai_chatbot_usage(...)` — fila mensual por `(commerce_id, period_month)` con `FOR UPDATE`; rechaza si supera `p_max_requests` / `p_max_tokens`.
3. Opcional: `comercios.chatbot_enabled` + `CHATBOT_REQUIRE_COMMERCE_FLAG=1` (kill switch por restaurante).
4. RPCs `SECURITY DEFINER` solo para `service_role`. RLS sin políticas anon/authenticated.
5. **Separado** de `ai_usage_control` / créditos del panel Gemini (fotos).

La concurrencia se controla con bloqueos de fila en Postgres: dos requests simultáneos no pueden superar el cupo mensual.

### Desarrollo (filesystem)

- Ruta: `site/.data/chatbot-usage/` (o `CHATBOT_USAGE_DIR`).
- Locks por archivo para serializar reservas.
- **Prohibido en producción:** `isChatbotRuntimeAllowed` exige `quotaBackend === 'postgres'` cuando `NODE_ENV=production`.

### Fallo de cuota

HTTP 429/503 + `fallback.useTraditionalMenu: true` + mensaje amable. **No se llama a Gemini.**

---

## 2. Archivos creados y modificados

### Creados (Fase 2 + 2.1)

**API**

- `site/app/api/chat/[comercioId]/route.ts` — GET status + POST chat
- `site/app/api/chat/_lib/config.ts` — gates, modelo, límites
- `site/app/api/chat/_lib/quota.ts` — filesystem + postgres async
- `site/app/api/chat/_lib/schema.ts`, `prompt.ts`, `tools.ts`, `gemini.ts`

**UI / cliente**

- `site/app/_lib/chatbot-preview.ts`, `chatbot-session.ts`
- `site/app/v/[id]/_components/chat/*` (View, Header, Composer, MessageList, Bubble, ModeSwitcher)

**Migraciones (preparadas, no aplicadas)**

- `supabase/migrations/20261122120000_ai_chatbot_usage.sql`
- `supabase/migrations/20261122123000_ai_chatbot_usage_sessions.sql`

**Pruebas / harness / docs**

- `site/tests/chatbot-*.test.ts` (incl. `chatbot-phase21-security.test.ts`)
- `site/scripts/chatbot-live-smoke.mjs`
- `docs/chatbot-phase2-report.md`, `docs/chatbot-phase2.1-report.md`
- `docs/qa-screenshots/chatbot-phase2/`, `docs/qa-screenshots/chatbot-phase21/`

### Modificados en 2.1

- `site/app/api/chat/_lib/config.ts` — `quotaBackend`, `requireCommerceFlag`, gate postgres en prod
- `site/app/api/chat/_lib/quota.ts` — adapter dual + RPCs atómicos
- `site/app/api/chat/_lib/gemini.ts` — mapeo explícito 429 / 503
- `site/app/api/chat/[comercioId]/route.ts` — GET auth probe, cuota async, anti-spoof
- `site/app/v/[id]/_components/chat/ChatAssistantView.tsx` — `probeServerAuth`, banners
- `site/app/v/[id]/_components/chat/ChatHeader.tsx` — subtítulo “Modo demo” (móvil)
- `site/app/v/[id]/page.tsx` — `chatRuntimeEnabled={false}` + `probeServerAuth`
- Tests chatbot actualizados / ampliados

---

## 3. Migraciones SQL preparadas

| Archivo | Contenido | Estado |
|---------|-----------|--------|
| `20261122120000_ai_chatbot_usage.sql` | Tabla `ai_chatbot_usage` + `increment_ai_chatbot_usage` atómico | **No aplicada** |
| `20261122123000_ai_chatbot_usage_sessions.sql` | `comercios.chatbot_enabled`, `ai_chatbot_sessions`, `reserve_ai_chatbot_session`, refuerzo de increment | **No aplicada** |

Aplicar solo tras autorización explícita y con cuotas/config listas.

---

## 4. Pruebas de concurrencia y aislamiento

Cubiertas en `chatbot-phase21-security.test.ts` + suite chatbot:

- Dos restaurantes: tools no cruzan catálogos.
- 6 reservas concurrentes con cupo mensual 3 → 3 OK / 3 bloqueadas.
- Límite de mensajes por sesión.
- Errores DB postgres → `quota_unavailable` (sin Gemini).
- Schema: mensaje oversized rechazado.
- Contrato: tools sin instrucciones de carrito/pedido.
- Preview `NEXT_PUBLIC_*` no habilita runtime.
- Producción sin `CHATBOT_ALLOW_PRODUCTION` / sin postgres → bloqueo.
- Gemini 429 → `gemini_rate_limited`; 503 → `gemini_unavailable`.
- Historial por comercio (`chatbot-session.test.ts`).
- Tokens independientes de créditos foto (`chatbot-quota.test.ts`).

---

## 5. Seguridad de la API (`POST /api/chat/[comercioId]`)

| Control | Implementación |
|---------|----------------|
| Validación | Zod `chatRequestSchema`; path id longitud; último mensaje user no vacío |
| Aislamiento | Identidad **solo path** → `resolvedComercioId`; body `comercio_id` conflictivo → 403 |
| Comercio inválido / offline | 404 / 403 |
| Rate limit IP | `consumeRateLimit` (default 20/min) |
| Longitud mensaje / historial | `CHATBOT_MAX_MESSAGE_CHARS`, `MAX_HISTORY`, `MAX_MESSAGES_PER_REQUEST` |
| Tools | Solo lectura; rounds limitados; sin add_to_cart / create_order |
| Privacidad | Respuestas de error genéricas; GET no revela secretos ni paths internos |
| API key | Solo servidor (`GEMINI_API_KEY`); nunca `NEXT_PUBLIC_*` |
| Timeouts | `CHATBOT_TIMEOUT_MS` + AbortError → error tipado |
| Habilitación | `isChatbotRuntimeAllowed` + key + (opcional) `chatbot_enabled` |
| Cuota previa | Reserva antes de Gemini |

Ningún parámetro de URL/body autoriza saltarse gates del servidor.

**GET** `/api/chat/:id` solo reporta `{ authorized, reason, quotaBackend, model }` para que el UI sondee; no autoriza por sí solo.

---

## 6. Configuración exacta de Gemini

En `site/.env.local` (local; no commitear secretos):

```env
CHATBOT_ENABLED=1
# CHATBOT_ALLOW_PRODUCTION=1   # solo cuando se autorice prod
CHATBOT_QUOTA_BACKEND=filesystem   # local; en prod default = postgres
GEMINI_API_KEY=...                 # nunca publicar
# Opcionales:
# CHATBOT_GEMINI_MODEL=gemini-2.0-flash-lite
# CHATBOT_GEMINI_MODEL_FALLBACK=gemini-2.5-flash
# CHATBOT_TIMEOUT_MS=25000
# CHATBOT_MAX_OUTPUT_TOKENS=512
# CHATBOT_MAX_TOOL_ROUNDS=4
# CHATBOT_MAX_HISTORY_MESSAGES=24
# CHATBOT_MAX_MESSAGE_CHARS=800
# CHATBOT_RATE_LIMIT_PER_IP_PER_MIN=20
# CHATBOT_MAX_REQUESTS_PER_SESSION=40
# CHATBOT_MAX_MONTHLY_REQUESTS_PER_COMMERCE=500
# CHATBOT_MAX_MONTHLY_TOKENS_PER_COMMERCE=2000000
# CHATBOT_PRICE_INPUT_PER_1M=...
# CHATBOT_PRICE_OUTPUT_PER_1M=...
# CHATBOT_REQUIRE_COMMERCE_FLAG=1
```

UI preview (no autoriza Gemini):

```env
NEXT_PUBLIC_CHATBOT_PREVIEW=1
```

---

## 7. Modelo de Gemini utilizado

- **Primario (default):** `gemini-2.0-flash-lite` (`CHATBOT_GEMINI_MODEL`)
- **Fallback:** `gemini-2.5-flash` (`CHATBOT_GEMINI_MODEL_FALLBACK`)
- Integración: REST `generateContent` (sin SDK), tool-calling; separado del panel de fotos.

---

## 8. Estado de los controles de activación

### Capas (todas deben pasar para Gemini real)

1. **`CHATBOT_ENABLED=1`** — interruptor maestro de servidor  
2. **Entorno:** no-producción **o** `CHATBOT_ALLOW_PRODUCTION=1`  
3. **Cuota:** en producción exige backend `postgres`  
4. **`GEMINI_API_KEY`** presente  
5. **(Opcional)** `comercios.chatbot_enabled` si `CHATBOT_REQUIRE_COMMERCE_FLAG=1`

### Frontend vs backend

| Control | Efecto |
|---------|--------|
| `NEXT_PUBLIC_CHATBOT_PREVIEW` | Solo muestra shell/UI demo (“Probar asistente”) |
| `chatRuntimeEnabled={false}` en page | No asume live en el cliente |
| `probeServerAuth` | GET `/api/chat/:id` → si `authorized` false, permanece demo |
| Servidor POST | Revalida gates + cuota; preview flag **irrelevante** |

**Producción hoy:** chatbot permanece deshabilitado hasta autorización + cuotas persistentes + `CHATBOT_ALLOW_PRODUCTION` + key + migraciones.

---

## 9. Resultados de tests y typecheck

```
Vitest: 82 files, 578 tests passed
Baseline Fase 2: 569 → Fase 2.1: 578 (+9)
```

Typecheck: **sin errores nuevos en chat**. Errores preexistentes ajenos:

- `tests/dispatch-order-notification.test.ts`
- `tests/notify-merchant-new-order.test.ts`
- `tests/payment-method-display.test.ts`

---

## 10. Validación visual

Comercio: MEAL4FIT (`localhost:3001/v/meal4fit?chatbot=1`), viewport móvil ~390×844.

| Aspecto | Resultado |
|---------|-----------|
| Diseño móvil | OK — `100dvh` / safe-area |
| Encabezado restaurante | Logo + nombre; subtítulo acortado a “Modo demo” |
| Burbujas | User (primario) / assistant; scroll al final |
| Composer | Textarea autosize, Enter envía, safe-area bottom |
| Teclado | `enterKeyHint=send`; layout flex no empuja fuera del viewport |
| Historial / carrito | `sessionStorage` por comercio; carrito compartido con menú |
| Cambio menú ↔ chat | `?chatbot=1` / quitar param; “Ver menú” |
| Gemini no disponible | Banner ámbar + footer demo + mensaje amable |

Capturas: `docs/qa-screenshots/chatbot-phase21/`.

Corrección UI 2.1: subtítulo del header (“Asistente virtual · demo” truncaba mal en móvil → “Modo demo”).

---

## 11. Riesgos pendientes

1. Migraciones chatbot **no aplicadas** — prod no tiene tablas/RPCs de cuota.
2. `GEMINI_API_KEY` no validada en vivo en esta fase (sin autorización de costo).
3. Rate limit IP in-memory: en Vercel multi-instancia es blando; Postgres es la defensa dura de cuota.
4. `pedidos_emergency_anon_insert` sigue pendiente de auditoría en prod (ver §7 abajo / sección 15).
5. Precios oficiales Google de tokens: variables opcionales; verificar antes de cost accounting.
6. Comercio “cerrado” en horario: el chat público exige `en_linea`; ajustar política de negocio si se desea chat fuera de horario.

---

## 12. Instrucciones para probar Gemini con clave real

1. En `site/.env.local`: `GEMINI_API_KEY=…`, `CHATBOT_ENABLED=1`, `CHATBOT_QUOTA_BACKEND=filesystem`.
2. No commitear ni pegar la clave en el chat.
3. `npm run dev` (p. ej. puerto 3001).
4. Dry (sin costo):  
   `node --env-file=.env.local scripts/chatbot-live-smoke.mjs`
5. Live (genera costo; solo con autorización):  
   `node --env-file=.env.local scripts/chatbot-live-smoke.mjs --authorize-live --slug=meal4fit`
6. Revisar tokens en `site/.data/chatbot-usage/`.

**No ejecutado en esta fase** (sin `GEMINI_API_KEY` / sin `--authorize-live`).

---

## 13. Confirmación: sistema de pedidos no modificado

- Tools de chat: solo lectura.
- Respuestas API: `cart_actions: []`, `order_actions: []`.
- No se tocaron rutas `/api/orders`, RLS de pedidos ni flujos de checkout en esta fase.
- Cambios colaterales previos en el working tree (`order-item-snapshots`, etc.) **no forman parte del alcance 2.1 del chatbot**.

---

## 14. Confirmación: no se realizó deploy

Ningún deploy a Vercel/producción. Migraciones chatbot no aplicadas. Sin avance a Fase 3.

---

## 15. Política pendiente: `pedidos_emergency_anon_insert`

### Consulta SQL de solo lectura

```sql
select
  policyname,
  roles,
  cmd,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'pedidos'
  and policyname = 'pedidos_emergency_anon_insert';
```

Auditoría completa (también solo lectura) en:

`supabase/sql/proposed-drop-pedidos-emergency-anon-insert.sql`

### Procedimiento seguro posterior (requiere autorización)

1. Ejecutar auditorías de solo lectura en prod.
2. Confirmar que el checkout público usa solo `service_role` vía `POST /api/orders`.
3. Tras aprobación humana, aplicar DROP/REVOKE del archivo propuesto (transacción + plan de rollback documentado en el mismo SQL).
4. **No modificar todavía** — pendiente de autorización explícita.

---

## Cierre

Fase 2.1 lista para revisión. **Esperar aprobación antes de Fase 3** (compra) o de activar producción / migraciones / smoke live con costo.
