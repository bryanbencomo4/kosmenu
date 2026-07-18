# Expected RLS matrix (Phase 2A.1)

Awaiting results from `supabase/sql/read-only-rls-verification.sql`.
Do not apply policies until that audit is reviewed.

| Table | anon | authenticated | service_role | Expected policy |
| ----- | ---- | ------------- | ------------ | --------------- |
| comercios | SELECT public menu fields only (via published slug) | SELECT/UPDATE own comercio via membership | full | Never `using (true)` for write |
| categorias | SELECT for published menus | CRUD own comercio | full | Filter by comercio ownership |
| productos | SELECT for published menus | CRUD own comercio | full | Filter by comercio ownership |
| metodos_pago | SELECT for published menus | CRUD own comercio | full | Filter by comercio ownership |
| pedidos | **no direct SELECT/UPDATE/DELETE** | SELECT/UPDATE **own comercio only** via `auth.uid()`↔comercio relation | full (Next APIs) | Public tracking via Next + token hash, not anon table reads |
| pedido details (if any) | none | same as pedidos | full | Same |
| delivery_invitations | none (tokenized Next routes) | limited merchant ops | full | Token scoped to one invitation |
| admin tables | none | none (or admin claim) | full | Admin host only |
| profiles / memberships | none | read self | full | Join key for comercio auth |
| storage.objects (`comprobantes`) | no public read; no open upload | none or tight insert | full | Private bucket + signed URLs |

## Notes

- `authenticated` ≠ belongs to comercio. Policies must join membership.
- Legacy public tracking that queried `pedidos` with anon must remain blocked after RLS harden.
- See also `proposed-pedidos-rls.sql` and `proposed-storage-comprobantes-policies.sql`.
