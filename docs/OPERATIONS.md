# Operations: providers, setup, deployment, rollback

## Market-data provider recommendation (evaluated 2026-10-18 from official docs)

| Need | Massive (formerly Polygon.io) | Finnhub free | Alpha Vantage free | Tiingo |
|---|---|---|---|---|
| Ticker + name search incl. ETFs, FIGI ids | ✅ `/v3/reference/tickers` | partial | ✅ | ✅ |
| Split-adjusted daily OHLCV | ✅ all plans (Basic: 2 yrs) | candles reported as paid | 25 req/day | ✅ |
| Whole-market daily bars in one call | ✅ grouped daily | ❌ | ❌ | ❌ |
| News with article URL + publisher | ✅ all plans | ✅ | ✅ | paid add-on |
| Dividends, splits, holidays/early closes | ✅ all plans | partial | partial | partial |
| Intraday snapshots | Starter+ (15-min delayed), Advanced real-time | real-time quote | — | IEX |
| Financial statements | Advanced or Financials add-on | partial | ✅ | paid |

**Recommendation: Massive.** One provider covers every required dataset; the Basic plan ($0, 5 calls/min,
end-of-day) is enough to build and verify; the grouped-daily endpoint makes quotes for any number of
symbols and the scanner affordable within that budget.

**Licensing — action required before public launch.** Massive's pricing page labels Basic, Starter,
Developer and Advanced as **"Individual use"**; business/redistribution licensing is a separate Business
plan. Displaying data to other users of a public app likely requires the Business plan. MarketPilot does
not assume a free feed permits redistribution; confirm with Massive sales before opening sign-ups.
No plan was purchased.

| Plan (Massive, stocks) | Price | Calls | Data | What MarketPilot enables |
|---|---|---|---|---|
| Basic | $0 | 5/min | end-of-day, 2y | EOD quotes, charts, scanner, daily-close alerts |
| Starter | $29/mo | unlimited | 15-min delayed, 5y | + intraday snapshots, intraday alerts |
| Advanced | $199/mo | unlimited | real-time | + financial statements |
| Business | contact | — | — | public display/redistribution |

## First-time setup (production)
1. **Database:** create a Postgres database (Neon via Vercel Marketplace, Supabase, …). Copy the
   pooled connection string into `DATABASE_URL` (Production + Preview, separate databases recommended).
2. **Secrets:** `BETTER_AUTH_SECRET=$(openssl rand -hex 32)`, `CRON_SECRET=$(openssl rand -hex 24)`.
3. **Market data:** `MARKET_DATA_PROVIDER=massive`, `MASSIVE_API_KEY`, `MASSIVE_PLAN`.
4. **Email (verification, reset, alerts):** Resend account, verified sending domain, `RESEND_API_KEY`,
   `EMAIL_FROM`. Without it, accounts work but email verification/reset and email alerts are unavailable.
5. **AI (optional):** `ANTHROPIC_API_KEY`; keep `AI_DAILY_LIMIT_GLOBAL` as the cost ceiling.
6. **Migrate:** `DATABASE_URL=… npm run migrate` (forward-only, checksummed, advisory-locked).
7. **Backfill:** `npm run backfill` with the same env (≈55 min on Basic; resumable).
8. **Scheduler:** Vercel Cron (`vercel.json`) runs `/api/cron/all` once per weekday after the close —
   Hobby-plan compatible. For intraday alert checks add GitHub repository secrets `APP_URL` and
   `CRON_SECRET` to enable `.github/workflows/scheduler.yml` (every 15 min in market hours), or any
   external scheduler calling `POST /api/cron/all` with `Authorization: Bearer $CRON_SECRET`.

Set variables with `vercel env add NAME production` (and `preview`). Never put values in the repo.

## Deploy
- Preview: `vercel deploy` (or push a branch). Verify `/api/health`, sign-up, a symbol page, `/api/cron/all`.
- Production: `vercel deploy --prod` or promote the verified preview (`vercel promote <url>`).
- The build refuses `MARKET_DATA_PROVIDER=demo` in production unless `ALLOW_DEMO_DATA_IN_PRODUCTION=true`.

## Rollback
- App: `vercel rollback <previous-deployment-url>` (instant; static + function).
- Database: migrations are forward-only and additive. To roll back code across a schema change,
  deploy a fix-forward migration; restore from backup only for data loss.

## Backups
- Neon/Supabase provide point-in-time recovery — enable it (Neon: history retention ≥ 7 days).
- Logical backup: `pg_dump --format=custom "$DATABASE_URL" > marketpilot-$(date +%F).dump`;
  restore with `pg_restore --clean --no-owner -d "$DATABASE_URL" file.dump`.
- Users can export their own data from Settings → Export.

## Monitoring
- `GET /api/health`: capabilities, latest stored session vs expected, last run of each job, failures in
  24 h, pending/failed email deliveries. Point an uptime monitor at it (alert on non-200 or `fresh:false`
  after 23:00 UTC on trading days).
- Logs are single-line JSON with redaction (emails, tokens, keys, passwords, quantities, prices, notes).
- Not integrated: an external error tracker (e.g. Sentry) — add a DSN-based reporter in `server/log.js`.

## Cost & usage controls
- Provider: DB-backed per-minute call budget shared across instances (`MASSIVE_RATE_LIMIT_PER_MIN`),
  caching (quotes 1 min–6 h by plan, history 6 h, news 30 min, reference 24 h), request de-duplication.
- AI: per-user and global daily quotas, result cache keyed by analysis id + articles + model + prompt
  version, `max_tokens` cap, one bounded corrective retry.
- API: per-IP / per-user rate limits; Better Auth rate limits on sign-in/sign-up/reset.
