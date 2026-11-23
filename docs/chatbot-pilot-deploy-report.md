# Informe final — Piloto Pizzas El Trueno (El Menú XFA Pro)

**Fecha:** 2026-11-22  
**Resultado:** **GO**

## URLs

| Rol | URL |
|-----|-----|
| Chatbot piloto | https://elmenuxfa.com/v/pizzas-el-trueno?chatbot=1 |
| Menú tradicional | https://elmenuxfa.com/v/pizzas-el-trueno |

## Commit y despliegue

- Recovery tag: `recovery/pre-chatbot-pilot-20261122` @ `597a723`
- Commit piloto: `b92856f` (`perf/prod-safe`)
- Deploy Vercel: `dpl_26ZuHU6KCfcboKVjQGySnQK8zNi4`
- Alias producción: https://elmenuxfa.com

## RLS

- Política `pedidos_emergency_anon_insert` eliminada (migración `20261122180000` + apply SQL auditado).
- Post-probe: anon INSERT → `42501 permission denied for table pedidos`.
- Solo Trueno con `chatbot_enabled=true`; `en_linea` permanece `true` (sin cambio automático).
- Pedidos tradicionales siguen vía `/api/orders` + service_role (sin nueva política permisiva).

## Prueba live de voz (staging, Gemini real, sin replay)

Utterance: *Buenas noches, quiero dos pizzas Hawaianas… y una Coca-Cola*

| Check | Resultado |
|-------|-----------|
| STT live | OK |
| 2× `propose_add` primer turno | OK (Grande 8.75 + Normal 3.50) |
| Coca-Cola no inventada | OK |
| Confirm → carrito 2 | OK |
| Checkout subtotal 12.25 | OK |
| Pedidos bloqueados en staging | OK |
| Cupo | 6 HTTP / ~US$0.003 (≤ US$0.02) |

Fix mínimo previo al GO: match plural `hawaianas`→`Hawaiana` vía `fuzzyIncludes` en search/findProduct.

## Suites

| Suite | Resultado |
|-------|-----------|
| Vitest | **706 passed**, 1 skipped |
| `tsc --noEmit` | OK |
| Playwright `functionality-close-e2e.mjs` | ALL CHECKS PASSED (sim) |

## Post-deploy producción (dominio público)

| Check | Resultado |
|-------|-----------|
| Menú tradicional 200 | OK |
| Chatbot `?chatbot=1` UI | OK |
| GET `/api/chat/{trueno}` authorized | OK — `quotaBackend=postgres`, allowlist, commerce flag |
| Mensaje prueba “¿Cuáles pizzas tienen?” | OK — respuesta + tarjetas Hawaiana/etc. |
| Adjuntos (Imagen/Archivo/Ubicación) visibles | OK |
| Micrófono UI visible | OK |
| Pedido de prueba en prod | **No creado** (por diseño) |
| Solo Trueno enable | OK (`others=none`) |

## Multimedia y sonidos

- Media live ON; staging ephemeral en `/tmp` en production.
- Efectos WhatsApp-derived: **silenciados** en prod (`NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED=0`) por falta de autorización de derechos. Chatbot no bloqueado.
- Mute/volumen 20 % permanece disponible cuando se licencien.

## Cuotas efectivas (prod)

- Backend: **postgres** (no filesystem)
- Allowlist: `0aa8c53b-07f1-446e-8b88-66c2b7ae89ea` (Trueno)
- `CHATBOT_ALLOW_PRODUCTION=1`, `CHATBOT_ENABLED=1`
- Rate limit IP/min: 20; max session: 40; monthly req: 500; monthly tokens: 2_000_000
- Kill-switch: vaciar allowlist / `CHATBOT_ENABLED=0` / `chatbot_enabled=false` en comercio

## Móviles

- Chromium/Playwright automation: OK (sim + staging live).
- **iPhone/Safari físico y Android físico: no disponemos de dispositivos → no acreditados.**

## Pendientes no bloqueantes

1. Sustituir sonidos por assets con licencia explícita y activar `NEXT_PUBLIC_CHATBOT_SOUNDS_LICENSED=1`.
2. Validación manual en iPhone Safari y Android Chrome físicos.
3. Contador `mediaHttpCalls` en presupuesto live (media se contabilizó en `geminiHttpCalls`).

## Kill-switch / rollback

1. `CHATBOT_ENABLED=0` o vaciar `CHATBOT_ALLOWED_COMMERCE_IDS` en Vercel + redeploy/restart.
2. SQL: `proposed-emergency-disable-chatbot-commerce.sql`
3. Git: tag `recovery/pre-chatbot-pilot-20261122`
