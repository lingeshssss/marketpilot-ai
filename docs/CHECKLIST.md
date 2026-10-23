# Completion checklist (updated 2026-10-23)

Legend: ✅ done & verified · 🧪 verified with mocked/demo data only · ⛔ blocked on external setup (code complete)

## Phases
| Phase | Status | Evidence |
|---|---|---|
| 1 Provider interface, normalized quote snapshot, calendar, caching, stale handling | ✅ / 🧪 | `server/market/*`, `public/shared/calendar.js`; unit + integration tests. Live Massive calls ⛔ (no API key) |
| 2 Deterministic TA, versioned analysis, documented scores | ✅ | `public/shared/analysis.js`, `docs/ANALYSIS.md`, reference-fixture tests |
| 3 Auth (Better Auth), Postgres, migrations, isolation, export/delete | ✅ (PGlite) / ⛔ prod DB | integration tests; production `DATABASE_URL` not configured |
| 4 Symbol detail, watchlists, scanner, portfolio | ✅ / 🧪 | E2E journeys (desktop + phone, demo data) |
| 5 Grounded AI with schema + grounding validation | 🧪 / ⛔ | mocked model client tests; no `ANTHROPIC_API_KEY` |
| 6 Server-side alerts, idempotency, delivery | ✅ (in-app) / ⛔ email | integration tests incl. concurrent runs; Resend key absent |
| 7 Apple-design redesign | ✅ | tokens/themes/reduced-motion/transparency/contrast in `public/css/app.css`; screenshots |
| 8 Production readiness, CI, docs | ✅ | `scripts/check.js`, `npm run typecheck`, `.github/workflows/*`, `docs/OPERATIONS.md`, `.env.example` |
| Runtime validation | ✅ | zod: env (`validateEnv`, names-only reporting), provider responses (`server/market/massive.js`), AI output; `tests/unit/contracts.test.js` |
| Scanner match reasons, backfill progress, dashboard news, prefs carried over at sign-in | ✅ / 🧪 | integration + E2E |

## Acceptance tests
| # | Requirement | Result | Where |
|---|---|---|---|
| 1 | Same instrument/session ⇒ identical price & change everywhere | ✅ API (quote ↔ scanner ↔ overview ↔ portfolio) and UI (detail ↔ dashboard ↔ tape) | `api.test.js` quotes; `journeys.spec.js` keyboard search |
| 2 | Rerender/navigation doesn't change values | ✅ | same tests (reload assertions); `Math.random` banned by `npm run check` |
| 3 | Explanations agree with indicators | ✅ | 300-series property test; E2E RSI card ↔ text |
| 4 | Market state: closed days, holidays, DST, early closes | ✅ | `calendar.test.js` (NYSE 2024–2027 lists, DST weeks, early closes, Sunday 2026-10-18) |
| 5 | Portfolio totals reconcile across screens | ✅ | `api.test.js` deepEqual of dashboard vs page totals; E2E text equality |
| 6 | Data persists; other users can't access | ✅ | `api.test.js` watchlists/portfolios/alerts/AI/export isolation; E2E reload persistence |
| 7 | Stock & ETF search incl. SPY | 🧪 | mocked Massive search; live ⛔ until key — `npm run smoke:provider` checks SPY |
| 8 | Alerts evaluate with browser closed, no duplicates | ✅ | cron endpoint tests, concurrent runs → exactly one event |
| 9 | Missing credentials/outage/rate limit ⇒ honest states | ✅ | `unconfigured.test.js`; outage/429 test; preview deployment (no DB) |
| 10 | AI numbers match inputs; claims keep sources | 🧪 | grounding unit tests; mocked client accepts grounded, rejects `$999.99`/`87%` |
| 11 | Phone & desktop complete workflows | ✅ (demo data) | E2E on Desktop Chrome + Pixel 7, zero horizontal overflow |
| 12 | Direct routes, refresh, back/forward, keyboard | ✅ | E2E routes test; combobox keyboard test; dialog focus test |
| 13 | Production builds have no unintended demo fallback | ✅ | build guard, config test, factory check in `scripts/check.js` |
| 14 | Provider smoke tests reported separately from mocks | ⛔ not run | `scripts/smoke-provider.js` exits "NOT RUN" without a key |

## Blockers (external)
1. **Massive API key** (`MASSIVE_API_KEY`, `MASSIVE_PLAN`), plus a **Business licence** before public display.
2. **Postgres** (`DATABASE_URL`) + `BETTER_AUTH_SECRET`, then `npm run migrate` and `npm run backfill`.
3. **Resend** (`RESEND_API_KEY`, `EMAIL_FROM`, verified domain) for verification, reset and email alerts.
4. **Anthropic** (`ANTHROPIC_API_KEY`) for AI explanations.
5. **Scheduler:** `CRON_SECRET` on Vercel; optional GitHub secrets `APP_URL` + `CRON_SECRET` for 15-minute runs.
