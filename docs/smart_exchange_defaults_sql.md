# Smart Exchange: SQL Rapido

Para cambiar el valor que ves en el formulario de Pagos (por ejemplo 110), ejecuta esta unica instruccion en Supabase SQL Editor:

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (477.1488, 630.6000, 'sql_editor', jsonb_build_object('note', 'actualizacion manual'));
```

Ejemplo:

- Si el negocio esta en modo `auto` y fuente `bcv`, se reflejara `477.1488`.
- Si esta en modo `auto` y fuente `p2p_binance`, se reflejara `630.6000`.

Nota: estos valores son `VES por 1 USD`.

Monedas recomendadas para Venezuela: `USD`, `EUR` y `COP`.

## Modelo Actual

Hoy el backend solo guarda dos referencias globales en `public.global_market_rates`:

- `bcv_rate`: `VES por 1 USD`
- `p2p_binance_rate`: `VES por 1 USD`

Eso significa que solo los pares que dependen de `VES` se pueden recalcular por SQL global.
Los pares `USD/COP`, `USD/EUR`, `COP/EUR` y sus inversos no tienen tabla propia en Supabase en este modelo; hoy salen de valores de referencia definidos en la app.

Referencias actuales de la app:

- `USD -> COP = 4000`
- `USD -> EUR = 0.92`

## SQL Por Par Controlable

Usa estos SQL cuando quieras fijar una tasa objetivo para un par especifico.
En todos los casos, reemplaza `TU_TASA` por el valor deseado para el par indicado.

### USD/VES

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (
	TU_TASA,
	TU_TASA,
	'sql_editor',
	jsonb_build_object('pair', 'USD/VES', 'note', '1 USD = TU_TASA VES')
);
```

### VES/USD

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (
	1 / TU_TASA,
	1 / TU_TASA,
	'sql_editor',
	jsonb_build_object('pair', 'VES/USD', 'note', '1 VES = TU_TASA USD')
);
```

### COP/VES

Supone la referencia actual de la app: `1 USD = 4000 COP`.

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (
	TU_TASA * 4000,
	TU_TASA * 4000,
	'sql_editor',
	jsonb_build_object('pair', 'COP/VES', 'note', '1 COP = TU_TASA VES')
);
```

### VES/COP

Supone la referencia actual de la app: `1 USD = 4000 COP`.

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (
	4000 / TU_TASA,
	4000 / TU_TASA,
	'sql_editor',
	jsonb_build_object('pair', 'VES/COP', 'note', '1 VES = TU_TASA COP')
);
```

### EUR/VES

Supone la referencia actual de la app: `1 USD = 0.92 EUR`.

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (
	TU_TASA * 0.92,
	TU_TASA * 0.92,
	'sql_editor',
	jsonb_build_object('pair', 'EUR/VES', 'note', '1 EUR = TU_TASA VES')
);
```

### VES/EUR

Supone la referencia actual de la app: `1 USD = 0.92 EUR`.

```sql
insert into public.global_market_rates (bcv_rate, p2p_binance_rate, provider, payload)
values (
	0.92 / TU_TASA,
	0.92 / TU_TASA,
	'sql_editor',
	jsonb_build_object('pair', 'VES/EUR', 'note', '1 VES = TU_TASA EUR')
);
```

## Pares Que Hoy No Se Actualizan Por SQL Global

Con el esquema actual, estos pares no tienen una tasa propia en Supabase:

- `USD/COP`
- `COP/USD`
- `USD/EUR`
- `EUR/USD`
- `COP/EUR`
- `EUR/COP`

Si quieres que esos pares tambien se actualicen por SQL, hay que ampliar el modelo a una tabla real por par, por ejemplo `currency_pair_rates(base_currency, quote_currency, rate, source, updated_at)`.
