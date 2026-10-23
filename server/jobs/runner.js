// Background job runner: lease-locked (no overlapping runs across instances),
// recorded in job_runs for health monitoring, time-bounded for serverless limits.

import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { log } from '../log.js';

async function acquireLease(job, holder, seconds) {
  const r = await query(`insert into job_leases(job, holder, locked_until) values ($1,$2, now() + ($3 || ' seconds')::interval)
    on conflict (job) do update set holder=excluded.holder, locked_until=excluded.locked_until
    where job_leases.locked_until < now() returning holder`, [job, holder, String(seconds)]);
  return r.rowCount === 1;
}

async function releaseLease(job, holder) {
  await query('delete from job_leases where job=$1 and holder=$2', [job, holder]);
}

export async function runJob(name, fn, { trigger = 'cron', budgetMs = 50_000 } = {}) {
  const holder = randomUUID();
  // Lease outlives the time budget slightly so a crashed run frees itself.
  if (!(await acquireLease(name, holder, Math.ceil(budgetMs / 1000) + 30))) {
    await query(`insert into job_runs(job, trigger, status, finished_at, stats) values ($1,$2,'skipped',now(),'{"reason":"already running"}')`, [name, trigger]);
    return { job: name, status: 'skipped', reason: 'already running' };
  }
  const runId = (await query('insert into job_runs(job, trigger) values ($1,$2) returning id', [name, trigger])).rows[0].id;
  try {
    const deadline = Date.now() + budgetMs;
    const stats = await fn({ deadline, timeLeft: () => deadline - Date.now() });
    await query(`update job_runs set status='succeeded', finished_at=now(), stats=$2 where id=$1`, [runId, JSON.stringify(stats || {})]);
    return { job: name, status: 'succeeded', stats };
  } catch (e) {
    log.error('job_failed', { job: name, error: e });
    await query(`update job_runs set status='failed', finished_at=now(), error=$2 where id=$1`, [runId, String(e.message).slice(0, 500)]).catch(() => {});
    return { job: name, status: 'failed', error: e.message };
  } finally {
    await releaseLease(name, holder).catch(() => {});
  }
}
