# Auditoría — Acceso universal por WhatsApp (+584220451906)

**Fecha:** 2026-11-23  
**Modo:** solo lectura (sin cambios de código, sin deploy, sin migraciones, sin mensajes reales, sin llamadas facturables a Gemini).  
**Repo:** monorepo `bryanbencomo4/kosmenu` (`kosmenu_app`).  
**Rama observada:** `feature/chat-supervision-human` (código local; prod puede diferir según deploy).

---

## Resumen ejecutivo

1. **Un monorepo, dos runtimes:** Next.js (`site/`) en Vercel proyecto **`kosmenu`** sirve `elmenuxfa.com`, `business.elmenuxfa.com` y `admin.elmenuxfa.com`. Flutter (`lib/`) sirve **`app.elmenuxfa.com`** (no es el deploy Vercel de `site/`).
2. **WaSender en este repo es solo salida (outbound).** Cola `wasender_message_queue` → Edge Function `process-wasender-queue` → `https://www.wasenderapi.com/api/send-message`. **No existe handler de webhook de recepción** de mensajes entrantes en el código auditado.
3. El número **`+584220451906`** está definido como WhatsApp de marketing/soporte (`DEFAULT_MARKETING_WHATSAPP_DIGITS`) y como dígitos de plataforma que **nunca** deben usarse como destino de avisos de supervisión (`PLATFORM_SUPPORT_WHATSAPP_DIGITS`).
4. La sesión **`ELMENUXFA1` no aparece en el código**; solo hay `WASENDER_API_KEY` / `WASENDER_API_KEY_SECONDARY` / endpoint opcional.
5. **Discovery de restaurantes ya tiene API reutilizable:** `GET /api/comercios/directory?mode=clientes` (+ geo Haversine, horarios, productos).
6. **Registro de comercios y CRUD de menú viven mayormente en Flutter + Supabase (RLS)**, no en APIs conversacionales listas.
7. **PWA:** Flutter web tiene `web/manifest.json`; **elmenuxfa.com / business no son instalables** (sin web app manifest ni service worker en Next).
8. **Recomendación:** Etapa 1 = router WhatsApp mínimo (bienvenida + enlaces firmados/UTM a webs existentes) en un **nuevo** path de inbound aislado de la cola outbound; Etapa 2 = asistente web de discovery; Etapa 3 = comercial; Etapa 4 = admin autenticado en panel. **No** automatizar el número principal como chatbot Gemini completo en la primera entrega.

**Esta auditoría no construye nada.** Detenerse aquí hasta decisión del propietario.

---

## 1. Arquitectura existente

### 1.1 ¿Mismo repositorio?

| Pieza | Evidencia |
| --- | --- |
| Un git remoto | `origin` → `https://github.com/bryanbencomo4/kosmenu.git` |
| Flutter | `pubspec.yaml` (`kosmenu_app`), código en `lib/` |
| Next.js | `site/package.json` (`kosmenu-site`) |
| Supabase | `supabase/migrations/`, `supabase/functions/` |
| Sin workspace `packages/` compartido | Acoplamiento por HTTP + mismo proyecto Supabase |

### 1.2 Dominios y publicación

| Dominio | Rol | Quién lo sirve |
| --- | --- | --- |
| `elmenuxfa.com` | Descubrimiento + menús públicos + chat restaurante + APIs | Vercel **`kosmenu`** (`site/`) |
| `business.elmenuxfa.com` | Landing comercial / kit | Mismo Next; middleware reescribe `/` → `/business` |
| `admin.elmenuxfa.com` | Admin de plataforma | Mismo Next; middleware → `/admin/*` |
| `app.elmenuxfa.com` | Panel comerciante Flutter | Runtime Flutter (no incluido en `.vercelignore` filter de `site/`) |

Config canónica: `site/app/_lib/public-site-config.ts`  
Hosts / rewrites: `site/middleware.ts`  
Proyecto Vercel: `.vercel/project.json` / `site/.vercel/project.json` (nombre `kosmenu`).  
Deploy filter: `.vercelignore` — solo `site/**`.

### 1.3 Qué es Next vs Flutter

**Next (`site/`):** discovery (`ClientesDiscoveryPage`), business landing, menú `/v/[id]`, chatbot UI, checkout/órdenes públicas, panel web `/panel/conversaciones`, admin plataforma, **todas** las rutas `site/app/api/**`.

