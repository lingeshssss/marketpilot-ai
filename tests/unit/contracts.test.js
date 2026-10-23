import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnv } from '../../server/config.js';
import { createMassiveProvider } from '../../server/market/massive.js';

const cfg = { apiKey: 'k-12345678', baseUrl: 'https://api.example.test', caps: { snapshot: false, statements: false }, rateLimitPerMin: 1000, timeoutMs: 2000 };
const respond = (body, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('environment validation reports names, never values', () => {
  const { values, issues } = validateEnv({ DATABASE_URL: 'mysql://secret-host', BETTER_AUTH_SECRET: 'tiny', CRON_SECRET: 'x'.repeat(20), MASSIVE_PLAN: 'Basic' });
  assert.deepEqual(issues.map((i) => i.variable).sort(), ['BETTER_AUTH_SECRET', 'DATABASE_URL']);
  assert.ok(!JSON.stringify(issues).includes('secret-host'));
  assert.equal(values.MASSIVE_PLAN, 'basic');
  assert.equal(values.DATABASE_URL, undefined, 'invalid value is not used');
});

test('malformed provider payloads are rejected as invalid_data', async () => {
  const bad = createMassiveProvider(cfg, { fetchImpl: respond({ status: 'OK', results: [{ id: 1, published_utc: 12345 }] }) });
  await assert.rejects(() => bad.news('AAPL'), (e) => e.kind === 'invalid_data' && /news/.test(e.message));
  const bars = createMassiveProvider(cfg, { fetchImpl: respond({ status: 'OK', results: [{ t: 1, o: 'x', h: 1, l: 1, c: 1 }] }) });
  await assert.rejects(() => bars.dailyBars('AAPL', '2026-01-01', '2026-02-01'), (e) => e.kind === 'invalid_data');
  const ooo = createMassiveProvider(cfg, { fetchImpl: respond({ status: 'OK', results: [
    { t: Date.parse('2026-01-06T05:00:00Z'), o: 1, h: 2, l: 1, c: 2, v: 1 }, { t: Date.parse('2026-01-05T05:00:00Z'), o: 1, h: 2, l: 1, c: 2, v: 1 }] }) });
  await assert.rejects(() => ooo.dailyBars('AAPL', '2026-01-01', '2026-02-01'), (e) => e.kind === 'invalid_data' && /out of order/.test(e.message));
});

test('provider HTTP failures map to explicit kinds (no fabricated fallback)', async () => {
  await assert.rejects(() => createMassiveProvider(cfg, { fetchImpl: respond({}, 429) }).search('A'), (e) => e.kind === 'rate_limited');
  await assert.rejects(() => createMassiveProvider(cfg, { fetchImpl: respond({}, 403) }).search('A'), (e) => e.kind === 'not_entitled');
  await assert.rejects(() => createMassiveProvider(cfg, { fetchImpl: respond({}, 401) }).search('A'), (e) => e.kind === 'unauthorized');
  let calls = 0;
  await assert.rejects(() => createMassiveProvider(cfg, { fetchImpl: async () => { calls++; return new Response('{}', { status: 503 }); } }).search('A'), (e) => e.kind === 'unavailable');
  assert.equal(calls, 3, 'bounded: 1 attempt + 2 retries');
});
