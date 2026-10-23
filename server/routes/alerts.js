import { sendJson, readBody, rateLimit } from '../http.js';
import { AppError, notFound, badRequest } from '../errors.js';
import { query, many, one } from '../db.js';
import { config, capabilities } from '../config.js';
import { normSymbol, getProvider } from '../market/service.js';
import { validateRule, describeRule, ALERT_KINDS } from '../../public/shared/alerts.js';
import { sendEmail } from '../email.js';
import { uuid } from './user.js';

function cleanRule(b, { liveAllowed }) {
  const r = {
    symbol: normSymbol(b.symbol),
    kind: String(b.kind || ''),
    threshold: Number(b.threshold),
    timeframe: b.timeframe === 'live' ? 'live' : '1D',
    channels: Array.isArray(b.channels) ? [...new Set(b.channels.filter((c) => c === 'inapp' || c === 'email'))] : ['inapp'],
    enabled: b.enabled !== false,
    cooldownMinutes: b.cooldownMinutes === undefined ? 1440 : Number(b.cooldownMinutes),
  };
  if (!r.channels.includes('inapp')) r.channels.unshift('inapp');
  const errs = validateRule(r);
  if (r.timeframe === 'live' && !liveAllowed) errs.push('Intraday ("live") alerts need a data plan with intraday snapshots; use end-of-day (1D).');
  if (r.timeframe === 'live' && r.kind.startsWith('rsi_')) errs.push('RSI alerts are evaluated on completed daily bars only (timeframe 1D).');
  if (r.channels.includes('email') && !capabilities().email) errs.push('Email delivery is not configured on this server.');
  if (errs.length) throw badRequest(errs.join('; '));
  return r;
}

const shape = (x) => ({
  id: x.id, symbol: x.symbol, kind: x.kind, threshold: x.threshold, timeframe: x.timeframe, channels: x.channels,
  enabled: x.enabled, cooldownMinutes: x.cooldown_minutes, lastEvaluatedAt: x.last_evaluated_at, lastTriggeredAt: x.last_triggered_at,
  lastObservation: x.state?.lastValue !== undefined ? { value: x.state.lastValue, asOf: x.state.lastAsOf, side: x.state.lastSide } : null,
  description: describeRule(x), createdAt: x.created_at,
});

