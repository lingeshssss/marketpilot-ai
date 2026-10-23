// MOCKED-PROVIDER integration tests (no external network). See harness.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, makeMarket, client, signUpVerified, waitForMail } from './harness.js';
import { createMassiveProvider } from '../../server/market/massive.js';

let app, market, A, B;
const CRON = { headers: { authorization: 'Bearer cron-test-secret-0001' } };
const setNow = (iso) => app.service.__setClockForTests(() => new Date(iso));

before(async () => {
  app = await startApp();
  market = makeMarket();
  const { config } = await import('../../server/config.js');
  app.service.__setProviderForTests(createMassiveProvider(config.market.massive, { fetchImpl: market.fetchImpl }));
  setNow('2026-10-17T15:00:00Z'); // Saturday; last completed session Fri 2026-10-16
  A = await signUpVerified(app, 'alice@example.com');
  B = await signUpVerified(app, 'bob@example.com');
});
after(async () => { await app.stop(); });

test('auth: private routes require a session; sign-up required email verification', async () => {
  const anon = client(app.base);
  assert.equal((await anon.get('/api/watchlists')).status, 401);
  const c = client(app.base);
  await c.post('/api/auth/sign-up/email', { email: 'carol@example.com', password: 'correct-horse-battery', name: 'carol' });
  const s = await c.post('/api/auth/sign-in/email', { email: 'carol@example.com', password: 'correct-horse-battery' });
  assert.equal(s.status, 403, 'unverified email cannot sign in when email delivery is configured');
});

test('auth: password reset flow sends a link and resets', async () => {
  const c = client(app.base);
  const r = await c.post('/api/auth/request-password-reset', { email: 'bob@example.com', redirectTo: '/reset-password' });
  assert.equal(r.status, 200);
  const mail = await waitForMail(app, 'bob@example.com', 'password_reset');
  assert.ok(mail, 'reset email captured in test outbox');
  const token = mail.body.match(/reset-password\/([^?\s]+)/)?.[1];
  assert.ok(token);
  const done = await c.post('/api/auth/reset-password', { newPassword: 'another-long-password', token });
  assert.equal(done.status, 200);
  const s = await client(app.base).post('/api/auth/sign-in/email', { email: 'bob@example.com', password: 'another-long-password' });
  assert.equal(s.status, 200);
  B = client(app.base); await B.post('/api/auth/sign-in/email', { email: 'bob@example.com', password: 'another-long-password' });
});

test('search covers ETFs (SPY) and company names', async () => {
  const r = await A.get('/api/search?q=SPY');
  assert.equal(r.status, 200);
  assert.equal(r.data.results[0].symbol, 'SPY');
  assert.equal(r.data.results[0].type, 'ETF');
  assert.equal(r.data.results[0].id, 'BBG000BDTBL9');
  const n = await A.get('/api/search?q=apple');
  assert.equal(n.data.results[0].symbol, 'AAPL');
});

test('quotes: EOD close vs previous close, timestamps, session, identical across endpoints', async () => {
  const q = (await A.get('/api/quotes?symbols=AAPL,SPY')).data.quotes.AAPL;
  const c16 = market.close('AAPL', '2026-10-16'), c15 = market.close('AAPL', '2026-10-15');
  assert.equal(q.price, c16); assert.equal(q.prevClose, c15);
  assert.ok(Math.abs(q.changePct - (c16 / c15 - 1) * 100) < 1e-9);
  assert.equal(q.sessionDate, '2026-10-16'); assert.equal(q.status, 'fresh');
  assert.equal(q.marketTime, '2026-10-16T20:00:00.000Z');
  assert.ok(q.retrievedAt);
  // run jobs -> scanner & overview must reuse the same quote
  const jobs = await A.post('/api/cron/all', {}, CRON);
  assert.equal(jobs.status, 200, JSON.stringify(jobs.data));
  assert.ok(jobs.data.results.every((x) => x.status === 'succeeded'), JSON.stringify(jobs.data.results));
  const scan = await A.get('/api/scanner?screen=' + encodeURIComponent(JSON.stringify({ pageSize: 100 })));
  const row = scan.data.result.rows.find((x) => x.symbol === 'AAPL');
  assert.equal(row.quoteId, q.quoteId); assert.equal(row.price, q.price); assert.equal(row.changePct, q.changePct);
  const ov = await A.get('/api/market/overview');
  assert.equal(ov.data.proxies.find((p) => p.symbol === 'SPY').quote.quoteId, (await A.get('/api/quotes?symbols=SPY')).data.quotes.SPY.quoteId);
  // rerender: identical
  const again = (await A.get('/api/quotes?symbols=AAPL')).data.quotes.AAPL;
  assert.deepEqual({ ...again, retrievedAt: 0 }, { ...q, retrievedAt: 0 });
});

