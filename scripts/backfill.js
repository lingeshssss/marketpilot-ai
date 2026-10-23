// One-off market-data backfill that respects the provider's per-minute budget.
// Needed on the Massive Basic plan (5 calls/min): 260 sessions of grouped daily
// bars take ~55 minutes. Safe to interrupt and re-run (idempotent).
//   DATABASE_URL=... MARKET_DATA_PROVIDER=massive MASSIVE_API_KEY=... CRON_SECRET=x node scripts/backfill.js
import { runJob } from '../server/jobs/runner.js';
import { marketJob, TARGET_SESSIONS } from '../server/jobs/market.js';
import { scannerJob } from '../server/jobs/scanner.js';
import { query, closePool } from '../server/db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let round = 1; round <= 200; round++) {
  const r = await runJob('market', marketJob, { trigger: 'backfill', budgetMs: 55_000 });
  const stored = (await query('select count(*)::int n from grouped_days')).rows[0].n;
  console.log(`round ${round}: ${r.status} · fetched ${r.stats?.fetchedDays?.length ?? 0} · stored ${stored}/${TARGET_SESSIONS}${r.stats?.errors?.length ? ` · errors: ${JSON.stringify(r.stats.errors.slice(0, 2))}` : ''}`);
  if (stored >= TARGET_SESSIONS || r.status === 'failed') break;
  await sleep(61_000); // wait for the next rate-limit window
}
console.log('scanner:', JSON.stringify((await runJob('scanner', scannerJob, { trigger: 'backfill' })).stats));
await closePool();