export function registerAlertRoutes(r) {
  r.get('/api/alerts', async ({ res, user }) => {
    const rules = await many('select * from alert_rules where user_id=$1 order by created_at desc', [user.id]);
    let liveAllowed = false;
    try { liveAllowed = !!getProvider().caps.snapshot; } catch { /* unavailable */ }
    sendJson(res, 200, {
      rules: rules.map(shape),
      kinds: ALERT_KINDS,
      capabilities: { email: !!capabilities().email, liveTimeframe: liveAllowed, evaluation: capabilities().cron ? 'scheduled' : 'scheduler_not_configured' },
    });
  });

  r.post('/api/alerts', async ({ req, res, user }) => {
    let liveAllowed = false;
    try { liveAllowed = !!getProvider().caps.snapshot; } catch { /* unavailable */ }
    const rule = cleanRule(await readBody(req), { liveAllowed });
    const c = (await one('select count(*)::int c from alert_rules where user_id=$1', [user.id])).c;
    if (c >= config.limits.alertRulesPerUser) throw new AppError(409, 'limit_reached', `Up to ${config.limits.alertRulesPerUser} alert rules`);
    const row = await one(`insert into alert_rules(user_id, symbol, timeframe, kind, threshold, channels, enabled, cooldown_minutes)
      values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`, [user.id, rule.symbol, rule.timeframe, rule.kind, rule.threshold, rule.channels, rule.enabled, rule.cooldownMinutes]);
    sendJson(res, 201, { rule: shape(row) });
  });

  r.patch('/api/alerts/:id', async ({ req, res, user, params }) => {
    const b = await readBody(req);
    const cur = await one('select * from alert_rules where id=$1 and user_id=$2', [uuid(params.id, 'Alert'), user.id]);
    if (!cur) throw notFound('Alert');
    let liveAllowed = false;
    try { liveAllowed = !!getProvider().caps.snapshot; } catch { /* unavailable */ }
    const merged = cleanRule({
      symbol: b.symbol ?? cur.symbol, kind: b.kind ?? cur.kind, threshold: b.threshold ?? cur.threshold, timeframe: b.timeframe ?? cur.timeframe,
      channels: b.channels ?? cur.channels, enabled: b.enabled ?? cur.enabled, cooldownMinutes: b.cooldownMinutes ?? cur.cooldown_minutes,
    }, { liveAllowed });
    // Changing the condition resets the crossing baseline so a stale side can't fire instantly.
    const conditionChanged = merged.symbol !== cur.symbol || merged.kind !== cur.kind || merged.threshold !== cur.threshold || merged.timeframe !== cur.timeframe;
    const row = await one(`update alert_rules set symbol=$3, kind=$4, threshold=$5, timeframe=$6, channels=$7, enabled=$8, cooldown_minutes=$9,
      state = case when $10 then '{}'::jsonb else state end, state_version = state_version + 1, updated_at=now()
      where id=$1 and user_id=$2 returning *`, [cur.id, user.id, merged.symbol, merged.kind, merged.threshold, merged.timeframe, merged.channels, merged.enabled, merged.cooldownMinutes, conditionChanged]);
    sendJson(res, 200, { rule: shape(row) });
  });

  r.delete('/api/alerts/:id', async ({ res, user, params }) => {
    const r1 = await query('delete from alert_rules where id=$1 and user_id=$2', [uuid(params.id, 'Alert'), user.id]);
    if (!r1.rowCount) throw notFound('Alert');
    sendJson(res, 200, { ok: true });
  });

  r.get('/api/alerts/events', async ({ res, user }) => {
    const events = await many(`select e.id, e.rule_id, e.symbol, e.kind, e.observed_value, e.threshold, e.data_as_of, e.message, e.read_at, e.created_at,
      coalesce(json_agg(json_build_object('channel', d.channel, 'status', d.status, 'attempts', d.attempts, 'error', d.last_error, 'sentAt', d.sent_at)) filter (where d.id is not null), '[]') as deliveries
      from alert_events e left join deliveries d on d.event_id = e.id
      where e.user_id=$1 group by e.id order by e.created_at desc limit 100`, [user.id]);
    const unread = (await one('select count(*)::int c from alert_events where user_id=$1 and read_at is null', [user.id])).c;
    const tests = await many('select channel, status, attempts, last_error, sent_at, created_at from deliveries where user_id=$1 and is_test order by created_at desc limit 5', [user.id]);
    sendJson(res, 200, { events, unread, testDeliveries: tests });
  });

  r.post('/api/alerts/events/read', async ({ res, user }) => {
    await query('update alert_events set read_at=now() where user_id=$1 and read_at is null', [user.id]);
    sendJson(res, 200, { ok: true });
  });

  // Test delivery to the signed-in user's own verified address only. Flagged is_test.
  r.post('/api/alerts/test-delivery', async ({ res, user }) => {
    if (!capabilities().email) throw new AppError(503, 'email_unavailable', 'Email delivery is not configured on this server.');
    if (!user.emailVerified) throw new AppError(409, 'email_unverified', 'Verify your email address first.');
    await rateLimit(`test-delivery:${user.id}`, 3, 3600);
    const d = await one(`insert into deliveries(user_id, channel, status, is_test, attempts) values ($1,'email','pending',true,1) returning id`, [user.id]);
    try {
      await sendEmail({ to: user.email, kind: 'alert_test', subject: '[TEST] MarketPilot alert delivery', text: 'This is a test message you requested from MarketPilot settings. No market condition triggered it.' });
      await query(`update deliveries set status='sent', sent_at=now() where id=$1`, [d.id]);
      sendJson(res, 200, { status: 'sent' });
    } catch (e) {
      await query(`update deliveries set status='failed', last_error=$2 where id=$1`, [d.id, String(e.message).slice(0, 300)]);
      throw e;
    }
  });
}
