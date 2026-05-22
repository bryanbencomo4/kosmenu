# refresh-market-rates

Edge Function para actualizar automaticamente `public.global_market_rates` con tres fuentes:

- `bcv`: scraping controlado del BCV (`VES por 1 USD`)
- `p2p_binance`: recoleccion de anuncios `USDT/VES` de Binance P2P y calculo por mediana
- `google`: anclas `USD/COP`, `USD/EUR` y `VES/USD` via `open.er-api.com` (primario), Yahoo chart API y JSON opcional

## Que hace

1. Busca la tasa BCV y la tasa P2P Binance.
2. Valida que no sean cero ni outliers extremos contra la ultima referencia guardada.
3. Si una fuente falla, intenta usar fallback con la ultima tasa valida de esa fuente.
4. Inserta una nueva fila en `public.global_market_rates`.
5. Registra la corrida tecnica en `public.market_rate_fetch_logs`.

## Secrets requeridos

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RATE_REFRESH_SECRET`

## Deploy recomendado

```bash
supabase functions deploy refresh-market-rates --no-verify-jwt
```

Se recomienda `--no-verify-jwt` para poder invocarla desde un scheduler externo o desde Supabase usando un header secreto propio.

## Invocacion manual

```bash
curl -X POST "https://YOUR_PROJECT.functions.supabase.co/refresh-market-rates" \
  -H "Content-Type: application/json" \
  -H "x-rate-refresh-secret: TU_SECRETO" \
  -d '{"dry_run": false}'
```

## Dry run

```bash
curl -X POST "https://YOUR_PROJECT.functions.supabase.co/refresh-market-rates" \
  -H "Content-Type: application/json" \
  -H "x-rate-refresh-secret: TU_SECRETO" \
  -d '{"dry_run": true}'
```

## Scheduler recomendado

Frecuencia sugerida: cada 10 minutos.

Si usas Supabase Scheduler o cualquier cron externo, solo debes hacer un `POST` a la function con el header:

```text
x-rate-refresh-secret: TU_SECRETO
```

## Notas operativas

- La unidad persistida sigue siendo `VES por 1 USD`.
- BCV y Binance P2P son fuentes distintas; una brecha alta entre ambas genera advertencia, no bloqueo automatico.
- Si ambas fuentes fallan y no existe fallback previo, la corrida falla sin sobreescribir tasas.