// ============================================================
// Grounding checks for AI output. Pure functions (unit-tested).
//  * Every metricRef must name a metric we supplied.
//  * Every sourceRef must name an article we supplied.
//  * News claims must cite at least one article.
//  * Every number written in the text must match a supplied metric value
//    (at a displayed precision), a number in a cited article, or an allowed
//    parameter/date constant. Otherwise the output is rejected.
// ============================================================

export const PARAM_CONSTANTS = new Set([1, 2, 3, 5, 9, 10, 12, 14, 20, 26, 30, 50, 52, 60, 70, 100, 120, 200, 252]);

/** Flattens the analysis object into referenceable metric ids. */
export function metricsFromAnalysis(an) {
  const I = an.indicators;
  const m = {
    close: an.close, prevClose: an.prevClose, changePct: an.changePct,
    rsi14: I.rsi14.value, 'macd.line': I.macd.macd, 'macd.signal': I.macd.signal, 'macd.histogram': I.macd.histogram,
    sma20: I.sma[20], sma50: I.sma[50], sma200: I.sma[200], ema12: I.ema[12], ema26: I.ema[26],
    'bollinger.upper': I.bollinger.upper, 'bollinger.middle': I.bollinger.middle, 'bollinger.lower': I.bollinger.lower,
    'bollinger.percentB': I.bollinger.percentB, atr14: I.atr14.value, 'atr14.pctOfClose': I.atr14.pctOfClose,
    'volume.last': I.volume.last, 'volume.avg20': I.volume.avg20, 'volume.ratio': I.volume.ratio,
    'volatility20.annualizedPct': I.volatility20 !== null ? I.volatility20 * 100 : null,
    'drawdown120.pct': I.drawdown120 !== null ? I.drawdown120 * 100 : null,
    'return.5d.pct': I.returns.d5, 'return.20d.pct': I.returns.d20, 'return.60d.pct': I.returns.d60, 'return.252d.pct': I.returns.d252,
    'range.high52w': I.range.high52w, 'range.low52w': I.range.low52w,
    'score.trend': an.scores.trend.value, 'score.momentum': an.scores.momentum.value, 'score.risk': an.scores.risk.value, 'score.composite': an.scores.composite.value,
    'stop.atr2x': an.stops.atrStop,
  };
  (an.levels.resistance || []).forEach((l, i) => { m[`resistance${i + 1}`] = l.level; });
  (an.levels.support || []).forEach((l, i) => { m[`support${i + 1}`] = l.level; });
  const states = {
    'rsi14.zone': I.rsi14.zone, 'macd.state': I.macd.state, 'macd.crossBarsAgo': I.macd.crossBarsAgo,
    'trend.label': an.scores.trend.label, 'momentum.label': an.scores.momentum.label, 'risk.label': an.scores.risk.label,
  };
  const numeric = Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
  return { numeric, states };
}

const NUM_RE = /(?<![A-Za-z0-9])[-−+]?\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![A-Za-z0-9])[-−+]?\$?\d+(?:\.\d+)?/g;

export function extractNumbers(text) {
  const out = [];
  for (const m of String(text).matchAll(NUM_RE)) {
    const raw = m[0];
    const v = Number(raw.replace(/[$,+]/g, '').replace('−', '-'));
    if (Number.isFinite(v)) out.push({ raw, value: Math.abs(v), decimals: (raw.split('.')[1] || '').length });
  }
  return out;
}

function matchesValue(n, candidates) {
  for (const c of candidates) {
    const a = Math.abs(c);
    const tol = 0.5 * 10 ** -n.decimals + 1e-9;
    if (Math.abs(a - n.value) <= tol) return true;
    // Compact forms: 58.4M volume, 2.1B, 3.2T
    for (const scale of [1e3, 1e6, 1e9, 1e12]) if (Math.abs(a / scale - n.value) <= tol) return true;
  }
  return false;
}

/** Returns { ok, errors[] } */
export function checkGrounding(output, { metrics, articles }) {
  const errors = [];
  const metricIds = new Set([...Object.keys(metrics.numeric), ...Object.keys(metrics.states)]);
  const articleById = new Map(articles.map((a) => [a.id, a]));
  const numericValues = Object.values(metrics.numeric);

  const visit = (item, path, { requireSource = false } = {}) => {
    for (const ref of item.metricRefs || []) if (!metricIds.has(ref)) errors.push(`${path}: unknown metric "${ref}"`);
    for (const ref of item.sourceRefs || []) if (!articleById.has(ref)) errors.push(`${path}: unknown source "${ref}"`);
    if (requireSource && !(item.sourceRefs || []).length) errors.push(`${path}: factual news claim without a source`);
    const texts = [item.text, item.narrative, ...(item.assumptions || [])].filter(Boolean);
    const citedNums = (item.sourceRefs || []).flatMap((id) => {
      const a = articleById.get(id);
      return a ? extractNumbers(`${a.title} ${a.description || ''}`).map((x) => x.value) : [];
    });
    for (const t of texts) {
      for (const n of extractNumbers(t)) {
        if (n.decimals === 0 && (PARAM_CONSTANTS.has(n.value) || (n.value >= 1990 && n.value <= 2100))) continue;
        if (matchesValue(n, numericValues) || matchesValue(n, citedNums)) continue;
        errors.push(`${path}: number "${n.raw}" is not in the supplied data`);
      }
    }
  };

  visit({ text: output.summary }, 'summary');
  (output.observations || []).forEach((x, i) => visit(x, `observations[${i}]`));
  (output.calculations || []).forEach((x, i) => visit(x, `calculations[${i}]`));
  (output.interpretation || []).forEach((x, i) => visit(x, `interpretation[${i}]`));
  (output.newsClaims || []).forEach((x, i) => visit(x, `newsClaims[${i}]`, { requireSource: true }));
  (output.contradictoryEvidence || []).forEach((x, i) => visit(x, `contradictoryEvidence[${i}]`));
  for (const k of ['bull', 'base', 'bear']) if (output.scenarios?.[k]) visit(output.scenarios[k], `scenarios.${k}`);
  (output.limitations || []).forEach((t, i) => visit({ text: t }, `limitations[${i}]`));
  return { ok: errors.length === 0, errors: errors.slice(0, 25) };
}

/** Sanitises untrusted article text before it enters a prompt. */
export function sanitizeUntrusted(s, max = 600) {
  return String(s || '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'))
    .slice(0, max);
}
