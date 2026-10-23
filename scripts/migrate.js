// Usage: DATABASE_URL=postgres://... npm run migrate
import { migrate } from '../server/migrate.js';
import { closePool } from '../server/db.js';

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(1); }
try {
  const r = await migrate();
  console.log(`migrations: ${r.applied.length} applied, ${r.total} total`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
