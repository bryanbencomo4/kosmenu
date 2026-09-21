# Merchant panel migrations — checklist

Apply **in order**, never out of order, never to prod without the cutover phrase.

1. `20260917120000_merchant_panel_real_modules.sql`
2. `20260917140000_menu_funnel_and_staff_guards.sql`

## Safety

- Additive only: `IF NOT EXISTS`, `create or replace`, `drop policy if exists` + recreate.
- Does **not** `DELETE` merchant rows, pedidos, productos, or drop `comercios`.
- `horarios jsonb not null default '{}'` backfills existing comercios with empty JSON (orders stay allowed until hours are configured).
- Rollback in prod (preferred if only these two migrations were applied): `supabase/sql/merchant-panel-operational-rollback.sql` then `backups/prod-20260917-021516/restore_owner_helpers.sql`. That reverses additive objects and does **not** rewind merchant rows.
- Last-resort physical restore: Dashboard → Database → Backups → restore id `1691808964` (`2026-09-16T06:56:15Z`). **Loses all writes after that snapshot.** PITR is off.
- Do not `DROP COLUMN horarios` after the panel is live with real hours data; the operational script includes that drop only for a same-window undo.

## 20260917120000

| Kind | Object |
|---|---|
| Function | `is_comercio_owner`, `is_owner_of_comercio` |
| Column | `comercios.horarios` |
| Table | `menu_analytics_events`, `comercio_members`, `comercio_member_invites` |
| Index | analytics `(comercio_id, created_at)`, `(comercio_id, event_type, created_at)`; members `user_id`; invites pending email |
| Function | `is_comercio_member`, `comercio_has_role` |
| RLS | FORCE RLS on new tables; member select/write on pedidos, catalog, upsell |
| Function | `get_menu_analytics_summary`, staff invite/list/revoke/accept |
| Grant | authenticated execute on helpers; anon revoked |

## 20260917140000

| Kind | Object |
|---|---|
| Constraint | widen `event_type` check to funnel events |
| Column | `menu_analytics_events.product_id`, `metadata` |
| Index | `(comercio_id, event_type, product_id)` where product_id not null |
| Function | replace `get_menu_analytics_summary` (funnel + ticket + top viewed) |
| Trigger | `trg_enforce_staff_pedido_update` / `enforce_staff_pedido_update` |

## Tenant rule

Owner of comercio A cannot read/write comercio B: `owner_id = auth.uid()` or `comercio_members.user_id = auth.uid()` **and** `comercio_id` of the row. Analytics RPC raises if `not is_comercio_member(p_comercio_id)`.

## Pre-apply gate

```sql
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_comercio_owner', 'is_comercio_member', 'comercio_has_role');
```

`is_comercio_owner` is created by 120000 if missing. Still take a backup first.
