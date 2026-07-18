# Pedido tracking token backfill plan (DO NOT EXECUTE YET)

## Aggregates (read-only, remote snapshot)

| Metric | Count |
|--------|------:|
| Total pedidos | 9 |
| Active non-terminal | 6 |
| Delivered | 0 |
| Cancelled | 3 |
| Last 30 days | 3 |
| Active last 7 days | 1 |

## Strategy

1. Apply column migration `20260718190000_pedido_public_tracking_token.sql` in Preview first.
2. Backfill **only** active/non-terminal rows (`pendiente`, `confirmado`, `preparando`, `en_camino`).
3. Generate token with `gen_random_bytes(32)` → base64url (or app script); store **SHA-256 hex hash only**.
4. Never print full tokens in SQL client output / logs.
5. Delivery of new links:
   - Preferred: controlled resend via `/api/send-order` with `regenerateTrackingLink: true` (email match required).
   - Optional WhatsApp from merchant panel after Preview.
6. Terminal/old orders: leave hash null; tracking stays closed unless customer requests regenerate.
7. Record rotation metadata in `detalles.tracking_token_rotated_at` only (no plaintext).

## Suggested one-off script shape (service role / operator, Preview)

```sql
-- PSEUDOCODE — do not run until approved
-- For each active pedido without hash:
--   token := cryptographically random
--   hash := sha256(token)
--   update pedidos set public_tracking_token_hash = hash,
--     detalles = jsonb_set(detalles, '{public_tracking_token_hash}', to_jsonb(hash))
--   deliver token out-of-band (email/WhatsApp), never SELECT it back
```

Prefer an app/operator script over SQL that returns tokens in the result grid.

## Order of operations in Preview

1. RLS/grants migration  
2. Storage comprobantes migration  
3. SECURITY DEFINER execute hardening  
4. Token column migration  
5. Backfill active only  
6. Configure `SUPABASE_SERVICE_ROLE_KEY`  
7. Smoke Flutter + Next checkout/tracking  
