# Auditoría — supervisión humana del chatbot

**Rama:** `feature/chat-supervision-human`  
**Fecha:** 2026-11-22  
**Modo:** solo lectura de arquitectura previa a implementación.

## 1. WaSenderAPI

| Pieza | Ubicación |
| --- | --- |
| Envío texto | `site/app/api/_lib/send-order-whatsapp.ts` → `sendWhatsappText` |
| Credencial | env `WASENDER_API_KEY` (nunca en URL/cliente) |
| Destino | E.164 vía `normalizePhoneToE164` |
| Persistencia | RPC `enqueue_wasender_message` → tabla `wasender_message_queue` |
| Idempotencia | `dedupe_key` único |
| Worker | `kick_wasender_message_worker` / `claim_wasender_message` / `complete_wasender_message` |
| Uso actual | pedidos (`notify-merchant-new-order`), delivery invite, customer status |

**Reutilizar:** `sendWhatsappText` + cola existente. No nueva integración.

## 2. Teléfono del restaurante (avisos)

`resolveMerchantContacts` (`notify-merchant-new-order.ts`):

1. `comercios.whatsapp`
2. fallback owner auth phone / metadata

**Riesgo:** el WhatsApp público del menú puede no ser el de avisos operativos.  
**Diseño:** preferencia explícita por comercio `config_negocio.supervision_whatsapp` / `notify_whatsapp`, con fallback documentado; nunca usar número de soporte elmenuxfa.

## 3. Autenticación comerciante

- Panel principal: Flutter `app.elmenuxfa.com` (Bearer Supabase JWT).
- Helpers: `getUserFromBearerRequest`, `comercio_members`, `is_comercio_member`, `comercio_has_role`.
- Roles: `administrador`, `caja`, `cocina`, `marketing`, `mesero`.
- Next `admin/*` es panel **plataforma**, no bandeja del restaurante.

**Bandeja:** APIs Bearer compatibles con Flutter + UI web `/panel/conversaciones` con sesión Supabase para el piloto.

## 4. Historial chatbot hoy

`site/app/_lib/chatbot-session.ts`:

- `sessionStorage` por comercio (`elmenuxfa:chat-v1:` + `elmenuxfa:chat-sid-v1:`).
- **No** hay tablas de mensajes de chat para supervisión.
- `sessionId` opaco `s_…` generado en cliente; el API puede devolver/aceptar `sessionId`.

**Conclusión:** obligatorio persistir en servidor para supervisión cross-device.

## 5. Turno Gemini

`POST /api/chat/[comercioId]` (`route.ts`):

- Carga menú, cuota, allowlist.
- Simulador / deterministic / `runChatWithGemini`.
- Respuesta: `reply`, `cart_actions`, `product_cards`, `pending_configuration`.

Hook de supervisión: tras validar mensaje usuario real → upsert conversación + mensaje; si `attention=human` → no llamar Gemini; notify WaSender solo en primer mensaje (async/outbox).

## 6. Realtime existente

- **Chatbot / `site/`:** sin suscripciones Supabase Realtime (tracking de pedidos del consumidor es HTTP polling).
- **Panel Flutter (`app.elmenuxfa.com`):** sí usa Realtime hoy:
  - `pedidos` vía `.stream()` filtrado por `comercio_id` (JWT + RLS).
  - FX: `postgres_changes` en `global_market_rates` / `market_rate_provider_status`.
- **No hay** Broadcast privado, Presence de Supabase ni Realtime Authorization en el repo.
- **Plan supervisión:** tablas nuevas + RLS (ya migradas en SQL pendiente); Broadcast privado post-insert o `postgres_changes` sobre `chat_messages` con la misma tenancy que pedidos; DB como fuente de verdad; sin WebSockets propios en serverless Next.

## 7. RLS / pedidos

- `pedidos_emergency_anon_insert` ausente en prod (auditado).
- Nuevas tablas chat: RLS estricta owner/member; consumidor solo con token de sesión de alcance limitado.

## 8. Implicaciones de diseño

1. Feature flags: `supervision`, `supervision_wasender`, `supervision_human_takeover`.
2. Piloto allowlist Trueno.
3. Migración reversible, no aplicar sin auth.
4. Fallo WaSender no bloquea chat.
5. No tocar carrito/precios/checkout/Gemini tools.
