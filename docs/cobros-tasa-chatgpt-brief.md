# Brief para ChatGPT: Cobros y tasa de cambio

Copia todo este documento. Objetivo: **solo rediseño visual/UX**; **prohibido cambiar lógica, persistencia, validaciones o contratos**.

---

## Contexto del producto

Pantalla de configuración del merchant en la app Flutter (`app.elmenuxfa.com`). Los clientes (dueños de restaurantes) no encuentran cómo cambiar la **tasa de cambio**. El diseño actual es oscuro/poco claro en el panel de ajuste y la tasa está “escondida” detrás de monedas adicionales.

**Archivo principal:** `lib/screens/business_setup_screen.dart`  
**Panel de ajuste:** `lib/widgets/exchange_adjustment_panel.dart`  
**Math/parsing:** `lib/core/exchange_rate_adjustment.dart`  
**Entrada del menú:** Configuración → **Cobros y tasa** → abre `BusinessSetupScreen(settingsSection: payments)`.

```
Configuración → Cobros y tasa → BusinessSetupScreen (checkout)
  → Moneda principal
  → También aceptamos
  → Moneda en edición
  → Par de conversión / tasa  (solo si moneda ≠ principal)
       → Actualizar automáticamente
       → Fuentes BCV EUR / BCV USD / P2P / Google
       → Ajustar esta tasa para mi negocio
       → o Tasa manual
  → Métodos de pago de esa moneda
```

---

## Cómo lo usa el merchant (flujo mental)

1. Entra a **Configuración → Cobros y tasa**.
2. Elige **moneda principal** (precios del menú físico): USD, VES, COP o EUR.
3. Si quiere cobrar en otra moneda, marca **También aceptamos** (ej. VES).
4. Solo entonces aparece **Moneda en edición** y el **par de conversión** (ej. USD/VES).
5. Ahí configura tasa:
   - **Automática** (switch) + fuente (BCV EUR, BCV USD, P2P Binance, Google).
   - Opcional: checkbox **Ajustar esta tasa para mi negocio** (solo BCV/P2P) con referencia tipo “1 X equivale a Y”.
   - O **manual**: campo “1 BASE = ___ QUOTE”.
6. Más abajo, **métodos de pago** de la moneda en edición (Efectivo / Pagos digitales + editores).
7. **Guardar cambios**.

**Por qué no encuentran la tasa:** sin moneda adicional, el sistema dice “esta es tu moneda principal, no requiere tasa”. La tasa nunca aparece en el chip de la moneda principal.

---

## Secciones UI actuales (labels exactos)

### Chrome
- Título app bar: `Cobros y tasa de cambio`
- Subtítulo: `Configura monedas, tasas y los datos de cobro.`
- Botón: `Guardar cambios` / `Guardando...` / `Atras`

### Monedas
- `Moneda principal` + chips `{label} ({code})`
- `Tambien aceptamos` + FilterChips
- Banner `{n}/{total} monedas configuradas`
- `Moneda en edicion: {label} ({code})`

### Tasa (solo si moneda ≠ principal)
- `Par de conversion: BASE/QUOTE` + badge `Completa` / `Pendiente`
- Switch `Actualizar tasa automaticamente`
- Radios: `BCV EUR`, `BCV USD`, `Tasa Mercado (P2P)`, `Google`
- Botón `Ver historial`
- Campo `Tasa manual` con prefijo `1 {base} =` y sufijo `{quote}`
- Panel ajuste: checkbox `Ajustar esta tasa para mi negocio`, campo `1 {from} equivale a`, `Tasa aplicada ahora`, `Ver detalles`

### Pagos (por moneda en edición)
- `Metodos de pago - {currency}`: `Efectivo`, `Pagos digitales`
- Sheets: `Configurar Efectivo`, `Nueva/Editar cuenta de pago digital`, `Agregar campo`, `Guardar cuenta/datos`

---

## Inventario de funciones (no omitir / no romper)

### Core — `lib/core/exchange_rate_adjustment.dart`
- `isAdjustableExchangeSource(source)` — solo `bcv`, `bcv_usd`, `bcv_eur`, `p2p_binance`
- `ExchangeRateAdjustment` (`enabled`, `factor`, `referenceValue`, `referenceInverted`, `isActive`, `toMap`/`fromMap`)
- `computeAdjustmentFactor(commercialRate, sourceRate)` → `commercial/source`
- `commercialRateFromReference(referenceValue, inverted)`
- `resolveEffectiveExchangeRate(config, sourceRate)` — manual sin tocar; auto × factor si ajuste activo
- `parseAdjustmentReference(raw)` + formatos: `formatAdjustmentReferenceInput`, `formatAdjustmentRate`, `formatAdjustmentAmount`, `formatAdjustmentSample`, `formatAdjustmentFactor`, `formatAdjustmentPercent`

