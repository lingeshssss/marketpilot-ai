// Alert evaluation (server-side, browser not required) and delivery.
//
// Idempotency: each observation has a key (e.g. "1D:2026-10-16"); alert_events
// has UNIQUE(rule_id, observation_key) and rule state is updated with an
// optimistic version check, so retries or overlapping runs cannot duplicate.
// Stale data never triggers (see shared/alerts.js).

import { query, tx, many } from '../db.js';
import { log } from '../log.js';
import { capabilities } from '../config.js';
import { evaluateRule, ALERT_KINDS, describeRule } from '../../public/shared/alerts.js';
import { getQuotes, getAnalysis, getProvider, now, providerErrorInfo } from '../market/service.js';
import { lastCompletedSession, sessionBounds } from '../../public/shared/calendar.js';
import { sendEmail } from '../email.js';
import { fmtPrice, fmtPct, fmtNumber } from '../../public/shared/format.js';

const MAX_ATTEMPTS = 5;

async function observationsFor(symbol, timeframes) {
  const out = {};
  const expected = lastCompletedSession(now());
  if (timeframes.has('1D')) {
    try {
      const an = await getAnalysis(symbol);
      const fresh = an.cutoff === expected && !an.stale;
      const asOf = an.cutoff ? sessionBounds(an.cutoff).close.toISOString() : null;
      out['1D'] = {
        key: `1D:${an.cutoff}`, fresh, asOf,
        values: { price: an.close, rsi14: an.indicators.rsi14.value, changePct: an.changePct },
        reason: fresh ? null : `Daily data cutoff ${an.cutoff} ≠ expected ${expected}`,
      };
    } catch (e) { out['1D'] = { key: null, fresh: false, values: {}, reason: providerErrorInfo(e).message }; }
  }
  if (timeframes.has('live')) {
    const q = (await getQuotes([symbol]))[symbol];
    const ok = q && q.status === 'fresh' && q.session === 'regular';
    out.live = { key: q?.marketTime ? `live:${q.marketTime}` : null, fresh: !!ok, asOf: q?.marketTime || null, values: { price: q?.price, changePct: q?.changePct }, reason: ok ? null : 'Quote not fresh or market not in regular session' };
  }
  return out;
}

function message(rule, value) {
  const k = ALERT_KINDS[rule.kind];
  const v = k.metric === 'price' ? fmtPrice(value) : k.metric === 'changePct' ? fmtPct(value) : fmtNumber(value, 1);
  return `${describeRule({ ...rule, threshold: Number(rule.threshold) })} — observed ${v}.`;
}

