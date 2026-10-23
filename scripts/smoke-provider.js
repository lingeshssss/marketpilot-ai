// LIVE provider smoke test — calls the real Massive API with your key.
// Uses ~7 requests (fits the Basic 5/min budget with a pause). Reports separately
// from the mocked test suites. Requires MASSIVE_API_KEY; does not need a database.
//   MASSIVE_API_KEY=... MASSIVE_PLAN=basic node scripts/smoke-provider.js
import { loadConfig } from '../server/config.js';
import { createMassiveProvider } from '../server/market/massive.js';
import { lastCompletedSession, previousTradingDay, addDays } from '../public/shared/calendar.js';
import { buildAnalysis } from '../public/shared/analysis.js';

const cfg = loadConfig();
if (!cfg.market.massive.apiKey) { console.error('MASSIVE_API_KEY is not set — live smoke test skipped (NOT RUN).'); process.exit(2); }
const p = createMassiveProvider({ ...cfg.market.massive, rateLimitPerMin: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { const detail = await fn(); results.push({ step: name, ok: true, ms: Date.now() - t, detail }); }
  catch (e) { results.push({ step: name, ok: false, ms: Date.now() - t, error: `${e.kind || e.name}: ${e.message}` }); }
}
const end = lastCompletedSession(new Date());
await step('search SPY (ETF)', async () => { const r = await p.search('SPY'); const spy = r.find((x) => x.symbol === 'SPY'); if (!spy) throw new Error('SPY not in results'); return `${spy.symbol} ${spy.type} ${spy.exchange} ${spy.id}`; });
await step('ticker overview AAPL', async () => { const d = await p.instrument('AAPL'); return `${d.name} cap=${d.marketCap}`; });
await step('daily bars AAPL (2y, adjusted)', async () => { const { bars } = await p.dailyBars('AAPL', addDays(end, -720), end); const a = buildAnalysis({ symbol: 'AAPL', bars }); return `${bars.length} bars, last ${bars.at(-1)?.date}, RSI14 ${a.indicators.rsi14.value?.toFixed(1)}`; });
await step('grouped daily (latest session)', async () => { let d = end; let m = await p.groupedDaily(d); if (!m.size) { d = previousTradingDay(d); m = await p.groupedDaily(d); } return `${d}: ${m.size} tickers, SPY close ${m.get('SPY')?.c}`; });
await sleep(61_000);
await step('news AAPL', async () => { const n = await p.news('AAPL', { limit: 3 }); return n.map((a) => `${a.publisher}: ${a.url}`).join(' | ') || 'no articles'; });
await step('splits since 30d', async () => `${(await p.splits({ since: addDays(end, -30) })).length} splits`);
await step('market holidays', async () => (await p.holidays()).slice(0, 3).map((h) => `${h.date} ${h.status}`).join(', '));
console.table(results);
process.exit(results.every((r) => r.ok) ? 0 : 1);
