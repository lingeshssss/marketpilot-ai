// Provider call budget shared across serverless instances (DB-backed),
// so we never exceed the provider's per-minute allowance.

import { query, hasDatabase } from '../db.js';
import { ProviderError } from './errors.js';

const local = new Map();

export async function acquireProviderSlot(provider, perMinute) {
  const now = Date.now();
  const start = Math.floor(now / 60000) * 60000;
  let count;
  if (hasDatabase()) {
    try {
      const r = await query(`insert into provider_calls(provider, window_start, count) values ($1, to_timestamp($2/1000.0), 1)
        on conflict (provider, window_start) do update set count = provider_calls.count + 1 returning count`, [provider, start]);
      count = r.rows[0].count;
    } catch { count = undefined; }
  }
  if (count === undefined) {
    const k = `${provider}|${start}`;
    count = (local.get(k) || 0) + 1;
    local.set(k, count);
  }
  if (count > perMinute) {
    throw new ProviderError('rate_limited', `Market data request budget for this minute is used up (${perMinute}/min).`, { retryAfter: Math.ceil((start + 60000 - now) / 1000) });
  }
}

/** Remaining budget this minute (best effort, for background jobs). */
export async function remainingBudget(provider, perMinute) {
  if (!hasDatabase()) return perMinute;
  const start = Math.floor(Date.now() / 60000) * 60000;
  const r = await query('select count from provider_calls where provider=$1 and window_start = to_timestamp($2/1000.0)', [provider, start]);
  return Math.max(0, perMinute - (r.rows[0]?.count || 0));
}
