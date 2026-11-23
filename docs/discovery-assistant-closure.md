# Discovery Assistant — cierre final

**Rama:** `feature/discovery-assistant`  
**Sin push / merge / deploy / migraciones aplicadas / Gemini facturable**

## Veredicto

| Ámbito | Estado |
| --- | --- |
| Desarrollo local / revisión | **GO** |
| Activar Gemini en producción | **NO-GO** hasta aplicar migración + flags (ver requisitos) |

## 1. Botón Enviar

**Causa:** el FAB `.whatsapp-chat-widget` (`fixed bottom-4 right-4 z-[60]`) seguía montado en `/asistente` y robaba el hit-test del submit.

**Corrección:**
- Ocultar widget en `/asistente` (`WhatsAppChatWidget.shouldHideWidget`)
- Composer shell `z-20` + botón Enviar `z-30` / `h-11 w-11`

**Playwright:** `forceClicks: false` — cero `force: true`. WA count = 0 en `/asistente`. Enviar con clic normal.

## 2. Gemini / cuotas para producción

Reutiliza el **patrón** del chatbot de restaurantes (RPC atómica + service_role), **no** sus tablas.

| | Restaurante | Discovery |
| --- | --- | --- |
| Tablas | `ai_chatbot_*` | `ai_discovery_*` |
| RPC reserve | `reserve_ai_chatbot_quota` | `reserve_ai_discovery_quota` |
| Scope | por `commerce_id` | agent global `discovery` |

**SQL preparado (NO aplicado):**  
`supabase/migrations/20261123160000_ai_discovery_assistant_quota.sql`

**Cliente listo:** `reserveDiscoveryRequest` habla con la RPC cuando `QUOTA_BACKEND=postgres`.

**Requisitos exactos:** `docs/discovery-assistant-production-requirements.md`

## 3. Paginación y enlaces

- `offset` + mismos filtros (`q`/`category`/`region`/`lat`/`lng`)
- Tiebreaker `id` en sorts → páginas estables sin reshuffle
- `hasMore` / `total` para recorrer todo el pool elegible
- Chat CTA servidor: UX slug + preview efectiva + en prod UUID ∈ `CHATBOT_ALLOWED_COMMERCE_IDS` (fail-closed)

## 4. Prueba final

| Suite | Resultado |
| --- | --- |
| Vitest completo | **127 files / 872 passed** (4 skipped) |
| `tsc --noEmit` | limpio |
| Playwright móvil | **ok: true**, `forceClicks: false` |
| WA hidden / pizzas / vacío / Gemini fail / geo deny / paginación 24→40 / CTA menú | OK |

Capturas: `docs/discovery-assistant-screenshots/`

## Requisitos para producción (resumen)

1. Aplicar migración `20261123160000_ai_discovery_assistant_quota.sql` en staging → smoke RPC  
2. `DISCOVERY_ASSISTANT_QUOTA_BACKEND=postgres` + `DISCOVERY_ASSISTANT_POSTGRES_QUOTA_READY=1`  
3. Caps sesión/mes/tokens + rate limit perimetral (WAF/Upstash)  
4. Flags UI/API en `0` hasta smoke  
5. Autorización explícita: `ALLOW_PRODUCTION=1` + `ALLOW_GEMINI=1`  
6. Verificar aislamiento: sin filas nuevas en `ai_chatbot_usage`  
7. Kill switches: env + opcional `app.discovery_assistant_kill`

No se inicia WhatsApp bot ni asistentes comercial/administrativo.