**Flutter (`lib/`):** auth comerciante, catálogo, pedidos, billing, staff, settings, deep links; escribe mayormente **directo a Supabase** con RLS; llama Next vía `API_BASE_URL` (`lib/services/elmenuxfa_api_config.dart`).

### 1.4 Supabase

- Auth JWT comerciante + `comercios.owner_id` + `comercio_members` (roles: `administrador|caja|cocina|marketing|mesero`).
- Helpers RLS: `is_comercio_member`, `comercio_has_role` (`supabase/migrations/20260917120000_merchant_panel_real_modules.sql`).
- Edge: `notify-order`, `process-wasender-queue`, billing/rates/AI images, etc.
- Admin plataforma: `admin_users` / cookie (`site/app/admin/_lib/admin-auth.ts`).
- Consumidor: **sin login** para discovery/menú; chat con `sessionId` + token HMAC de supervisión.

### 1.5 APIs reutilizables (selección)

| API | Uso |
| --- | --- |
| `GET /api/comercios/directory?mode=clientes` | Búsqueda discovery (q, region, category, lat, lng) |
| `GET /api/menu/[comercioId]` | Menú público |
| `POST /api/orders` | Crear pedido |
| `POST /api/chat/[comercioId]` | Chatbot por comercio (+ tools Gemini) |
| `/api/panel/conversaciones*` | Inbox supervisión (Bearer) |
| `/api/kit/*` | Kit / envío comercial |
| `/api/business/staff-invite/*` | Invitaciones staff |
| `site/app/admin/api/**` | Admin plataforma (cookie) |

### 1.6 Solo UI (sin API conversacional dedicada)

- Favoritos / dismiss banners discovery → `localStorage`.
- Geolocalización browser → lat/lng a directory API.
- Carrito menú / identidad chat → storage cliente.
- **CRUD productos/categorías/horarios** → Flutter → Supabase (no REST conversacional).
- Landing business → CTAs a `app.elmenuxfa.com/?tab=register` y `wa.me` marketing.

### 1.7 Escritura vs lectura / multiempresa

- Lecturas públicas: directory, menú, tracking con token.
- Escrituras sensibles: pedidos, comprobantes, chat supervision, kit, Flutter mutations con RLS por `comercio_id`.
- Chat supervision panel: owner o roles `administrador|caja|marketing`.
- WhatsApp avisos supervisión: **nunca** el número de plataforma `584220451906` (`supervision-shared.ts`).

---

## 2. Inventario de capacidades (obligatorio)

Leyenda estados: **D**esarrollado · **P**robado (tests/docs) · **Dep**legado (código en rama/deploy histórico) · **A**ctivado (flags/prod) · **Pend**iente.

| Funcionalidad | Sitio actual | Existe en código | API reutilizable | Requiere desarrollo | Riesgo | Prioridad | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Directory search (nombre/comida) | elmenuxfa.com | Sí `public-directory.ts` | Sí `GET /api/comercios/directory` | Adaptar a chat UI | Bajo | P0 | D/P/Dep — A según prod |
| Geo / cerca de mí | elmenuxfa.com | Sí Haversine `public-directory-geo.ts` | Sí lat/lng query | UX permiso ubicación en asistente | Medio | P0 | D |
| Open/horario | discovery + menú | Sí `business-hours` / `isOpen` | En payload directory | — | Bajo | P1 | D |
| Menú público | `/v/[slug]` | Sí | `GET /api/menu/...` | Deep link desde WA | Bajo | P0 | D/Dep/A |
| Chatbot restaurante | `/v/...` + chat | Sí Trueno allowlist | `POST /api/chat/...` | No reusar tools admin | Alto si se abre mal | P1 | D — A allowlist |
| Checkout / pedidos | menú | Sí | `POST /api/orders` | No meter en WA texto | Alto | P1 | D/Dep/A |
| Landing business + precios UI | business.* | Sí `BusinessLandingPage` / `PricingSection` | No API “planes vigentes” limpia | Endpoint planes o scrapear fuente única | Medio | P1 | D UI |
| Registro comercio | app.* Flutter | Sí `auth_screen.dart` signUp | Supabase Auth + flujos Flutter | No duplicar DB | Alto | P1 | D/A |
| Kit checkout | `/kit` | Sí | `/api/kit/*` | Enlaces desde WA | Medio | P2 | D |
| CRUD menú admin | Flutter | Sí directo Supabase | Parcial (imágenes variants) | Capa API + confirmaciones | Alto | P2 | D UI |
| Pedidos/ventas admin | Flutter | Sí | Parcial Next business orders | Conversacional con auth | Alto | P2 | D |
| Supervisión chat | `/panel` + Flutter | Sí | panel APIs + WaSender notify | No mezclar con router WA | Alto | P1 | D — A flags |
| WaSender outbound cola | infra | Sí | `sendWhatsappText` + RPC | — | Medio | — | D/Dep/A |
| WaSender inbound / auto-reply | — | **No** | **No** | Webhook + router + estado | **Crítico** | P0 | Pend |
| Bienvenida WA 1/2 | — | No | No | Nuevo módulo | Alto (ToS/ban) | P0 | Pend |
| Asistente discovery web | — | Parcial (reuse UI chat) | Directory API sí | Nuevo agente + rutas | Medio | P0 | Pend |
| Asistente comercial web | — | Parcial landing | Kit/billing parcial | Agente + auth registro | Medio | P1 | Pend |
| Asistente admin autenticado | — | Panel Flutter | Bearer APIs parciales | Auth web + tools gated | **Crítico** | P2 | Pend |
| PWA consumer | elmenuxfa.com | No | — | Manifest + SW + icons | Medio | P1 | Pend |
| PWA merchant | app.* | Parcial `web/manifest.json` | — | CTA install + hardening | Bajo | P2 | D parcial |

