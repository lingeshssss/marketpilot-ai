// Local development server.
//   npm run dev                 -> uses env as configured (no provider => honest "unavailable")
//   npm run dev -- --demo       -> MARKET_DATA_PROVIDER=demo (synthetic data, labelled in UI)
// Without DATABASE_URL an embedded Postgres (PGlite) is started and persisted to .data/pglite.
// Email uses the dev-only "outbox" transport unless EMAIL_TRANSPORT is set; view at /__dev/outbox.

import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.PORT || 3000);
process.env.APP_URL ||= `http://localhost:${PORT}`;
if (args.has('--demo')) process.env.MARKET_DATA_PROVIDER = 'demo';
process.env.EMAIL_TRANSPORT ||= 'outbox';
process.env.CRON_SECRET ||= 'dev-cron-secret-local';

let localDb = null;
if (!process.env.DATABASE_URL) {
  const { startLocalDb } = await import('./localdb.js');
  const ephemeral = args.has('--ephemeral');
  if (!ephemeral) await mkdir('.data', { recursive: true });
  localDb = await startLocalDb({ dataDir: ephemeral ? undefined : '.data/pglite' });
  process.env.DATABASE_URL = localDb.url;
  process.env.DATABASE_POOL_MAX = '1';
}
if (!process.env.BETTER_AUTH_SECRET) {
  const f = '.data/dev-auth-secret';
  if (!existsSync('.data')) await mkdir('.data', { recursive: true });
  if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString('hex'));
  process.env.BETTER_AUTH_SECRET = readFileSync(f, 'utf8').trim();
}

const { reloadConfig, capabilities } = await import('../server/config.js');
reloadConfig();
const { migrate } = await import('../server/migrate.js');
await migrate({ logger: { info: (m) => console.log(`[db] ${m}`) } });
const { handle } = await import('../server/app.js');
const { query } = await import('../server/db.js');

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const globalHeaders = vercel.headers[0].headers;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const ROOT = path.resolve('public');

const server = http.createServer(async (req, res) => {
  for (const h of globalHeaders) if (h.key !== 'Strict-Transport-Security') res.setHeader(h.key, h.value);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) return handle(req, res);
  if (url.pathname === '/__dev/outbox') {
    const rows = (await query('select to_address, subject, body, kind, created_at from email_outbox order by created_at desc limit 50')).rows;
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(rows));
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(ROOT, 'index.html'); // SPA fallback (mirrors vercel.json rewrite)
  }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(body);
  } catch { res.statusCode = 404; res.end('Not found'); }
});

server.listen(PORT, () => {
  const c = capabilities();
  console.log(`MarketPilot dev server http://localhost:${PORT}`);
  console.log(`  market data: ${c.marketData.status}${c.marketData.demo ? ' (DEMO — synthetic data)' : ''} | db: ${localDb ? 'embedded PGlite' : 'DATABASE_URL'} | email: ${c.email || 'off'} | ai: ${c.ai ? c.ai.model : 'off'}`);
});

const shutdown = async () => { server.close(); if (localDb) await localDb.stop(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