export async function alertsJob({ timeLeft }) {
  const stats = { rules: 0, evaluated: 0, triggered: 0, baseline: 0, stale: 0, duplicate: 0, suppressed: 0, conflicts: 0, errors: 0 };
  const rules = await many('select * from alert_rules where enabled order by symbol, id');
  stats.rules = rules.length;
  const bySymbol = new Map();
  for (const r of rules) { if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []); bySymbol.get(r.symbol).push(r); }
  const emailOn = !!capabilities().email;

  for (const [symbol, list] of bySymbol) {
    if (timeLeft() < 5000) { stats.deferred = (stats.deferred || 0) + list.length; continue; }
    let obs;
    try { obs = await observationsFor(symbol, new Set(list.map((r) => r.timeframe))); } catch (e) { stats.errors++; log.warn('alert_observation_failed', { symbol, error: e }); continue; }
    for (const rule of list) {
      const o = obs[rule.timeframe];
      const metric = ALERT_KINDS[rule.kind]?.metric;
      const observation = { key: o?.key, value: o?.values?.[metric], fresh: !!(o && o.fresh && o.key), asOf: o?.asOf };
      const result = evaluateRule({ kind: rule.kind, threshold: Number(rule.threshold), cooldownMinutes: rule.cooldown_minutes }, rule.state, observation, now());
      stats.evaluated++;
      if (result.action === 'skip_stale') { stats.stale++; await query('update alert_rules set last_evaluated_at=now() where id=$1', [rule.id]); continue; }
      if (result.action === 'skip_duplicate') { stats.duplicate++; continue; }
      if (result.action === 'baseline') stats.baseline++;
      if (result.action === 'suppressed_cooldown') stats.suppressed++;
      try {
        await tx(async (c) => {
          const upd = await c.query(`update alert_rules set state=$2, state_version=state_version+1, last_evaluated_at=now(),
            last_triggered_at = case when $4 then now() else last_triggered_at end where id=$1 and state_version=$3`,
          [rule.id, JSON.stringify(result.state), rule.state_version, result.action === 'trigger']);
          if (!upd.rowCount) { stats.conflicts++; return; } // another run/edit won; it will re-evaluate
          if (result.action !== 'trigger') return;
          const ev = await c.query(`insert into alert_events(rule_id, user_id, symbol, observation_key, observed_value, threshold, kind, data_as_of, message)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (rule_id, observation_key) do nothing returning id`,
          [rule.id, rule.user_id, rule.symbol, observation.key, observation.value, rule.threshold, rule.kind, observation.asOf, message(rule, observation.value)]);
          if (!ev.rows[0]) { stats.duplicate++; return; }
          stats.triggered++;
          const prefs = (await c.query('select notify_inapp, notify_email from user_preferences where user_id=$1', [rule.user_id])).rows[0] || { notify_inapp: true, notify_email: false };
          await c.query(`insert into deliveries(event_id, user_id, channel, status, sent_at) values ($1,$2,'inapp',$3, case when $3='sent' then now() end)`,
            [ev.rows[0].id, rule.user_id, prefs.notify_inapp === false ? 'skipped' : 'sent']);
          if (rule.channels.includes('email')) {
            const status = emailOn && prefs.notify_email ? 'pending' : 'skipped';
            const why = !emailOn ? 'Email delivery not configured' : !prefs.notify_email ? 'Email notifications are off in preferences' : null;
            await c.query(`insert into deliveries(event_id, user_id, channel, status, last_error) values ($1,$2,'email',$3,$4)`, [ev.rows[0].id, rule.user_id, status, why]);
          }
        });
      } catch (e) { stats.errors++; log.error('alert_eval_failed', { ruleId: rule.id, error: e }); }
    }
  }
  return stats;
}

/** Sends pending email deliveries with bounded, backed-off retries. */
export async function deliveriesJob({ timeLeft }) {
  const stats = { sent: 0, failed: 0, retried: 0 };
  for (;;) {
    if (timeLeft() < 4000) break;
    const batch = await tx(async (c) => {
      const rows = (await c.query(`select d.id, d.attempts, d.user_id, e.message, e.symbol, u.email, u."emailVerified" as verified
        from deliveries d join alert_events e on e.id = d.event_id join "user" u on u.id = d.user_id
        where d.status='pending' and d.channel='email' and not d.is_test and d.next_attempt_at <= now()
        order by d.created_at limit 10 for update of d skip locked`)).rows;
      // Claim: push next_attempt_at out so a concurrent runner skips these; the send happens after commit.
      for (const row of rows) await c.query(`update deliveries set next_attempt_at=now() + interval '10 minutes' where id=$1`, [row.id]);
      return rows;
    });
    if (!batch.length) break;
    for (const d of batch) {
      if (!d.verified) { await query(`update deliveries set status='skipped', last_error='Email address not verified' where id=$1`, [d.id]); continue; }
      try {
        await sendEmail({ to: d.email, kind: 'alert', subject: `MarketPilot alert: ${d.symbol}`, text: `${d.message}\n\nThis alert describes a market condition you configured. It is not investment advice.\nManage alerts in MarketPilot → Alerts.` });
        await query(`update deliveries set status='sent', sent_at=now(), last_error=null, attempts=attempts+1 where id=$1`, [d.id]);
        stats.sent++;
      } catch (e) {
        const attempts = d.attempts + 1;
        const final = attempts >= MAX_ATTEMPTS || e.retryable === false;
        await query(`update deliveries set status=$2, last_error=$3, attempts=attempts+1, next_attempt_at=now() + ($4 || ' minutes')::interval where id=$1`,
          [d.id, final ? 'failed' : 'pending', String(e.message).slice(0, 300), String(2 ** attempts)]);
        if (final) stats.failed++; else stats.retried++;
      }
    }
  }
  return stats;
}