---

## 3. Diagnóstico de los tres dominios

### 3.1 Consumidor — `elmenuxfa.com`

**Existe:** listado, búsqueda texto (incluye nombres de platos), categorías/chips, regiones VE, cerca (lat/lng), rating, promovidos, open label, showcase dishes, link a menú, chatbot por comercio (piloto), pedido/checkout en menú.

**API:** `site/app/api/comercios/directory/route.ts` → `listClientDirectory` / `searchPublicDirectory` en `site/app/api/_lib/public-directory.ts`.

**Falta para asistente conversacional:** shell de chat de plataforma (no por-comercio), orquestación Gemini/tools con **solo** tools de discovery, deep links `https://elmenuxfa.com/v/{slug}?chatbot=1` (u flags reales), no inventar stock.

### 3.2 Negocios — `business.elmenuxfa.com`

**Existe:** marketing, features, pricing section (copy UI), CTAs a registro/login app, WhatsApp marketing (`marketingWhatsappHref`), kit.

**No existe:** API pública “dame planes activos y precios canónicos” desacoplada de la UI; registro conversacional end-to-end.

**Registro real:** Flutter `lib/screens/auth_screen.dart` + billing (`billing_service.dart`, `subscriptions`). Reutilizar Auth + mismas tablas; **no** segunda base.

### 3.3 Admin comercio — `app.elmenuxfa.com`

**Existe:** módulos Flutter (pedidos, catálogo, billing, staff, horarios, marketing, conversaciones). Permisos en `lib/services/merchant_session.dart`.

**Seguridad conversacional:** el número WA **no** autentica. Abrir panel con sesión Supabase existente; enlaces mágicos de Auth solo con redirects oficiales; **nunca** JWT en query WhatsApp.

**Mejor opción:** asistente **dentro del panel autenticado** (web `/panel` o Flutter) reutilizando JWT — no un “admin paralelo” anónimo.

---

## 4. Diagnóstico WaSender

### 4.1 Piezas encontradas

| Pieza | Path |
| --- | --- |
| Encolar texto | `site/app/api/_lib/send-order-whatsapp.ts` → `sendWhatsappText` → RPC `enqueue_wasender_message` |
| Worker | `supabase/functions/process-wasender-queue/index.ts` → POST `wasenderapi.com/api/send-message` |
| Cola / dedupe | `supabase/migrations/20260927193000_wasender_global_message_queue.sql` (`dedupe_key` único) |
| Pedidos | `supabase/functions/notify-order` + helpers merchant notify |
| Supervisión | `site/app/api/chat/_lib/supervision.ts` (avisos a WhatsApp **del comercio**, no al 0422) |
| Flags | `CHAT_SUPERVISION_WASENDER`, `WASENDER_API_KEY`, `WASENDER_API_ENDPOINT`, worker secret |

### 4.2 Lo que **no** está en el repo