### UI panel — `lib/widgets/exchange_adjustment_panel.dart`
- `ExchangeAdjustmentPanel` — checkbox, TextField, preview, ExpansionTile detalles
- Callbacks obligatorios: `onToggled`, `onReferenceChanged`
- Props de datos: `enabled`, `referenceController`, `issue`, `sourceRate`, `effectiveRate`, `sourceLabel`, `factor`, `referenceValue`, etc.

### Screen — handlers clave en `business_setup_screen.dart` (mantener comportamiento)
**Carga:** `_hydrateCheckoutExchangeConfig`, `_hydrateExchangeAdjustments`, `_loadStoredPaymentMethods`, `_loadMarketRates`, `_loadProviderStatuses`, realtime + timer `_refreshLiveRateState`  
**Moneda/tasa:** `_requiresExchangeRateForCurrency`, `_ensureCurrencyConfig`, `_loadExchangeConfigForCurrency`, `_syncExchangeConfigForCurrency`, `_enforceExchangeRulesForCurrency`, `_rateForSource`, `_resolveAutoRate`, `_effectiveExchangeRateForCurrency`, `_suggestExchangeRate`  
**Ajuste:** `_buildExchangeAdjustmentSection`, `_onAdjustmentToggled`, `_onAdjustmentReferenceChanged`, `_reanchorDirtyAdjustments`, `_confirmSourceChangeWithAdjustment`, `_syncAdjustmentController`  
**Validación:** `_isCurrencyExchangeRateConfigured`, `_isExchangeRateConfigured`, `_adjustmentBlocksSave`, `_hasPaymentDetailsForCurrency`, `_configuredCurrenciesCount`  
**Pagos:** `_openCashEditor`, `_openTransferAccountEditor`, `_syncPaymentMethods`  
**Guardado:** `_saveSettingsSection` (rama payments), `_persistCheckoutBranding`, `_buildBrandingIaPayload`, `_writeComercioFields`  
**Historial:** `_showRateHistorySheet`, `_fetchRateHistoryRows`

### Estado UI (no eliminar variables; se puede reorganizar layout)
`_selectedCurrencies`, `_primaryCheckoutCurrency`, `_activeCheckoutCurrency`, `_exchangeRateController`, `_exchangeRateByCurrency`, `_exchangeRateMode` / `ByCurrency`, `_exchangeRateSource` / `ByCurrency`, `_marketRates`, `_adjustmentByCurrency`, `_adjustmentReferenceController`, `_selectedPaymentsByCurrency`, `_paymentMethodDraftsByCurrency`, `_saving`

### Persistencia (contratos)
**`comercios`:** `moneda`, `tasa_cambio_pesos`, `exchange_rate_mode|source|value|quote_currency`, `last_rate_update`, `metodos_pago`, `branding_ia`  
**`branding_ia.config_negocio`:** `checkout_currencies`, `exchange_rates`, `exchange_rate_modes` (`auto`|`manual` only), `exchange_rate_sources`, `exchange_rate_adjustments`  
**`metodos_pago` rows:** tipos `efectivo__{ccy}`, `transferencia__{ccy}__{i}`  
**Lectura externa:** `global_market_rates`, `market_rate_provider_status`

### Validaciones / mensajes (conservar copy o equivalentes semánticos)
- Sin moneda principal / sin tasa / pagos incompletos / ajuste inválido (`Ingresa un valor mayor que 0.`)
- Máx 5 cuentas digitales, 8 campos, nota efectivo 280 chars
- Diálogo cambio de fuente con ajuste: Cancelar / Quitar ajuste / Mantener mi cambio
- P2P aplica markup comprador +0.6%; Google se deshabilita si hay BCV para el par VES

---

## Reglas estrictas (solo diseño)

1. **No** cambiar fórmulas, nombres de métodos, payloads de save, enums de modo (`auto`/`manual`), ni omitir monedas adicionales como condición para mostrar tasa (a menos que el diseño mejore discoverability **sin** alterar la regla de negocio: tasa solo para monedas ≠ principal).
2. **Sí** se puede: jerarquía visual, tipografía, color (evitar purple-on-white genérico / dark purple panel feo del adjustment), cards, tabs, sticky “Moneda en edición”, CTAs claros tipo “Configurar tasa VES”, tooltips, empty states que expliquen “agrega Bs/COP para configurar tasa”.
3. Mantener todos los controles funcionales: switch auto, radios de fuente, ajuste, historial, tasa manual, métodos de pago y editors.
4. Accesibilidad: preview de conversión sigue siendo live region; inputs numéricos siguen aceptando `0-9.,`.
5. Entregar: wireframes/descripción de layout + lista de cambios CSS/Flutter widgets **sin** tocar handlers ni `_persistCheckoutBranding`.

---

## Pain points a resolver

- Tasa invisible hasta “También aceptamos”
- “Moneda en edición” poco obvia
- Panel de ajuste oscuro (`ExchangeAdjustmentPanel`) desentonado y confuso
- Switch auto oculta el campo manual
- Historial y ajuste anidados / fáciles de no ver
- Un solo scroll largo mezcla monedas + tasas + pagos
