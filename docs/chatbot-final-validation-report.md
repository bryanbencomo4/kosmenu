# Validación final — combinaciones y monedas (Pizzas El Trueno)

**Rama:** `qa/chatbot-intelligence-v2`  
**Base código aprobado:** `cf63680`  
**Validación:** 2026-11-22  
**Alcance:** solo lectura / simulación local. Sin deploy, sin migraciones, sin escrituras a producción, sin Gemini facturable, sin pedidos reales.

**Veredicto para deploy:** **NO-GO**

---

## 1. Moneda principal efectiva de Trueno

| Campo | Valor efectivo |
| --- | --- |
| `comercio.moneda` | **USD** |
| `comercio.moneda_principal` | **USD** |
| Moneda de almacenamiento de precios | **USD** (p. ej. Granjera/Campesina base `4.8`, Grande combinada `10.91`) |
| Checkout currencies (`branding_ia.config_negocio`) | `USD`, `VES`, `COP` |
| Moneda que usa el chatbot | `resolveMenuCurrency(comercio.moneda)` → **USD** |

**Conclusión:** la moneda principal efectiva en datos es **USD**, no COP.

---

## 2. Origen de la discrepancia USD/COP

No es un bug del chatbot. El consumidor ve USD porque la base de datos del comercio tiene `moneda` / `moneda_principal` = `USD`. El menú tradicional y el chat leen el mismo campo.

**Corrección precisa (requiere autorización del dueño — no aplicada):**

1. Cambiar `comercios.moneda` (y `moneda_principal` si se mantiene) a **`COP`**.
2. Re-expresar precios de productos/opciones en COP (hoy están en USD).
3. Ajustar `exchange_rates` / `exchange_rate_*` para que la moneda menú y las cotizaciones de checkout queden coherentes (hoy menú USD con cotización COP `3200`).
4. Verificar selector de checkout: ya permite `USD`, `VES`, `COP`.

**Datos contradictorios / a tener en cuenta:**

- Expectativa de negocio: COP como principal.
- DB efectiva: USD como principal.
- Cotización comercial vigente: **1 USD = 3200 COP** (manual, fuente etiquetada `google`), actualizada `2026-11-03T16:35:13.964Z`.
- `tasa_cambio_pesos`: `null` (no usada; la fuente real es `config_negocio.exchange_rates.COP` + columnas `exchange_rate_*`).

Auditoría readonly: `site/scripts/_audit-trueno-currency-combo-readonly.mjs` → salida local en `site/.data/qa-validation/trueno-currency-combo-readonly.json` (gitignored).

---

## 3. Fuente real de las tasas

| Pieza | Valor |
| --- | --- |
| `config_negocio.exchange_rates.COP` | `3200` |
| `config_negocio.exchange_rate_modes.COP` | `manual` |
| `config_negocio.exchange_rate_sources.COP` | `google` |
| `config_negocio.exchange_rates.VES` | `997.9222` (modo `auto`, fuente `bcv_eur`) |
| `comercio.exchange_rate_value` | `3200` |
| `comercio.exchange_rate_quote_currency` | `COP` |
| `comercio.exchange_rate_mode` | `manual` |
| `comercio.exchange_rate_source` | `google` |
| `last_rate_update` | `2026-11-03T16:35:13.964+00:00` |
| Tool / helper | `get_exchange_rate` → `describeBusinessExchangeRate` → `resolveCheckoutCurrencyRate` / `convertAmountBetweenCurrencies` |

No se inventaron tasas. Sin tasa verificable el chat responde error natural (cubierto en Vitest).

---

## 4. Resultado Playwright (navegador real)

Script: `site/scripts/chatbot-combo-playwright-validation.mjs`  
Preview: `/preview/dev-chatbot-trueno` con `CHATBOT_SIMULATE_GEMINI=1` (0 HTTP Gemini).

| Paso | Resultado |
| --- | --- |
| Pregunta tamaño + chips Normal/Grande | OK |
| Chip Grande | OK |
| Una sola `propose_add` | OK (`proposeCount: 1`) |
| Mitades Granjera + Campesina, qty 1, Grande | OK |
| Precio | **US$ 10,91** |
| Confirmación → carrito count `1` | OK |
| FX dólar / 10 USD / pizza en pesos / pagar en dólares | OK |