- Webhook de mensajes entrantes / validación de firma inbound.
- Parser de `fromMe`, grupos, status broadcasts.
- Auto-respuesta a consumidores que escriben al 0422.
- Botones/listas interactivas en el payload de envío (solo **texto** en `sendWhatsappText`).
- Referencia a sesión `ELMENUXFA1` (vive en consola WaSender / secretos, no en git).

### 4.3 Implicación para la misión

**Hoy no se puede “recibir el primer mensaje” con este código.** Cualquier router de bienvenida requiere **nuevo** inbound (Edge/Next) + estado de sesión WA + política anti-eco, **sin** tocar la cola outbound existente.

### 4.4 Evitar doble respuesta

Cuando exista inbound:

1. Idempotencia por `messageId` WaSender (tabla propia).
2. Filtrar `fromMe` / grupos / status.
3. Si el chat es “atención humana abierta” → no auto-reply (espejo de `human_handling` en supervisión).
4. Un solo worker de decisión; outbound de pedidos/supervisión sigue usando `dedupe_key` actuales.
5. Feature flag `PLATFORM_WA_ROUTER=0` por defecto.

### 4.5 Controles interactivos

Con la integración actual (**solo `send-message` texto**): usar **opciones numéricas** (1/2). Evaluar botones WaSender solo tras prueba en staging con la misma sesión — no asumir Cloud API templates.

---

## 5. Riesgos de seguridad y restricciones (WaSender como puerta)

| Opción | Continuidad | Riesgo restricción | Costo | Migración | Reversibilidad |
| --- | --- | --- | --- | --- | --- |
| **A. WaSender respuestas breves solicitadas** | Alta a corto plazo | Medio-alto si escala auto-reply no solicitado | Bajo-medio | Nula | Alta (flag off) |
| **B. WhatsApp Business Platform oficial** | Mejor compliance | Bajo (reglas claras) | Más alto (BSP) | Media-alta | Media |
| **C. Coexistencia número actual** | Ideal si elegible | Depende Meta/BSP | Medio | Media | Media |
| **D. Número secundario para pruebas** | Protege principal | Bajo en prod | Bajo | Baja | **Máxima** — **recomendada para piloto** |

**Riesgos concretos de automatizar el principal con WaSender:**

- Sesión no-oficial: ban/limitación impredecible; el número es marketing + soporte + posible entrada.
- Confusión con avisos salientes (pedidos/supervisión) si inbound responde a eco propio.
- Sin inbound actual, cualquier “prueba” mal hecha en consola WaSender puede chocar con workers.
- **No** es punto único de fallo de la plataforma **si** las webs siguen siendo el canal de verdad (menú, panel, discovery).

**Política:** no fingir humano; mensajes cortos; opt-in implícito (ellos escriben); sin promos no solicitadas.

---

## 6. Diseño de los tres asistentes

### A. Discovery (consumidor)

- Entrada WA → enlace a `https://elmenuxfa.com/...` (ruta nueva tipo `/a/buscar` o PWA chat) con UTM.
- Tools: **solo** directory + deep link menú/chat comercio.
- UI: reutilizar componentes de `site/app/v/[id]/_components/chat/` (burbujas, carruseles, quick replies) con **otro** backend de agente.

### B. Comercial / registro

- Entrada → `business.elmenuxfa.com` o chat `/a/negocio`.
- Explicar planes desde **fuente única** (hoy UI/`PricingSection` + billing Flutter — hay que canonicar).
- Registro: deep link `appSignupHref` (`app.elmenuxfa.com/?tab=register`) o flujo Auth existente; sin cuentas huérfanas.

### C. Admin autenticado

- WA solo envía enlace a login panel (`appLoginHref`) o magic link Supabase con redirect allowlisted.
- Operaciones write: resumen + confirmación + audit log; Gemini **sin** service_role directo.
- Preferir asistente embebido en sesión autenticada.

---

## 7. Arquitectura compartida

```
                    ┌─────────────────────────┐
                    │  Kernel compartido      │
                    │  Gemini client, quota,  │
                    │  rate-limit, telemetry, │
                    │  chat UI primitives     │
                    └───────────┬─────────────┘
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   Agent Discovery        Agent Sales           Agent Admin
   tools: directory       tools: plans/kit      tools: panel APIs
   auth: anon+session     auth: anon→signup     auth: JWT member
   NO admin tools         NO pedido write       NO discovery spoof
```

**Recomendación:** un **router de intención** + **tres toolboxes autorizados** (no un mega-tool list). Reusar `gemini.ts` / `quota.ts` / `call-attribution.ts` con `agentId` distinto y tablas de uso separadas o `commerceId=platform`.

