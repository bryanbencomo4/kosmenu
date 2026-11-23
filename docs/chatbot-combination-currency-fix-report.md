# Corrección: combinación mitad/mitad, moneda y tasas

**Rama:** `qa/chatbot-intelligence-v2`  
**Fecha:** 2026-11-22  
**Alcance:** chatbot alineado al menú tradicional (sin rediseño UI, sin migraciones, sin Gemini Live facturable).

---

## 1. Causa exacta: por qué separó las pizzas

Gemini interpretó “mitad Granjera y mitad Campesina” como **dos productos independientes** y llamó `prepare_cart_line_proposal` dos veces.

El servidor **no tenía** soporte de `combinacion` en propuestas de chat: solo resolvía un SKU por llamada. Sin `combine_with_*`, era imposible emitir una sola línea combinada aunque el modelo lo intentara.

---

## 2. Cómo funciona la combinación en el menú tradicional

| Pieza | Contrato |
| --- | --- |
| Config | `opciones_menu.personalizacion.combinacion` por producto (`activada`, `productos_compatibles`, `regla_precio: 'max'`) |
| UI | `ProductOptionsSheet` (`COMBO_QUESTION_KEY`) |
| Partner selection | `autoPartnerSelection` (espeja tamaño/grupos por nombre) |
| Precio | `resolveCombinedUnitPrice` → **`Math.max(precio_mitad1, precio_mitad2)`** |
| Cart key | `buildCartLineKey` incluye `combinacion` en el JSON extra |
| Label | `combinedLineTitle` → `(Combinación) A + B` |
| Checkout / pedido | `selection.combinacion` + snapshots con `regla_precio: 'max'` |

**No** se suman dos pizzas. **No** se cobra “media + media” salvo que esa sea la regla (hoy solo existe `'max'`).

---

## 3. Archivos modificados

- `site/app/api/chat/_lib/chat-combination.ts` *(nuevo)*
- `site/app/api/chat/_lib/cart-proposals.ts`
- `site/app/api/chat/_lib/tools.ts`
- `site/app/api/chat/_lib/prompt.ts`
- `site/app/api/chat/_lib/schema.ts`
- `site/app/api/chat/_lib/chat-currency.ts`
- `site/app/api/chat/_lib/simulate-gemini.ts`
- `site/app/api/chat/[comercioId]/route.ts`
- `site/app/_lib/checkout-exchange-rate.ts` (`PCO` → `COP`)
- `site/app/api/_lib/checkout-exchange-config.ts`
- `site/app/v/[id]/_components/chat/ChatAssistantView.tsx`
- `site/app/v/[id]/_components/chat/chat-quick-replies.ts`
- `site/tests/chatbot-combination.test.ts` *(nuevo)*
- `site/scripts/chatbot-combination-e2e.mjs` *(contrato / smoke doc)*
- este informe

---

## 4. Contratos reutilizados

`autoPartnerSelection`, `resolveCombinedUnitPrice`, `validateCustomizationSelection`, `buildCartLineKey`, `combinedLineTitle`, `parseProductMenuOptions`, `convertAmountBetweenCurrencies`, `resolveCheckoutCurrencyRate`, `resolveMenuCurrency`, `formatChatMoney`.

---

## 5. Tamaños y quick replies

- `needs_options` con combinación → `ask_attribute_only: true` + `pending_configuration` (sin carrusel de productos).
- Cliente guarda `pendingConfiguration` y muestra chips reales (`Normal` / `Grande`).
- Respuesta “Grande” usa `deterministic_action: complete_pending_config` (0 Gemini).
- Chips obsoletos se invalidan por `contextId`.

---

## 6. Una propuesta real de pizza combinada

`prepare_cart_line_proposal({ product_id: Granjera, combine_with_product_id: Campesina, option_labels: ['Grande'] })` → **una** `propose_add` con `selection.combinacion.productId = Campesina`.

---

## 7. Precio verificado

Unit price = `resolveCombinedUnitPrice` (MAX). Tests comparan el resultado del proposal contra el helper del menú (sin hardcodear montos de negocio).

---

## 8. Moneda principal real del restaurante

Fuente: `comercio.moneda` vía `resolveMenuCurrency` (default `COP`).  
Alias `PCO` → `COP`.  
**Importante:** si en base de datos Trueno tiene `moneda = USD`, el chat mostrará USD hasta que la configuración del comercio diga `COP`. Esta corrección **no altera** datos del restaurante.

---

## 9. Fuente de tasas

`branding_ia.config_negocio` (`exchange_rates`, modes, sources) + `comercio.exchange_rate_*` + `marketRates` del menú público, resueltas por `resolveCheckoutCurrencyRate` / `convertAmountBetweenCurrencies`. Tool nuevo: `get_exchange_rate`.

---

## 10. Ejemplos de respuestas de conversión

Con tasa configurada:

> Claro. 1 USD = $4.000. 10 USD equivalen a $40.000 (referencial). Tasa del checkout…

Sin tasa verificable: error explícito, sin inventar ni mandar al vendedor por defecto.

---

## 11. Mensajes comerciales duplicados

`offerCloseSaleAfterAdd` agrupa confirms en un burst (~280 ms) y emite **un** close-sale. Limpia prompts pendientes previos.

---

## 12. Capturas móviles

No generadas en esta corrida (sin browser automation visual). Escenario listo para Playwright mock vía tests + `scripts/chatbot-combination-e2e.mjs`.

---

## 13. Carrito y checkout

La línea combina usa el mismo `CartLineSelection.combinacion` que el menú/localStorage/checkout. Schema de `cart_snapshot` ahora acepta `combinacion` (un nivel). No se crean pedidos desde el chat.

---

## 14. Vitest

`tests/chatbot*` + RLS emergency: **272 passed**, 1 skipped.

---

## 15. TypeScript

`tsc --noEmit` → **OK**.

---

## 16. Playwright

No hay suite Playwright tipada en `package.json`. Cobertura E2E de contratos en Vitest + script documental. Smoke live Gemini: **no ejecutado**.

---

## 17. Riesgos pendientes

1. Gemini Live puede seguir llamando dos `prepare` si ignora el prompt (mitigado por tool + sim + pending client).
2. Si `comercio.moneda` en Trueno no es COP, la UI seguirá en USD hasta corregir config.
3. Tasas “4000 COP/USD” mal modeladas como quote-per-base pueden requerir auditoría de datos de FX del comercio.
4. Sin capturas visuales ni usuarios reales en esta entrega.
5. `complete_pending_config` no cubre aún “cambiar una mitad” en el mismo pending (próximo incremento).

---

## GO / NO-GO

**NO-GO** deploy producción. Listo para validación en staging/piloto con autorización.
