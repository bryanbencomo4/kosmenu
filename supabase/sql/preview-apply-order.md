# Preview apply order (2A.3 — corrected)

**Rule:** Never apply restrictive RLS before compatible Flutter + Next are deployed and smoke-tested in Preview.

Production `pedidos` remains publicly readable/updatable until the restrictive window. Minimize the gap between deploying compatible clients and closing policies.

---

## Phase 0 — Local complete (no remote)

- [x] Flutter checkout → `POST /api/orders`
- [x] Flutter comprobante upload → `POST /api/orders/comprobantes`
- [x] Flutter signed URL → `GET /api/business/orders/[orderId]/comprobante`
- [x] Idempotency key + local table migration
- [x] Public menu DTO (no `owner_id`)
- [x] Delivery event function hardening (local migration)
- [ ] Human review of migrations under `supabase/migrations/20260718*`

**GO / NO-GO:** All local tests green. No remote apply yet.

---

## Phase 1 — Additive only (Preview)

Apply in this order:

1. Snapshot / backup Preview DB.
2. `20260718190000_pedido_public_tracking_token.sql` (column + index).
3. `20260718194000_order_idempotency_keys.sql`.
4. `20260718193100_private_comprobantes_bucket.sql` (private bucket).
5. `20260718194300_public_menu_column_guard_views.sql` (views; grants still revoked).
6. Set Preview env: `SUPABASE_SERVICE_ROLE_KEY`, site URL, Resend/WhatsApp as needed.
7. Deploy Preview **Next** + Preview **Flutter** builds that include 2A.3 clients.

### Checkpoint A — GO / NO-GO

Smoke without restrictive RLS:

1. Public menu loads via `/api/menu`.
2. Checkout creates order via `/api/orders` (idempotent retry does not double-create).
3. Tracking opens with `?t=`.
4. Comprobante upload returns `storage://comprobantes/...`.
5. Merchant Flutter opens signed URL for own order; other comercio gets generic 404.
6. Delivery invite create/revoke still works.

**NO-GO** if checkout or merchant panel regresses → rollback app deploy only; DB additive changes can stay.

---

## Phase 2 — Restrictive (Preview) — short window after Checkpoint A

1. `20260718194100_harden_log_delivery_invitation_event.sql`
2. `20260718193200_harden_security_definer_execute.sql`
3. `20260718193000_sanitize_rls_and_grants.sql` (drops public pedidos SELECT/UPDATE; catalog write; etc.)
4. Re-run full smoke (Checkpoint B).
5. Backfill active pedidos tracking token hashes (script from `pedido-tracking-backfill-plan.md`).

### Checkpoint B — GO / NO-GO

- Anon cannot `select/update` `pedidos` directly.
- Flutter menu/checkout still works (API paths).
- Owner can list/update own pedidos.
- Signed URL authz still holds.
- Delivery + admin paths OK.

**NO-GO** → restore policies from snapshot (prefer not re-adding `USING true` SELECT/UPDATE). Keep bucket private.

---

## Phase 3 — Production (single controlled window)

Same sequence, compressed:

1. **Additive DB** (token column, idempotency table, private bucket, views).
2. **Deploy compatible apps** (Next + Flutter).
3. Immediate smoke (subset of Checkpoint A).
4. **Restrictive RLS + grants + function revoke** in the same window.
5. Immediate smoke (Checkpoint B).
6. Backfill active tokens.
7. Monitor errors 15–30 min.

Do **not** leave production for days with additive-only + old public policies after announcing the cutover — close policies in the same window once apps are live.

---

## Emergency (production still bleeding)

If public SELECT/UPDATE on `pedidos` must stop before full sanitize:

- Review `20260718194200_emergency_p0_close_pedidos_read_update.sql`
- **Only after** Flutter no longer uses `insert().select()` (2A.3), or accept temporary INSERT-only without RETURNING.
- Independent, reversible, human-approved. Not auto-applied.

---

## Explicitly out of scope until Preview Checkpoint B

- H05–H08 (SEO/content)
- Publishing `pedidos` to Realtime
- Production push without Checkpoint B
