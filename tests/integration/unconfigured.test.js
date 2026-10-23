// A server with no database, no provider, no AI key, no email must report
// honest "unavailable" states — never fabricated data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './harness.js';

let app;
before(async () => { app = await startApp({ DATABASE_URL: '', MARKET_DATA_PROVIDER: '', MASSIVE_API_KEY: '', EMAIL_TRANSPORT: '', BETTER_AUTH_SECRET: '', CRON_SECRET: '' }); });
after(async () => { await app.stop(); });

test('capabilities report every missing dependency', async () => {
  const c = client(app.base);
  const caps = (await c.get('/api/config')).data.capabilities;
  assert.equal(caps.marketData.status, 'unconfigured');
  assert.equal(caps.marketData.provider, null);
  assert.equal(caps.database, false); assert.equal(caps.auth, false); assert.equal(caps.email, null); assert.equal(caps.ai, null);
});

test('market endpoints return 503 market_data_unavailable, not data', async () => {
  const c = client(app.base);
  for (const p of ['/api/quotes?symbols=AAPL', '/api/instruments/AAPL/analysis', '/api/search?q=SPY', '/api/instruments/AAPL/history']) {
    const r = await c.get(p);
    assert.equal(r.status, 503, p);
    assert.equal(r.data.error.code, 'market_data_unavailable', p);
  }
  const s = await c.get('/api/market/status');
  assert.equal(s.status, 200, 'calendar still works without a provider');
  assert.equal(s.data.provider, null);
});

test('accounts and private data report unavailable', async () => {
  const c = client(app.base);
  assert.equal((await c.get('/api/watchlists')).status, 401);
  const r = await c.post('/api/auth/sign-up/email', { email: 'a@b.co', password: 'xxxxxxxxxxxx', name: 'a' });
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, 'auth_unavailable');
  assert.equal((await c.get('/api/scanner')).status, 503);
});

test('demo provider is refused in production unless explicitly allowed', async () => {
  const { loadConfig, capabilities } = await import('../../server/config.js');
  const saved = { ...process.env };
  process.env.VERCEL_ENV = 'production'; process.env.MARKET_DATA_PROVIDER = 'demo';
  assert.equal(capabilities(loadConfig()).marketData.status, 'demo_blocked_in_production');
  process.env.ALLOW_DEMO_DATA_IN_PRODUCTION = 'true';
  assert.equal(capabilities(loadConfig()).marketData.demo, true);
  process.env = saved;
});
