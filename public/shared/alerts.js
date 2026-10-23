// ============================================================
// Alert rule evaluation — pure, deterministic, idempotent.
//
// Semantics
//  * Trigger-on-cross: a rule fires only when the observed value moves from
//    the non-triggering side to the triggering side between two consecutive
//    evaluated observations. The first observation only establishes a baseline.
//  * Each observation has a key (data timestamp). Re-evaluating the same key is
//    a no-op, so retries cannot produce duplicate events.
//  * Stale or unavailable observations never trigger and never move state.
//  * Cooldown: after a trigger, further crosses within `cooldownMinutes` are
//    recorded (state moves) but suppressed.
// ============================================================

export const ALERT_KINDS = {
  price_above: { label: 'Price crosses above', metric: 'price', dir: 'above', unit: '$' },
  price_below: { label: 'Price crosses below', metric: 'price', dir: 'below', unit: '$' },
  rsi_above: { label: 'RSI(14) crosses above', metric: 'rsi14', dir: 'above', unit: '' },
  rsi_below: { label: 'RSI(14) crosses below', metric: 'rsi14', dir: 'below', unit: '' },
  change_pct_above: { label: 'Daily change rises above', metric: 'changePct', dir: 'above', unit: '%' },
  change_pct_below: { label: 'Daily change falls below', metric: 'changePct', dir: 'below', unit: '%' },
};

export function validateRule(r) {
  const errs = [];
  if (!ALERT_KINDS[r.kind]) errs.push('Unknown condition');
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(r.symbol || '')) errs.push('Symbol is required');
  if (typeof r.threshold !== 'number' || !Number.isFinite(r.threshold)) errs.push('Threshold must be a number');
  if (r.kind?.startsWith('price_') && r.threshold <= 0) errs.push('Price threshold must be positive');
  if (r.kind?.startsWith('rsi_') && (r.threshold <= 0 || r.threshold >= 100)) errs.push('RSI threshold must be between 0 and 100');
  if (r.cooldownMinutes !== undefined && (!Number.isInteger(r.cooldownMinutes) || r.cooldownMinutes < 0 || r.cooldownMinutes > 10080)) errs.push('Cooldown must be 0–10080 minutes');
  return errs;
}

/** @returns {'trigger'|'clear'} */
function side(kind, value, threshold) {
  const dir = ALERT_KINDS[kind].dir;
  if (dir === 'above') return value > threshold ? 'trigger' : 'clear';
  return value < threshold ? 'trigger' : 'clear';
}

/**
 * @param {import('./types.js').AlertRuleCore} rule
 * @param {import('./types.js').AlertState|null} state
 * @param {import('./types.js').Observation} obs
 * @param {Date} [now]
 * @returns {{ action: 'skip_duplicate'|'skip_stale'|'baseline'|'no_cross'|'trigger'|'suppressed_cooldown', state: import('./types.js').AlertState }}
 */
export function evaluateRule(rule, state, obs, now = new Date()) {
  const st = state || {};
  if (st.lastKey && obs.key === st.lastKey) return { action: 'skip_duplicate', state: st };
  if (!obs.fresh || typeof obs.value !== 'number' || !Number.isFinite(obs.value)) return { action: 'skip_stale', state: st };
  const s = side(rule.kind, obs.value, rule.threshold);
  /** @type {import('./types.js').AlertState} */
  const next = { ...st, lastKey: obs.key ?? undefined, lastSide: s, lastValue: obs.value, lastAsOf: obs.asOf ?? undefined };
  if (!st.lastSide) return { action: 'baseline', state: next };
  if (!(st.lastSide === 'clear' && s === 'trigger')) return { action: 'no_cross', state: next };
  const cd = (rule.cooldownMinutes ?? 0) * 60000;
  if (st.lastTriggeredAt && now.getTime() - new Date(st.lastTriggeredAt).getTime() < cd) {
    return { action: 'suppressed_cooldown', state: next };
  }
  return { action: 'trigger', state: { ...next, lastTriggeredAt: now.toISOString() } };
}

export function describeRule(r) {
  const k = ALERT_KINDS[r.kind];
  if (!k) return 'Unknown rule';
  const t = k.unit === '$' ? `$${r.threshold}` : k.unit === '%' ? `${r.threshold}%` : String(r.threshold);
  return `${r.symbol}: ${k.label} ${t}`;
}