test('analysis is deterministic and explanations agree with it', async () => {
  const a1 = (await A.get('/api/instruments/AAPL/analysis')).data;
  const a2 = (await B.get('/api/instruments/AAPL/analysis')).data;
  assert.equal(a1.analysis.id, a2.analysis.id);
  assert.deepEqual(a1.analysis.indicators, a2.analysis.indicators);
  assert.equal(a1.analysis.cutoff, '2026-10-16');
  const rsiEx = a1.explanations.find((e) => e.id === 'rsi');
  assert.ok(rsiEx.text.includes(a1.analysis.indicators.rsi14.value.toFixed(1)));
});

test('market news endpoint returns linked, timestamped articles', async () => {
  const n = (await A.get('/api/market/news')).data;
  assert.ok(n.articles.length > 0 && n.articles.every((a) => /^https:/.test(a.url) && a.publisher && a.publishedAt));
  assert.ok(n.retrievedAt);
});

test('scanner explains matches and reports backfill progress', async () => {
  const def = { logic: 'AND', filters: [{ field: 'rsi14', op: 'gte', value: 0 }], pageSize: 100 };
  const r = (await A.get('/api/scanner?screen=' + encodeURIComponent(JSON.stringify(def)))).data;
  assert.ok(r.result.rows.every((row) => row.matched.length === 1 && /^RSI\(14\) [\d.]+ \(≥ 0\.0\)$/.test(row.matched[0])), JSON.stringify(r.result.rows[0]?.matched));
  assert.equal(typeof r.snapshot.backfill.storedSessions, 'number');
});

test('news keeps publisher, URL, timestamp; rejects non-http links', async () => {
  const n = (await A.get('/api/instruments/AAPL/news')).data;
  assert.equal(n.articles.length, 2);
  assert.ok(n.articles.every((a) => a.url.startsWith('https://') && a.publisher && a.publishedAt));
  assert.ok(n.retrievedAt);
});

test('watchlists: CRUD, duplicates, reorder, undo, export, isolation between users', async () => {
  const w = (await A.post('/api/watchlists', { name: 'Core' })).data.watchlist;
  assert.equal((await A.post('/api/watchlists', { name: 'Core' })).status, 409);
  const add = (await A.post(`/api/watchlists/${w.id}/items`, { symbols: ['AAPL', 'MSFT', 'aapl', 'SPY'] })).data;
  assert.deepEqual(add.added.map((x) => x.symbol), ['AAPL', 'MSFT', 'SPY']);
  assert.deepEqual(add.duplicates, ['AAPL']);
  let lists = (await A.get('/api/watchlists')).data.watchlists;
  const items = lists[0].items;
  await A.put(`/api/watchlists/${w.id}/order`, { itemIds: [items[2].id, items[0].id, items[1].id] });
  lists = (await A.get('/api/watchlists')).data.watchlists;
  assert.deepEqual(lists[0].items.map((i) => i.symbol), ['SPY', 'AAPL', 'MSFT']);
  const removed = (await A.del(`/api/watchlists/${w.id}/items/${lists[0].items[1].id}`)).data.removed;
  await A.post(`/api/watchlists/${w.id}/items`, { symbol: removed.symbol, note: removed.note, position: removed.position });
  lists = (await A.get('/api/watchlists')).data.watchlists;
  assert.deepEqual(lists[0].items.map((i) => i.symbol), ['SPY', 'AAPL', 'MSFT'], 'undo restores position');
  const csv = await A.get(`/api/watchlists/${w.id}/export`);
  assert.match(csv.data, /^symbol,note,added_at\nSPY,/);

  // Bob cannot see or touch Alice's list
  assert.deepEqual((await B.get('/api/watchlists')).data.watchlists, []);
  assert.equal((await B.post(`/api/watchlists/${w.id}/items`, { symbol: 'NVDA' })).status, 404);
  assert.equal((await B.del(`/api/watchlists/${w.id}`)).status, 404);
  assert.equal((await B.get(`/api/watchlists/${w.id}/export`)).status, 404);
  assert.equal((await A.get('/api/watchlists')).data.watchlists[0].items.length, 3);
});

