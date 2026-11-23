# Discovery Assistant — delivery report

**Branch:** `feature/discovery-assistant` (local only — no push / merge / deploy)  
**Scope:** consumer discovery at `/asistente`  
**Date:** 2026-11-23

## Verdict: **GO for local review**

Production remains untouched (flags default off; Gemini live blocked without persistent quota).

## Architecture

```
/asistente (UI flag)
  ├─ chips / Ver más  → GET /api/comercios/directory?mode=clientes&limit&offset&…
  └─ composer (optional) → POST /api/asistente
        ├─ SIMULATE / deterministic tools → listClientDirectory
        └─ live Gemini → only if DISCOVERY_ASSISTANT_ALLOW_GEMINI + postgres quota ready
```

Quota backends: `filesystem` (dev/test only) | `postgres` (reserved, not shipped) | `none` (prod default).  
Filesystem never authorizes live Gemini in production.

## Conditions

| # | Status |
| --- | --- |
| 1 Filesystem quota only in dev/test; prod Gemini off until persistent backend | GO |
| 2 Real `offset` on directory API (no invented client-only offset) | GO |
| 3 Real `isOpen` / `openLabel`; null → "Horario no confirmado" | GO |
| 4 Deterministic chips; directory continues if Gemini fails | GO |
| 5 Chat links = UX slug **and** effective preview env | GO |
| 6 Progressive pages (24 + Ver más / offset) | GO |
| 7 `?ref=wa` sanitized; no WaSender inbound | GO |
| 8 No deploy / migrations / prod flags / billed Gemini | GO |
| 9 Vitest + tsc + Playwright mobile | GO |
| 10 Commits on `feature/discovery-assistant` only | GO |

## Key files

- `site/middleware.ts` — `/asistente` excluded
- `site/app/_lib/discovery-assistant.ts`
- `site/app/api/asistente/**`
- `site/app/asistente/**` (page, view, carousel, composer)
- `site/app/api/_lib/public-directory.ts` — `offset` / `hasMore`
- `site/tests/discovery-assistant-*.test.ts`
- `site/scripts/discovery-assistant-playwright.mjs`
- `docs/discovery-assistant-screenshots/*.png`

## Test results

### Vitest (full suite)

- **124** files passed
- **865** tests passed (4 skipped)
- Discovery-specific: config, tools, simulate, middleware, offset, quota

### TypeScript

- `npx tsc --noEmit` — **clean**

### Playwright mobile (390×844)

- Result: **ok: true**
- welcome, chip pizzas (24), empty search, gemini fail fallback, geo deny, pagination 24→40, `ref=wa`
- Screenshots under `docs/discovery-assistant-screenshots/`

## Limitations

- Postgres discovery quota RPCs not shipped (migration deferred by design).
- Live Gemini disabled in production until that backend exists.

## Commits

See `git log feature/chat-supervision-human..HEAD` on `feature/discovery-assistant`.
