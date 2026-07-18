# SECURITY DEFINER review (Phase 2A.2)

## Helpers used in RLS

| Function | SECURITY DEFINER? | search_path | Auth |
|----------|-------------------|-------------|------|
| `is_comercio_owner(uuid)` | no (STABLE SQL) | default | `owner_id = auth.uid()` |
| `is_owner_of_comercio(uuid)` | no (STABLE SQL) | default | same |

Proposed: revoke EXECUTE from `anon`/`public`; keep for `authenticated`.

## Delivery RPCs

| Function | Auth check | Risk | Proposed |
|----------|------------|------|----------|
| `create_delivery_invitation` | auth.uid() must own order | Returns plaintext token once; anon currently has EXECUTE | Revoke anon EXECUTE |
| `revoke_delivery_invitation` | owner check | OK if EXECUTE limited | Revoke anon |
| `log_delivery_invitation_event` | **no auth check** | Callable by anyone with EXECUTE to insert events | Revoke anon; prefer service_role/authenticated only |
| `upsert/list/deactivate/touch_delivery_courier` | owner check | OK if EXECUTE limited | Revoke anon |

All use `SET search_path TO 'public'` (not empty). Follow-up: migrate to `search_path = ''` + schema-qualified names after Flutter smoke.

## Other SECURITY DEFINER (documented, not changed)

AI credits, admin role helpers, newsletter subscribe, notify triggers — out of scope for this remediation batch unless EXECUTE is public for destructive ops.

## Migration

`20260718193200_harden_security_definer_execute.sql` — grants only; no function body changes.