test('portfolio: transactions -> identical totals on dashboard summary and portfolio page; isolation', async () => {
  const p = (await A.post('/api/portfolios', { name: 'Brokerage' })).data.portfolio;
  for (const t of [
    { type: 'deposit', date: '2026-01-02', amount: 10000 },
    { type: 'buy', symbol: 'AAPL', date: '2026-01-05', quantity: 10.5, price: 190, fees: 1 },
    { type: 'buy', symbol: 'SPY', date: '2026-02-02', quantity: 5, price: 560 },
    { type: 'sell', symbol: 'AAPL', date: '2026-03-02', quantity: 2.5, price: 205, fees: 1 },
    { type: 'dividend', symbol: 'AAPL', date: '2026-05-15', amount: 2.08 },
  ]) assert.equal((await A.post(`/api/portfolios/${p.id}/transactions`, t)).status, 201);
  assert.equal((await A.post(`/api/portfolios/${p.id}/transactions`, { type: 'sell', symbol: 'MSFT', date: '2026-03-03', quantity: 1, price: 1 })).status, 400, 'cannot sell what is not held');
  assert.equal((await A.post(`/api/portfolios/${p.id}/transactions`, { type: 'buy', symbol: 'AAPL', date: '2099-01-01', quantity: 1, price: 1 })).status, 400, 'future dates rejected');

  const page = (await A.get(`/api/portfolios/${p.id}`)).data.valuation.totals;
  const dash = (await A.get('/api/portfolios/summary')).data.totals;
  assert.deepEqual(dash, page, 'dashboard and portfolio page totals are identical');
  const q = (await A.get('/api/quotes?symbols=AAPL,SPY')).data.quotes;
  assert.ok(Math.abs(page.marketValue - (8 * q.AAPL.price + 5 * q.SPY.price)) < 1e-6);
  assert.ok(Math.abs(page.dailyPnl - (8 * q.AAPL.change + 5 * q.SPY.change)) < 1e-6);
  assert.ok(Math.abs(page.realized - (2.5 * 205 - 1 - 2.5 * (10.5 * 190 + 1) / 10.5)) < 1e-6);

  // CSV import preview + duplicate detection + commit
  const csv = 'type,date,symbol,qty,price,fees\nbuy,2026-01-05,AAPL,10.5,190,1\nbuy,04/01/2026,MSFT,3,410,0\n';
  const mapping = { type: 'type', date: 'date', symbol: 'symbol', quantity: 'qty', price: 'price', fees: 'fees' };
  const prev = (await A.post(`/api/portfolios/${p.id}/import/preview`, { csv, mapping })).data;
  assert.equal(prev.items[0].duplicate, 'existing'); assert.equal(prev.items[1].duplicate, null); assert.equal(prev.items[1].txn.date, '2026-04-01');
  const commit = (await A.post(`/api/portfolios/${p.id}/import/commit`, { transactions: prev.items.map((i) => i.txn) })).data;
  assert.deepEqual(commit, { inserted: 1, skippedDuplicates: 1 });

  const perf = (await A.get(`/api/portfolios/${p.id}/performance`)).data;
  assert.ok(perf.series.length > 100); assert.equal(typeof perf.twr, 'number');

  // Isolation
  assert.equal((await B.get(`/api/portfolios/${p.id}`)).status, 404);
  assert.equal((await B.post(`/api/portfolios/${p.id}/transactions`, { type: 'deposit', date: '2026-01-02', amount: 1 })).status, 404);
  assert.equal((await B.get('/api/portfolios/summary')).data.positions.length, 0);
});

