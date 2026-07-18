# RLS policy change report (Phase 2A.2) — LOCAL PROPOSAL

Confirmed remote risk: permissive `USING true` / `WITH CHECK true` policies on `pedidos` and catalog tables combine with OR, defeating owner policies. Grants include `TRUNCATE` (not governed by RLS).

## Access matrix — current (remote)

| Table | anon | authenticated | Notes |
|-------|------|---------------|-------|
| pedidos | SELECT/UPDATE/INSERT via PUBLIC true policies | ALL via owner + PUBLIC true | **P0** |
| categorias/productos/catalogos | CRUD via PUBLIC true | owner + PUBLIC true | **P0** |
| comercios | SELECT true | owner + SELECT true | Over-broad read |
| metodos_pago | SELECT true | owner ALL | Over-broad read |
| delivery_couriers | RLS off + full grants | same | **P0** |
| global_market_rates | RLS off | same | Needs RLS |

## Access matrix — proposed

| Table | anon | authenticated | service_role |
|-------|------|---------------|--------------|
| comercios | SELECT `en_linea` | SELECT online or owner; INSERT/UPDATE/DELETE owner | full |
| categorias/productos/catalogos | SELECT public menu (online) | owner CRUD | full |
| metodos_pago | SELECT online comercio | owner CRUD | full |
| pedidos | **none** | SELECT + UPDATE owner only | full (Next APIs) |
| delivery_couriers | none | SELECT owner; writes via RPC | full |
| global_market_rates | SELECT | SELECT | full (writers) |
| delivery_invitations/events | none | SELECT owner (existing) | full |

## Policies removed (by expression / name)

Any policy on listed tables where `USING` or `WITH CHECK` is exactly `true`, plus:

- `Public insert pedidos`
- `Clientes pueden crear pedidos`
- `Permitir inserción pública pedidos`
- `Comercios pueden ver sus pedidos`
- `Permitir actualización de pedidos para todos`
- `Owners manage own pedidos` (replaced by split select/update)

## Policies added (English names)

See migration `20260718193000_sanitize_rls_and_grants.sql` for full SQL.

| New policy | Role | Op | USING / CHECK | Dependent flow |
|------------|------|----|---------------|----------------|
| comercios_anon_select_online | anon | SELECT | `en_linea` | Public menu |
| comercios_authenticated_select_online_or_owner | authenticated | SELECT | online or owner | Flutter + menu |
| comercios_authenticated_*_owner | authenticated | I/U/D | `owner_id = auth.uid()` | Flutter setup |
| *_anon_select_public_menu | anon, authenticated | SELECT | online comercio | Public menu |
| *_owner_* | authenticated | CRUD | `is_comercio_owner` | Flutter panel |
| pedidos_owner_select / update | authenticated | S/U | `is_comercio_owner` | Flutter orders |
| delivery_couriers_owner_select | authenticated | SELECT | `is_comercio_owner` | Flutter RPC fallback |
| global_market_rates_select | anon, authenticated | SELECT | true (public FX) | Business setup rates |

## Grants revoked / resulting

Revoked from `anon`/`authenticated` as applicable: `TRUNCATE`, `REFERENCES`, `TRIGGER`, and all writes where not needed.

| Table | anon | authenticated |
|-------|------|---------------|
| pedidos | none | SELECT, UPDATE |
| delivery_couriers | none | SELECT |
| comercios/categorias/productos/catalogos/metodos_pago | SELECT | SELECT, INSERT, UPDATE, DELETE |
| global_market_rates | SELECT | SELECT |

`service_role` untouched.

## Flutter compatibility

| Flow | Impact |
|------|--------|
| Panel pedidos SELECT/UPDATE | OK via owner policies |
| Panel catalog CRUD | OK via owner policies |
| Delivery RPCs | OK if EXECUTE granted to authenticated (see security definer migration) |
| `public_menu_view.dart` direct `pedidos.insert` | **BREAKS** — must use Next `/api/orders` |
| Realtime pedidos | Not published today; panel uses polling/query — OK |

## Rollback

1. Restore policies from pre-change `pg_dump --schema-only` or prior migration snapshot.
2. Do not re-enable `USING true` policies.
3. If emergency checkout blocked: temporarily allow constrained service-role-only inserts (already the Next path).
