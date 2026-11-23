# Cierre técnico — piloto Pizzas El Trueno

**Rama:** `qa/chatbot-intelligence-v2`  
**Base:** `5eaddb1` → commit de cierre en esta entrega  
**Fecha:** 2026-11-22  
**Sin deploy / push / merge / migraciones / Gemini live.**

---

## 1. Pruebas aprobadas y fallidas

| Suite | Resultado |
| --- | --- |
| Vitest completo (`--env-file=.env.local`) | **822 passed / 0 failed / 1 skipped** |
| TypeScript `tsc --noEmit` | **OK** |
| Playwright closure E2E (10 escenarios) | **OK** (`ok: true`) |
| Contratos live combo + FX | **3/3 OK** |

Los 6 fallos previos (tracking / WhatsApp / dispatch) eran **contaminación por `.env.local`** (`SITE_URL=""` y `SUPABASE_SERVICE_ROLE_KEY` precargada), no regresiones de combinación. Corregidos sin debilitar asserts.

---

## 2. Resultado del carrito combinado

`summarizeCartSnapshot` ahora usa `resolveCombinedUnitPrice` (MAX) + validación de partner, igual que `propose_add` / menú tradicional.

Evidencia E2E:

- 1× Campesina Grande **10.91 USD**
- 1× (Combinación) Granjera + Campesina Grande **10.91 USD** (una sola línea)
- 1× Refresco 2 Lt. Coca-Cola **1.75 USD**
- Subtotal chat: **US$ 23,57** (= 10.91 + 10.91 + 1.75) — sin cobro duplicado

---

## 3. Solución de moneda COP (sin reescribir precios)

| Campo | Valor |
| --- | --- |
| Almacenamiento / menú base | **USD** |
| `moneda_default` config | **USD** |
| Checkout currencies | USD, VES, **COP** |
| Tasa COP | **1 USD = 3200 COP** |
| Combo Grande en COP (referencial) | **34.912** |

**Más segura (recomendada para piloto):** mantener precios en USD; mostrar USD en menú/chat; ofrecer COP en checkout con la tasa existente; chat responde conversiones vía `get_exchange_rate`.

**No hacer:** poner `comercio.moneda=COP` sin re-expresar precios (mostraría 10.91 COP).

**Actualización autorizada pendiente (opcional post-piloto):** si el dueño exige COP como vista por defecto, confirmar tasa 3200 y autorizar preferir `moneda_default=COP` en UI (hoy el kiosk cae a `businessBaseCurrency`).

---

## 4. Estado real RLS (producción `kosmenú` / `qqhberaayhohxlbbhdyi`)

Consulta read-only `supabase db query --linked --read-only`:

| Check | Resultado |
| --- | --- |
| Política `pedidos_emergency_anon_insert` | **No existe** (0 filas) |
| `has_table_privilege('anon','pedidos','INSERT')` | **false** |
| `authenticated` INSERT | **false** |
| `service_role` INSERT | **true** |

Políticas presentes: owner/member select/update/delete archivados — sin INSERT anon abierto.

---

## 5. Resultado Playwright

Script: `site/scripts/chatbot-pilot-closure-e2e.mjs`  
Capturas: `site/.data/qa-validation/screenshots-closure/` (gitignored)

Pasos OK: pizza normal → mitad/mitad + tamaño → Refresco+Coca → carrito 3 → subtotal → tasa → checkout preview → humano → chat↔menú. **0 pedidos creados. 0 Gemini facturable.**

Nota: handoff humano responde que el local **no tiene WhatsApp público** configurado (dato del comercio, no fallo de tool).

---

## 6. Riesgos restantes

1. Smoke Gemini Live **no ejecutado** (prep en `docs/chatbot-gemini-smoke-prep.md`).
2. WhatsApp del restaurante no publicado → handoff humano limitado.
3. Presentación principal sigue en **USD** hasta decisión autorizada de display COP.
4. `.env.local` tiene `SITE_URL=""` / `NEXT_PUBLIC_SITE_URL=""` — el código ya ignora vacíos; conviene limpiar env ops.
5. Piloto debe limitarse a Trueno allowlist; no ampliar comercios sin nueva QA.

---

## 7. GO / NO-GO para piloto

**GO condicionado** para publicar **solo** el piloto de Pizzas El Trueno en esta rama, siempre que:

1. Se acepte moneda base USD + COP en checkout (sin rewrite de precios).
2. Se ejecute (con auth) el smoke Gemini mínimo del doc de prep y pase.
3. Se confirme/publique WhatsApp del local si el handoff humano es requisito de negocio.
4. Deploy limitado al allowlist Trueno; sin merge amplio a otros comercios.

Bloqueante RLS de emergencia: **cerrado** (política ausente; anon sin INSERT).

---

## 8. Procedimiento exacto para publicar (no ejecutado)

1. Owner revisa este informe + `docs/chatbot-gemini-smoke-prep.md`.
2. Autoriza smoke Gemini (`--authorize-live`, max 8 turnos, 0 pedidos).
3. Si smoke OK → autoriza deploy del artefacto de esta rama **solo** preview/piloto Trueno.
4. Verificar post-deploy: allowlist, `CHATBOT_SIMULATE_GEMINI` off en prod, tasas COP, 1 compra normal + 1 combinación sin pedido de prueba facturable si aplica sandbox.
5. **No** merge a main/producción general hasta sign-off del piloto.
6. **No** aplicar migraciones adicionales en este cierre.

---

## Cambios de código en este cierre

- `summarizeCartSnapshot` → MAX combinación.
- `publicSiteUrl` → ignora strings vacíos de env.
- Tests tracking/dispatch aislados del env sucio.
- Simulador: Campesina/Granjera, Refresco+sabor, humano.
- Scripts E2E/auditoría + docs de cierre y smoke prep.