test('alerts: evaluate with no browser, trigger on cross, no duplicates on retry/concurrency, stale never triggers', async () => {
  await A.put('/api/me/preferences', { theme: 'system', notify_email: true });
  const c16 = market.close('AAPL', '2026-10-16');
  const rule = (await A.post('/api/alerts', { symbol: 'AAPL', kind: 'price_above', threshold: +(c16 + 5).toFixed(2), channels: ['inapp', 'email'], cooldownMinutes: 0 })).data.rule;
  assert.equal((await B.patch(`/api/alerts/${rule.id}`, { threshold: 1 })).status, 404, 'other users cannot edit');

  let r = await A.post('/api/cron/alerts', {}, CRON);
  assert.equal(r.data.results[0].stats.baseline, 1);

  // Monday 19th closes above threshold
  market.overrides.set('AAPL|2026-10-19', +(c16 + 10).toFixed(2));
  market.state.publishedThrough = '2026-10-19';
  setNow('2026-10-19T19:00:00Z'); // during session: last completed is still 16th -> duplicate key, no trigger
  r = await A.post('/api/cron/alerts', {}, CRON);
  assert.equal(r.data.results[0].stats.triggered, 0);
  setNow('2026-10-19T22:00:00Z');
  const [x, y] = await Promise.all([A.post('/api/cron/alerts', {}, CRON), A.post('/api/cron/alerts', {}, CRON)]);
  const triggered = [x, y].map((z) => z.data.results[0]).reduce((s, z) => s + (z.stats?.triggered || 0), 0);
  assert.equal(triggered, 1, 'concurrent runs trigger exactly once');
  r = await A.post('/api/cron/alerts', {}, CRON);
  assert.equal(r.data.results[0].stats.triggered, 0, 'retry does not duplicate');
  const ev = (await A.get('/api/alerts/events')).data;
  assert.equal(ev.events.length, 1); assert.equal(ev.unread, 1);
  assert.equal(ev.events[0].observed_value, market.overrides.get('AAPL|2026-10-19'));

  const d = await A.post('/api/cron/deliveries', {}, CRON);
  assert.equal(d.data.results[0].stats.sent, 1);
  assert.ok(await waitForMail(app, 'alice@example.com', 'alert'), 'delivered through the TEST outbox only');
  assert.equal((await app.db.query(`select count(*)::int n from email_outbox where kind='alert'`)).rows[0].n, 1);
  assert.equal((await A.post('/api/cron/deliveries', {}, CRON)).data.results[0].stats.sent, 0);
  assert.equal((await B.get('/api/alerts/events')).data.events.length, 0);

  // Stale: provider has not published Tue 20th by the evening -> no evaluation
  setNow('2026-10-20T22:00:00Z');
  market.overrides.set('AAPL|2026-10-20', 1);
  await A.post('/api/alerts', { symbol: 'MSFT', kind: 'price_below', threshold: 5 });
  r = await A.post('/api/cron/alerts', {}, CRON);
  const st = r.data.results[0].stats;
  assert.equal(st.triggered, 0);
  assert.equal(st.stale, 1, 'new MSFT rule: latest bar is 10-19 but 10-20 expected -> stale, not baselined');
  assert.equal(st.duplicate, 1, 'AAPL rule: same 10-19 observation already processed');
  const msft = (await A.get('/api/alerts')).data.rules.find((x) => x.symbol === 'MSFT');
  assert.equal(msft.lastObservation, null, 'stale data does not move rule state');
});

test('provider outage serves last-known values marked stale; never fabricated', async () => {
  setNow('2026-10-21T22:00:00Z');
  market.state.publishedThrough = '2026-10-21';
  market.state.failGroupedFor.add('2026-10-21');
  market.state.rateLimitAll = true;
  const q = (await A.get('/api/quotes?symbols=AAPL,NVDA')).data.quotes;
  assert.notEqual(q.AAPL.status, 'fresh');
  for (const s of ['AAPL', 'NVDA']) {
    if (q[s].status === 'unavailable') assert.equal(q[s].price, null);
    else assert.ok(q[s].sessionDate < '2026-10-21');
  }
  const search = await A.get('/api/search?q=ZZZZ');
  assert.ok([429, 503].includes(search.status) || search.data.partial === true);
  market.state.rateLimitAll = false;
  market.state.failGroupedFor.clear();
});

