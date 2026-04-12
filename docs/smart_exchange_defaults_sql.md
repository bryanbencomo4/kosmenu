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