No reutilizar `tools.ts` del chatbot de restaurante tal cual (está anclado a un `comercioId` y a venta de comida).

---

## 8. Estrategia PWA

| Superficie | Hoy | Acción |
| --- | --- | --- |
| `app.elmenuxfa.com` | `web/manifest.json` + Flutter SW | Mejorar CTA “Instalar”; cuidado caché multi-comercio |
| `elmenuxfa.com` | Sin manifest/SW | Añadir PWA discovery/chat (icons, SW acotado, no cachear datos ajenos) |
| `business.elmenuxfa.com` | No | Opcional marketing PWA; prioridad baja |
| `admin.*` | No | No PWA |

**Preferencia:** PWA **consumer** en apex (encontrar comida) + PWA **merchant** ya parcial. No una sola PWA que mezcle datos de todos los comercios en caché.

iOS: Add to Home Screen; push web limitado. Android: install prompt + posible FCM en merchant (`docs/push_notifications_setup.md`).

---

## 9. Estimación de esfuerzo y costos

### Esfuerzo (orden de magnitud, 1 ingeniero familiarizado)

| Etapa | Alcance | Semanas |
| --- | --- | --- |
| 0 | Decisión número secundario vs principal; diseño inbound | 0.5 |
| 1 | Inbound + router numérico + enlaces (sin Gemini) | 1–2 |
| 2 | Asistente web discovery (API directory + UI chat) | 2–3 |
| 3 | Asistente comercial + deep link registro | 1.5–2.5 |
| 4 | Admin conversacional autenticado (subset read + confirm write) | 3–5 |
| 5 | PWA consumer | 1–1.5 |

### Costos Gemini (orientativos con precios env smoke)

`CHATBOT_PRICE_INPUT_PER_1M≈0.25`, output≈1.5 USD/1M tokens (`live-budget.ts`).  
Conversación discovery corta (~1–3k tokens/turno, 4 turnos): **orden ~$0.01–0.05** por conversación (depende modelo prod).  
**Por 1000 conversaciones:** decenas de USD de modelo **si** todo pasa por Gemini; Etapa 1 **sin** Gemini ≈ $0 modelo + costo WaSender sesión.

WaSender: costo de sesión/proveedor (fuera de repo); cola ya absorbe reintentos.

Realtime: no abrir canal permanente por visitante anónimo; chat consumer usa poll/broadcast acotado a supervisión activa.

---

## 10. Plan priorizado

### Etapa 1 — Valor temprano (mínimo riesgo)

1. Número **secundario** o flag off en principal.
2. Inbound webhook nuevo + dedupe + ignore `fromMe`.
3. Estado sesión WA (TTL) + bienvenida 1/2 + “Menú” / ayuda.
4. Enlaces reales:
   - Pedir comida → `https://elmenuxfa.com/` (o ruta asistente cuando exista).
   - Negocio → `https://business.elmenuxfa.com/` / registro `appSignupHref`.
   - Gestionar → `appLoginHref`.
5. No Gemini. No tocar `notify-order` ni supervisión.

### Etapa 2 — Discovery conversacional web

- Ruta `/a` o `/asistente` en apex.
- Tools directory only.
- Reusar UI chat.
- Deep link a `/v/{slug}`.

### Etapa 3 — Comercial

- FAQ planes desde fuente canónica.
- CTA registro/kit existentes.

### Etapa 4 — Admin

- Solo autenticado.
- Reads primero; writes con confirmación + audit.

### Etapa 5 — PWA + endurecimiento WA oficial (B/C)

### Pruebas

- Staging + número D.
- Idempotencia inbound.
- No regresión: un pedido de prueba no debe disparar auto-reply en principal.
- Vitest directory + contract links.
- Feature flags.

### Despliegue

- Flags: `PLATFORM_WA_INBOUND`, `PLATFORM_WA_ROUTER`.
- Deploy Next only; Flutter sin cambio obligatorio en E1–2.

---

## 11. Recomendación técnica final

1. **Tratar WhatsApp como puerta de enlaces + estado corto**, no como runtime de pedidos/admin.
2. **Construir inbound desde cero** aislado de la cola outbound; no reinterpretar `process-wasender-queue`.
3. **Piloto en número secundario (D)** antes de tocar `+584220451906`.
4. **Reutilizar** directory API + chat UI + Auth Flutter; **no** clonar comercios ni bypass RLS.
5. **PWA consumer** después de que el asistente discovery exista.
6. Planear migración a **Cloud API / coexistencia (B/C)** como destino de compliance, no bloqueante de E1.