test('AI: unavailable without key; grounded output accepted; ungrounded numbers rejected; injection text is quoted as data', async () => {
  const r0 = await A.post('/api/ai/analyze', { symbol: 'AAPL' });
  assert.equal(r0.status, 503); assert.equal(r0.data.error.code, 'ai_unavailable');

  const ai = await import('../../server/ai/analyst.js');
  let captured = null; let mode = 'good';
  ai.__setAiClientForTests({ beta: { messages: { parse: async (params) => {
    captured = params;
    const metrics = JSON.parse(params.messages[0].content.match(/<metrics>\n([\s\S]*?)\n<\/metrics>/)[1]);
    const close = metrics.numeric.close.toFixed(2);
    const base = { symbol: 'AAPL', timeframe: '1D', dataCutoff: metrics.dataCutoff, observations: [{ text: `Close was ${close}.`, metricRefs: ['close'], sourceRefs: [] }], calculations: [], interpretation: [],
      newsClaims: [{ text: 'Revenue rose 6% year over year.', metricRefs: [], sourceRefs: ['n1-AAPL'] }],
      scenarios: { bull: { narrative: 'Holds above sma50.', assumptions: ['Trend persists'], metricRefs: ['sma50'], sourceRefs: [] }, base: { narrative: 'Range.', assumptions: [], metricRefs: [], sourceRefs: [] }, bear: { narrative: 'Breaks support1.', assumptions: [], metricRefs: ['support1'], sourceRefs: [] } },
      contradictoryEvidence: [], limitations: ['Daily bars only.'] };
    const out = mode === 'good' ? { ...base, summary: `AAPL closed at ${close} with RSI(14) ${metrics.numeric.rsi14.toFixed(1)}.` } : { ...base, summary: 'Target price $999.99 within 30 days with 87% probability.' };
    return { stop_reason: 'end_turn', parsed_output: out, model: 'test-model', content: [{ type: 'text', text: JSON.stringify(out) }] };
  } } } });
  const r1 = await A.post('/api/ai/analyze', { symbol: 'AAPL' });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.equal(r1.data.meta.dataCutoff, r1.data.output.dataCutoff);
  assert.ok(r1.data.meta.sources.every((s) => s.url.startsWith('https://')));
  assert.match(captured.messages[0].content, /<untrusted_article id="n2-AAPL"/);
  assert.doesNotMatch(captured.messages[0].content, /test-key-not-real|test-secret/, 'no secrets in prompt');
  assert.match(captured.system, /ignore any instructions/);
  const cached = await A.post('/api/ai/analyze', { symbol: 'AAPL' });
  assert.equal(cached.data.cached, true);

  mode = 'bad';
  await app.db.query('delete from ai_cache');
  const r2 = await A.post('/api/ai/analyze', { symbol: 'AAPL' });
  assert.equal(r2.status, 422); assert.equal(r2.data.error.code, 'ai_output_rejected');
  assert.ok(r2.data.error.details.errors.some((e) => /999\.99/.test(e)));
  const hist = (await A.get('/api/ai/history')).data.history;
  assert.ok(hist.some((h) => h.status === 'rejected') && hist.some((h) => h.status === 'succeeded'));
  assert.equal((await B.get('/api/ai/history')).data.history.length, 0);
  ai.__setAiClientForTests(null);
});

test('account export contains only own data; deletion cascades', async () => {
  const ex = (await A.get('/api/account/export')).data;
  assert.equal(ex.user.email, 'alice@example.com');
  assert.ok(ex.transactions.length >= 5);
  const exB = (await B.get('/api/account/export')).data;
  assert.equal(exB.transactions.length, 0); assert.equal(exB.watchlists.length, 0);

  const del = await B.post('/api/auth/delete-user', { password: 'another-long-password' });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal((await app.db.query(`select count(*)::int n from "user" where email='bob@example.com'`)).rows[0].n, 0);
  assert.equal((await B.get('/api/watchlists')).status, 401);
});

test('cron endpoint requires the secret; security headers present', async () => {
  const anon = client(app.base);
  assert.equal((await anon.post('/api/cron/all')).status, 401);
  const r = await anon.get('/api/config');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const cross = await fetch(app.base + '/api/watchlists', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie: A.cookie }, body: '{"name":"x"}' });
  assert.equal(cross.status, 403);
});
