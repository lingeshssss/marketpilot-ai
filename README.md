# MarketPilot

A stock and ETF research workspace: timestamped quotes, charts, transparent technical analysis,
grounded AI explanations, watchlists, a transaction-based portfolio tracker, and alerts evaluated
on the server.

Nothing on screen is random. When a data source is missing or failing, MarketPilot shows the last
known value labelled **stale**, or **unavailable** — never a simulated substitute. A clearly
labelled **demo mode** with synthetic data exists for development only.

## Architecture
- **Front end:** vanilla ES modules (`public/js`), History-API routes, lightweight-charts (vendored).
- **Shared calculation layer:** `public/shared/*` — exchange calendar, indicators, analysis object,
  portfolio accounting, alert evaluation, screen filters. Used identically by server, jobs and browser.
- **API:** one Vercel Node function (`api/index.js` → `server/app.js`).
- **Data:** Postgres (any provider) with SQL migrations; Better Auth sessions; Massive market data;
  Anthropic for AI; Resend for email.
- **Jobs:** `/api/cron/{market,scanner,alerts,deliveries,all}` — lease-locked, idempotent, recorded in `job_runs`.

```
public/            static app (index.html, css, js, shared, vendor)
server/            routes, auth, db, market provider + service, jobs, ai
migrations/        forward-only SQL
tests/unit         calculations, calendar, accounting, grounding (no I/O)
tests/integration  real Postgres (PGlite) + HTTP + auth, MOCKED provider
tests/e2e          Playwright journeys (demo data, desktop + phone)
docs/              AUDIT, ANALYSIS, ACCOUNTING, OPERATIONS, CHECKLIST
DESIGN.md          design system, screens, motion, accessibility
```

## Run locally
```bash
npm install
npm run build              # vendors chart library
npm run dev -- --demo      # http://localhost:3000, synthetic data, embedded Postgres, email outbox at /__dev/outbox
# or with real data:
MARKET_DATA_PROVIDER=massive MASSIVE_API_KEY=... npm run dev
```
Populate background data locally: `curl -X POST -H "Authorization: Bearer dev-cron-secret-local" localhost:3000/api/cron/all`.

## Test
```bash
npm run check              # syntax, no Math.random in app code, demo isolation, secret scan
npm run typecheck          # JSDoc type contracts (tsc --checkJs)
npm run test:unit
npm run test:integration   # mocked provider
npm run test:e2e           # demo data, desktop + phone
npm run smoke:provider     # LIVE Massive API — needs MASSIVE_API_KEY
```

## Configure & deploy
See `.env.example` for every variable and `docs/OPERATIONS.md` for provider choice, licensing,
migration, backfill, scheduling, backups, deployment and rollback.

## Disclosures
Research tool only. Not investment advice. Scores are heuristics, not probabilities. Market data
timeliness and source are shown next to every price.
