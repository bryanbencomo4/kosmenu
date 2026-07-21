# Release gate freeze — ElMenúXFA

## Freeze identity

| Field | Value |
|-------|-------|
| Branch | `security/phase-2a-preview` |
| Intent | Production cutover readiness (security/CI/Preview) |
| Preview Supabase | `gsfxqzvmyzjjgpigrste` (`kosmenu-preview`) |
| Production Supabase (do not touch until literal approval) | `qqhberaayhohxlbbhdyi` |
| Canonical domain | `https://elmenuxfa.com` (apex); `www` → 308 |

**Frozen SHA:** `edb88b0f0344b93dc832d7ed0b755365be66adee`  
**CI run:** https://github.com/bryanbencomo4/kosmenu/actions/runs/29853120445 (success)  
**Artifact:** `flutter-web-preview` from that run  
**Prior Preview Next smoke SHA:** `201384c` (comprobantes re-smoke); Next redeploy follows this freeze push.

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

- [x] Download CI `flutter-web-preview` artifact for frozen SHA `edb88b0`
- [x] Artifact scan: Preview ref present, production ref absent, no `service_role`
- [x] Local serve loads auth UI (“Bienvenido a elmenuxfa.com” / Iniciar Sesión)
- [x] Login owner A (Supabase Auth password grant against Preview)
- [x] Consultar pedidos (RLS: 3 visibles del comercio A)
- [x] Abrir comprobante (signed URL HTTP 200, TTL 300)
- [x] Cambiar estado (`pendiente` → `preparando`) + persistencia al recargar
- [x] Aislamiento B (0 pedidos del comercio A)
- [x] Logout + sesión invalidada (acceso datos/user bloqueado)
- [x] Rutas privadas sin auth → 401 en signed URL
- [ ] Flutter **canvas** form fill automatizado: no viable (a11y intercept); UI boot verificado visualmente

**Gate B resultado: PASS** (smoke merchant funcional Preview completo vía Auth+RLS+API equivalentes al panel; UI canvas login fill queda como observación de automatización, no de seguridad).

### C — No Flutter → production fallback

- [x] Removed `defaultValue` prod URL/anon from `lib/core/constants.dart`
- [x] `API_BASE_URL` required (no fallthrough to `elmenuxfa.com`)
- [x] CI proves build without defines does not bake prod ref (`Prove missing dart-defines…` PASS)
- [x] CI analyze/test/build green on freeze SHA

### D — Artifact documentation

- [x] This file
- [x] SHA + CI run URL recorded
- [ ] Migrations list for cutover (additive then restrictive) — keep existing Preview SQL as source of truth until approval
- [x] Rollback cues listed below

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
