// Build step:
//  1. vendor browser libraries into public/ (no third-party CDN at runtime)
//  2. refuse to build production with demo data unless explicitly allowed
//  3. on Vercel, apply database migrations when a database is configured
//     (uses the direct/unpooled URL: migrations take session-level locks that a
//     transaction-mode pooler cannot hold). Set SKIP_BUILD_MIGRATIONS=true to opt out.
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('public/vendor', { recursive: true });
await copyFile('node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs', 'public/vendor/lightweight-charts.mjs');
await copyFile('node_modules/lightweight-charts/LICENSE', 'public/vendor/lightweight-charts.LICENSE.txt');
console.log('build: vendored lightweight-charts');

if (process.env.VERCEL_ENV === 'production' && process.env.MARKET_DATA_PROVIDER === 'demo' && process.env.ALLOW_DEMO_DATA_IN_PRODUCTION !== 'true') {
  console.error('Refusing to build production with MARKET_DATA_PROVIDER=demo. Set a real provider or ALLOW_DEMO_DATA_IN_PRODUCTION=true deliberately.');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (process.env.VERCEL && dbUrl && process.env.SKIP_BUILD_MIGRATIONS !== 'true') {
  process.env.DATABASE_URL = dbUrl; // build process only; runtime keeps the pooled URL
  const { reloadConfig } = await import('../server/config.js');
  reloadConfig();
  const { migrate } = await import('../server/migrate.js');
  const { closePool } = await import('../server/db.js');
  try {
    const r = await migrate({ logger: { info: (m) => console.log(`build: migration ${m}`) } });
    console.log(`build: database migrations up to date (${r.applied.length} applied, ${r.total} total)`);
  } catch (e) {
    console.error(`build: migration failed — ${e.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