---

## 12. Preguntas que necesitan decisión del propietario

1. ¿Piloto en número **secundario** o en el principal desde el día 1?
2. ¿WaSender permite webhook inbound en el plan/sesión `ELMENUXFA1`? (fuera de repo — confirmar en consola)
3. ¿Fuente canónica de **precios/planes** para el asistente comercial?
4. ¿El asistente discovery vive en apex `/` embebido o ruta dedicada `/a`?
5. ¿Admin conversacional prioriza Flutter embebido o `/panel` web?
6. ¿Umbral de auto-reply (solo primer mensaje vs conversación completa)?
7. ¿Presupuesto Gemini mensual para agentes de plataforma?
8. ¿Migración Cloud API es objetivo 2026 o solo contingencia?

---

## 13. Respuestas concretas (sección 12 del brief)

1. **¿Recibir entrantes sin interferir avisos?** Hoy **no hay recepción en código**. Técnicamente se puede añadir inbound **aparte** de la cola outbound; hay que filtrar ecos y no compartir handlers con `notify-order`.
2. **¿Qué escucha el webhook?** Ningún webhook WaSender inbound en repo. Webhooks DB → `notify-order` (pedidos). Worker WaSender solo **envía**.
3. **¿Duplicados / conflictos salientes?** Outbound: `dedupe_key`. Inbound futuro: message-id propio + ignore `fromMe` + un router.
4. **¿Interactivos?** Envío actual = **texto**. Numéricos seguros; botones TBD en proveedor.
5. **¿Web con contexto sin credenciales?** Sí: URLs públicas + UTM/`?ref=wa`. Auth panel solo por login/magic link allowlisted — **no** tokens en WA.
6. **¿API búsqueda restaurantes?** **Sí:** `GET /api/comercios/directory`.
7. **¿Búsqueda geográfica?** Haversine en `public-directory-geo.ts`; cliente manda `lat`/`lng`.
8. **¿Disponibles?** `en_linea` + horarios → `isOpen` / `openLabel` en directory; menú respeta flags de publicación.
9. **¿Business vía API?** Landing/marketing UI; kit/billing/staff-invite APIs parciales; **no** “signup conversacional” completo.
10. **¿Registro sin duplicar?** Sí, vía Auth Flutter/`signUp` + mismas tablas; deep link.
11. **¿Auth panel?** Supabase JWT Bearer; roles `comercio_members`; admin plataforma cookie distinta.
12. **¿Admin Flutter/web?** Flutter = panel principal; Next `/panel/conversaciones` = inbox chat; admin.* = plataforma.
13. **¿Confirmación extra?** Writes de precio/disponibilidad/pedidos sensibles → confirmación explícita + audit (a diseñar); hoy UI Flutter confirma en pantallas.
14. **¿Abrir panel desde WA seguro?** Link a login o magic link con redirect fijo a `app.elmenuxfa.com`; nunca JWT en mensaje.
15. **¿Reusar chatbot restaurante?** UI sí; **tools/prompt no** sin nuevo agente.
16. **¿Migraciones?** Sí para inbound state, dedupe inbound, posiblemente usage `agent=platform`. Outbound cola ya existe.
17. **¿Solo rutas + flags?** E1–E2 mayormente sí tras inbound function. Admin write necesita más.
18. **¿PWA?** Merchant parcial; consumer/business **no**.
19. **¿Instalar home screen?** Manifest + icons + HTTPS + (Android) SW; CTA install; iOS instrucciones.
20. **¿Costo /1k conversaciones?** E1 ~coste WaSender; con Gemini discovery decenas USD/1k (orden de magnitud, modelo/precios env).
21. **¿Tráfico actual?** Serverless Next + Supabase; directory cacheado; rate limit 60/min/IP. Cuello: Gemini quotas y WaSender session limits — no hay número duro en repo.
22. **¿Riesgos automatizar principal?** Ban sesión, mezcla con soporte humano, eco con salientes, SPOF percibido si se deja de publicar webs.
23. **¿Migrar API oficial sin perder número?** Proceso Meta/BSP + verificación; coexistencia si aplica; plan paralelo D durante transición.
24. **¿Operativo reutilizando código?** Enlaces a discovery/menú/business/login; directory API; chat UI; outbound intacto.
25. **¿Segunda etapa?** Admin write conversacional, PWA consumer, Cloud API, botones ricos, voz plataforma.

