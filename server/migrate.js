// Forward-only SQL migrations with checksums. Each file runs in its own
// transaction; an advisory lock prevents concurrent runners.

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool } from './db.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate({ logger = console } = {}) {
  const client = await getPool().connect();
  try {
    await client.query('select pg_advisory_lock(727274)');
    await client.query(`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const applied = new Map((await client.query('select name, checksum from schema_migrations')).rows.map((r) => [r.name, r.checksum]));
    const files = (await readdir(DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    const ran = [];
    for (const f of files) {
      const sql = await readFile(path.join(DIR, f), 'utf8');
      const sum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(f)) {
        if (applied.get(f) !== sum) throw new Error(`Migration ${f} was modified after being applied (checksum mismatch). Add a new migration instead.`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations(name, checksum) values ($1, $2)', [f, sum]);
        await client.query('COMMIT');
        ran.push(f);
        logger.info?.(`applied ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${f} failed: ${e.message}`);
      }
    }
    return { applied: ran, total: files.length };
  } finally {
    try { await client.query('select pg_advisory_unlock(727274)'); } catch { /* ignore */ }
    client.release();
  }
}
