// Build step: vendor browser libraries into public/ (no third-party CDN at runtime)
// and fail the build if production would ship with demo data enabled by accident.
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('public/vendor', { recursive: true });
await copyFile('node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.mjs', 'public/vendor/lightweight-charts.mjs');
await copyFile('node_modules/lightweight-charts/LICENSE', 'public/vendor/lightweight-charts.LICENSE.txt');

if (process.env.VERCEL_ENV === 'production' && process.env.MARKET_DATA_PROVIDER === 'demo' && process.env.ALLOW_DEMO_DATA_IN_PRODUCTION !== 'true') {
  console.error('Refusing to build production with MARKET_DATA_PROVIDER=demo. Set a real provider or ALLOW_DEMO_DATA_IN_PRODUCTION=true deliberately.');
  process.exit(1);
}
console.log('build: vendored lightweight-charts');