### Rutas reales para enlaces (no inventadas)

| Intención | URL base real |
| --- | --- |
| Pedir / discovery | `https://elmenuxfa.com/` |
| Menú comercio | `https://elmenuxfa.com/v/{slug}` |
| Business | `https://business.elmenuxfa.com/` |
| Registro | `https://app.elmenuxfa.com/?tab=register` (`appSignupHref`) |
| Login panel | `https://app.elmenuxfa.com/` login (`appLoginHref`) |
| Kit | `https://business.elmenuxfa.com/kit` (vía `kitCheckoutHref`) |
| WhatsApp marketing (saliente humano) | dígitos `584220451906` en `public-site-config.ts` |
| Inbox supervisión (comerciante) | `https://elmenuxfa.com/panel/conversaciones/{id}` |

**Rutas nuevas necesarias (no existen):** webhook inbound plataforma; store estado WA; posiblemente `/a` o `/asistente` discovery/sales.

---

## Apéndice A — Evidencias clave

- `site/app/_lib/public-site-config.ts` — hosts y `584220451906`
- `site/middleware.ts` — multi-host
- `site/app/api/comercios/directory/route.ts` — discovery API
- `site/app/api/_lib/send-order-whatsapp.ts` — solo enqueue texto
- `supabase/functions/process-wasender-queue/index.ts` — worker envío
- `site/app/api/chat/_lib/supervision-shared.ts` — no avisar al número plataforma
- `web/manifest.json` — PWA merchant parcial
- `docs/chat-supervision-architecture-audit.md` — contexto supervisión/WaSender

---

## Apéndice B — Complementos post-exploración (misma auditoría, sin código)

Hallazgos adicionales alineados con explores de arquitectura, discovery/admin y PWA/seguridad. El explore dedicado solo a WaSender **no completó** (bloqueo del proveedor); la sección 4 se basó en lectura directa del repo y sigue vigente.

### B.1 Reuso de `ChatAssistantView`

**No es drop-in** para discovery multi-restaurante, venta de El Menú XFA ni admin. Está acoplado a un `comercioId`, carrito, checkout y `tools.ts` de menú. Reutilizable: burbujas/composer/carruseles bajo `site/app/v/[id]/_components/chat/`. Hace falta **nuevo shell + agente + toolbox** por dominio.

### B.2 Business / trial

No hay producto de **prueba gratuita** en código. Publicar exige suscripción activa (`BillingSnapshot.canPublish`); existen gracia post-`past_due` y flag admin `billing_exempt`. Precios de landing (`PricingSection`) son copy UI; verdad de planes en tablas `plans` / `subscriptions` (Flutter `billing_service.dart`).

### B.3 Directory — gates reales

Listado público exige tipicamente `en_linea`, visibilidad en directorio, owner verificado; slugs demo excluidos (`DIRECTORY_EXCLUDED_SLUGS` en `public-directory.ts`). El asistente discovery no debe inventar comercios fuera de ese payload.

### B.4 Admin — confirmaciones

Cancelar/borrar pedido, borrar producto, IA de imagen, revoke invites, regenerar branding/FX: ya piden confirmación en Flutter. **Online/offline y toggle `disponible` son inmediatos** — un agente conversacional debería añadir confirmación explícita ahí.

### B.5 Seguridad / costos plataforma

- `site/app/api/_lib/rate-limit.ts` es **in-memory** (no durable entre instancias serverless); producción necesita WAF/Redis o equivalente para agentes de plataforma.
- Caps en dólares Gemini (`CHATBOT_LIVE_HARD_CAPS`) son **smoke local**, no prod; prod usa cuotas mensuales por comercio + kill switches.
- Degradación chatbot restaurante → menú tradicional ya existe (`fallback.useTraditionalMenu`); el router WA E1 debe degradar a **solo enlaces** si falla inbound/Gemini.

### B.6 Drift documental

`docs/domain-cutover-elmenuxfa.md` describe business absorbido en apex; **el middleware actual mantiene `business.elmenuxfa.com` como host de primera clase**.

---

**FIN DE AUDITORÍA.** No implementar hasta revisar conclusiones y responder la sección 12 (decisiones del propietario).