Capturas (locales, `.data/` gitignored):

- `site/.data/qa-validation/screenshots/01-ask-size.png`
- `site/.data/qa-validation/screenshots/02-combined-proposal.png`
- `site/.data/qa-validation/screenshots/03-after-confirm.png`
- `site/.data/qa-validation/screenshots/04-fx-rate.png`
- `site/.data/qa-validation/screenshots/05-fx-10usd.png`
- `site/.data/qa-validation/screenshots/06-fx-pesos.png`
- `site/.data/qa-validation/screenshots/07-fx-pay-usd.png`

JSON: `site/.data/qa-validation/combo-playwright-report.json` → `"ok": true`.

---

## 5. Precio combinación: chat vs menú tradicional

Escenario: Granjera + Campesina, tamaño Grande.

| Motor | Unit price |
| --- | --- |
| Chat `prepareCartLineProposal` (servidor) | **10.91 USD** |
| Tradicional `resolveCombinedUnitPrice` (MAX) | **10.91 USD** |

Paridad exacta en `tests/chatbot-trueno-live-combo-contract.test.ts` (lectura Supabase, sin writes).

---

## 6. Evidencia de validación de servidor

- El precio de la propuesta **no** confía en `client_unit_price` del navegador; se recalcula en servidor con `resolveCombinedUnitPrice`.
- Partner no autorizado → `combination_not_allowed` / `not_found` (contrato live OK).
- `selection.combinacion.productId` = Campesina; qty = 1; currency = USD.
- Cliente envía `pending_configuration` al completar tamaño; con simulador Gemini el route adjunta el pending aunque `deterministic_action` se cortocircuite.

---

## 7. Suite completa de pruebas

Corrida: `node --env-file=.env.local ./node_modules/vitest/vitest.mjs run`

| Métrica | Valor |
| --- | --- |
| Passed | **815** |
| Failed | **6** |
| Skipped | **1** |
| Test files | 111 passed / 4 failed / 115 total |

Fallos (preexistentes / sensibles a `.env.local`; **no** introducidos por combinación):

1. `tests/security/send-order-validation.test.ts` — tracking URL same-origin (2)
2. `tests/security/order-tracking-auth.test.ts` — tracking URL token (1)
3. `tests/whatsapp-order-format-api.test.ts` — formato enlace WhatsApp (2)
4. `tests/dispatch-order-notification.test.ts` — timeout service-role missing (1)

Regresión carrito / checkout / variaciones (selectiva): **108/108 OK**  
(`menu-product-options`, `menu-option-groups`, `checkout-exchange-rate`, `checkout-cart-cache`, `checkout-idempotency`, `chatbot-combination`).

Live combo + FX: **3/3 OK**.

---

## 8. Estado de TypeScript

`npx tsc --noEmit` → **OK** (exit 0).

---

## 9. Problemas pendientes

1. **Moneda Trueno en DB = USD** mientras el negocio espera COP — requiere autorización para corregir datos (no solo UI).
2. **6 fallos Vitest** al cargar `.env.local` (tracking / WhatsApp / dispatch) — fuera del alcance combo; investigar aparte.
3. Respuesta “¿Puedo pagar en dólares?” informa la tasa; no enumera explícitamente métodos de pago USD (checkout sí lista USD).
4. Gemini Live real **no** se ejercitó (política: 0 llamadas facturables). El path real depende de que el modelo use `combine_with_*` / tools; el servidor ya valida.
5. `summarizeCartSnapshot` aún usa `resolveCartLineUnitPrice` sin MAX de combinación al resumir líneas (el proposal/add sí usa MAX). Impacto acotado a resúmenes de carrito en chat.
6. Capturas y JSON de evidencia viven en `site/.data/` (gitignored); este informe es la evidencia versionada.

---

## Fixes aplicados en esta validación (post-`cf63680`)

- Chips de tamaño con `contextId` estable (`qr_pending_size`) + ref de `pendingConfiguration` en el cliente.
- Simulador FX: cotiza COP cuando el menú es USD; convierte carrito a pesos (`10.91 → 34.912`); regex para “cuesta en pesos”.
- Playwright de validación + auditoría readonly + contrato live Trueno.
