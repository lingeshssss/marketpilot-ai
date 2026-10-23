// Postgres access via node-postgres. Works with any Postgres (Neon, Supabase,
// RDS…). Local development/tests use PGlite exposed over the wire protocol.

import pg from 'pg';
import { config } from './config.js';
import { AppError } from './errors.js';

let pool = null;

// Return NUMERIC as JS numbers (values are bounded: prices/quantities ≤ 1e12 with ≤ 10 dp).
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// DATE as plain 'YYYY-MM-DD' strings — never shift through local timezones.
pg.types.setTypeParser(1082, (v) => v);
// BIGINT counters as numbers
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export function hasDatabase() { return !!config.database.url; }

export function getPool() {
  if (!config.database.url) throw new AppError(503, 'database_unavailable', 'The database is not configured. Saved data, sign-in and alerts are unavailable.');
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', () => {}); // idle-client errors are surfaced on next query
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function one(text, params) { return (await query(text, params)).rows[0] || null; }
export async function many(text, params) { return (await query(text, params)).rows; }

/** Runs fn(client) in a transaction. fn MUST use the passed client only. */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() { if (pool) { await pool.end(); pool = null; } }
