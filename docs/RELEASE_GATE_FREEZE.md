# Release gate freeze — ElMenúXFA

## Freeze identity

| Field | Value |
|-------|-------|
| Branch | `security/phase-2a-preview` |
| Intent | Production cutover readiness (security/CI/Preview) |
| Preview Supabase | `gsfxqzvmyzjjgpigrste` (`kosmenu-preview`) |
| Production Supabase (do not touch until literal approval) | `qqhberaayhohxlbbhdyi` |
| Canonical domain | `https://elmenuxfa.com` (apex); `www` → 308 |

**Frozen SHA:** fill after green CI on this commit (see git log / Actions).

## Required human approval (hard stop)

Do **not** run production cutover until the operator types exactly:

`Apruebo ejecutar la ventana de producción`

## Environment matrix

| Surface | Supabase | API / Site |
|---------|----------|------------|
| Preview Vercel | `gsfxqzvmyzjjgpigrste` | Preview deployment / branch alias |
| Flutter Preview CI | dart-defines → Preview URL + anon | `PREVIEW_API_BASE_URL` secret |
| Production | `qqhberaayhohxlbbhdyi` only | `elmenuxfa.com` |

Flutter has **no silent production defaults**. Every build must pass:

```text
--dart-define=API_BASE_URL=...
--dart-define=SUPABASE_URL=...
--dart-define=SUPABASE_ANON_KEY=...
```

## Gates closed before requesting approval

### A — Comprobantes smoke (last Preview deploy)

Validated against Preview deployment of the readiness branch:

- [x] Upload comprobante → `storage://comprobantes/...`
- [x] Create order with proof ref
- [x] Bucket `comprobantes.public = false`
- [x] Merchant A signed URL HTTP 200, TTL 300s, host Preview
- [x] No auth → 401
- [x] Merchant B (other tenant) → 404
- [x] Anon list of comercio prefix → empty (0 objects)
- [x] Public/authenticated anon object GET → denied

### B — Merchant panel smoke

- [ ] Download CI `flutter-web-preview` artifact for frozen SHA
- [ ] Login Preview owner A
- [ ] See order / open comprobante
- [ ] Allowed status change
- [ ] Isolation vs owner B
- [ ] Session/API error handling (basic)

### C — No Flutter → production fallback

- [x] Removed `defaultValue` prod URL/anon from `lib/core/constants.dart`
- [x] `API_BASE_URL` required (no fallthrough to `elmenuxfa.com`)
- [x] CI proves build without defines does not bake prod ref
- [x] CI analyze/test/build use Preview dart-defines

### D — Artifact documentation

- [x] This file
- [ ] SHA + CI run URL recorded after green Actions
- [ ] Migrations list for cutover (additive then restrictive)
- [ ] Rollback notes

## Cutover order (after approval only)

1. Backup prod (DB + RLS export + storage policies + env inventory)
2. Additive migrations on prod
3. Deploy Vercel **without** promoting apex until restrictive RLS is live
4. Restrictive RLS + FORCE + private storage + negative tests
5. Promote apex + smoke
6. Monitor 24–48h

## Rollback cues (abort immediately)

- Cross-tenant data or comprobante access
- Public comprobante object
- Wrong Supabase project in artifact
- Order creation outage / broken idempotency
- Sustained 5xx after promote
