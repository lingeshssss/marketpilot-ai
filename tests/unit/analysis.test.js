import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysis, explainAnalysis, exitScenarios, riskReward, WARMUP, sentimentScore } from '../../public/shared/analysis.js';
import { validateBars, DataQualityError } from '../../public/shared/bars.js';
import { nextTradingDay } from '../../public/shared/calendar.js';

function makeBars(closes, { start = '2025-01-02', vol = 1_000_000 } = {}) {
  let d = start; const out = [];
  for (const c of closes) {
    out.push({ date: d, t: Date.parse(`${d}T21:00:00Z`), o: c, h: c * 1.01, l: c * 0.99, c, v: typeof vol === 'function' ? vol(out.length) : vol });
    d = nextTradingDay(d);
  }
  return out;
}
function seeded(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

test('Analysis is deterministic: same inputs -> identical object (no randomness)', () => {
  const rnd = seeded(7); let p = 100;
  const bars = makeBars(Array.from({ length: 260 }, () => (p *= 1 + (rnd() - 0.5) * 0.04)));
  const a = buildAnalysis({ symbol: 'TEST', bars });
  const b = buildAnalysis({ symbol: 'TEST', bars: structuredClone(bars) });
  assert.deepEqual(a, b);
  assert.deepEqual(explainAnalysis(a), explainAnalysis(b));
});

test('Insufficient history: values null and flagged, never fabricated', () => {
  const a = buildAnalysis({ symbol: 'NEW', bars: makeBars([10, 11, 12, 11, 12]) });
  assert.equal(a.indicators.rsi14.value, null);
  assert.equal(a.indicators.rsi14.zone, 'insufficient');
  assert.equal(a.indicators.macd.state, 'insufficient');
  assert.equal(a.indicators.sma[200], null);
  assert.equal(a.scores.momentum.value, null);
  assert.ok(a.quality.insufficient.includes('sma200'));
  assert.ok(explainAnalysis(a).some((e) => e.id === 'quality'));
});

test('Boundary: exactly WARMUP.rsi bars defines RSI; one fewer does not', () => {
  const up = Array.from({ length: WARMUP.rsi }, (_, i) => 10 + i);
  assert.notEqual(buildAnalysis({ symbol: 'X', bars: makeBars(up) }).indicators.rsi14.value, null);
  assert.equal(buildAnalysis({ symbol: 'X', bars: makeBars(up.slice(1)) }).indicators.rsi14.value, null);
});

test('Flat prices: RSI 50, zero volatility, low risk, bands collapse', () => {
  const a = buildAnalysis({ symbol: 'FLAT', bars: makeBars(Array(250).fill(20)) });
  assert.equal(a.indicators.rsi14.value, 50);
  assert.equal(a.indicators.volatility20, 0);
  assert.equal(a.scores.risk.label, 'Low');
  assert.equal(a.indicators.bollinger.upper, a.indicators.bollinger.lower);
  assert.equal(a.indicators.bollinger.percentB, null, '%B undefined when bands collapse');
});

test('Zero-volume bars are counted, volume ratio stays finite or null', () => {
  const a = buildAnalysis({ symbol: 'Z', bars: makeBars(Array.from({ length: 40 }, (_, i) => 10 + (i % 3)), { vol: (i) => (i % 5 === 0 ? 0 : 1000) }) });
  assert.ok(a.quality.zeroVolumeBars > 0);
  assert.ok(a.indicators.volume.ratio === null || Number.isFinite(a.indicators.volume.ratio));
});

test('Strong rally: RSI overbought and explanation says overbought (the AAPL 89.4 / "no overheating" bug)', () => {
  const bars = makeBars(Array.from({ length: 80 }, (_, i) => 100 + i * 1.5));
  const a = buildAnalysis({ symbol: 'UP', bars });
  assert.equal(a.indicators.rsi14.zone, 'overbought');
  const rsiText = explainAnalysis(a).find((e) => e.id === 'rsi');
  assert.match(rsiText.title, /overbought/);
  assert.ok(rsiText.text.includes(a.indicators.rsi14.value.toFixed(1)));
  assert.equal(a.levels.resistance.length, 0, 'no resistance above a fresh high');
  assert.match(explainAnalysis(a).find((e) => e.id === 'levels').text, /No pivot resistance/);
});

test('Property: explanations agree with indicator values across 300 random series', () => {
  for (let s = 1; s <= 300; s++) {
    const rnd = seeded(s); let p = 50 + s;
    const n = 20 + Math.floor(rnd() * 260);
    const a = buildAnalysis({ symbol: 'P', bars: makeBars(Array.from({ length: n }, () => (p *= 1 + (rnd() - 0.5) * 0.06))) });
    const ex = explainAnalysis(a);
    const r = ex.find((e) => e.id === 'rsi');
    const zone = a.indicators.rsi14.zone;
    if (zone === 'overbought') assert.match(r.title, /overbought/);
    if (zone === 'oversold') assert.match(r.title, /oversold/);
    if (zone === 'neutral') { assert.match(r.title, /neutral/); assert.doesNotMatch(r.text, /overbought threshold\. Price/); }
    const m = ex.find((e) => e.id === 'macd');
    const st = a.indicators.macd.state;
    if (st === 'bullish_cross') assert.match(m.text, /crossed above/);
    if (st === 'bearish_cross') assert.match(m.text, /crossed below/);
    if (st === 'above_signal') { assert.match(m.text, /above its signal/); assert.doesNotMatch(m.text, /crossed/); }
    if (st === 'below_signal') { assert.match(m.text, /below its signal/); assert.doesNotMatch(m.text, /crossed/); }
    // MACD sign consistency
    if (a.indicators.macd.histogram !== null) {
      const h = a.indicators.macd.histogram;
      if (st === 'above_signal' || st === 'bullish_cross') assert.ok(h > 0);
      if (st === 'below_signal' || st === 'bearish_cross') assert.ok(h < 0);
    }
    // Levels ordering & side
    for (const lv of a.levels.resistance || []) assert.ok(lv.level > a.close);
    for (const lv of a.levels.support || []) assert.ok(lv.level < a.close);
    // Scores in range or null
    for (const k of ['trend', 'momentum', 'risk', 'composite']) {
      const v = a.scores[k].value;
      assert.ok(v === null || (v >= 0 && v <= 100), `${k}=${v}`);
    }
  }
});

test('Exit scenarios label technical vs illustrative vs volatility-derived', () => {
  const rnd = seeded(3); let p = 80;
  const a = buildAnalysis({ symbol: 'E', bars: makeBars(Array.from({ length: 200 }, () => (p *= 1 + (rnd() - 0.5) * 0.05))) });
  const sc = exitScenarios(a);
  assert.match(sc.volatility.method, /ATR/);
  assert.ok(Math.abs(sc.volatility.stop - (a.close - 2 * a.indicators.atr14.value)) < 1e-9);
  assert.ok(sc.illustrative.every((x) => /illustrative/.test(x.method)));
  const rr = riskReward({ entry: 100, target: 110, stop: 95 });
  assert.equal(rr.ratio, 2); assert.equal(rr.rewardPct, 10); assert.equal(rr.riskPct, 5);
  assert.equal(riskReward({ entry: 100, target: 110, stop: 105 }).valid, false);
});

test('Sentiment requires >= 3 tagged articles', () => {
  assert.equal(sentimentScore([{ sentiment: { X: 'positive' } }], 'X').value, null);
  const v = sentimentScore([{ sentiment: { X: 'positive' } }, { sentiment: { X: 'positive' } }, { sentiment: { X: 'negative' } }, { sentiment: { X: 'neutral' } }], 'X');
  assert.equal(v.value, 63); // 50 + 50 × (2 − 1) / 4 = 62.5 → 63
});

test('Bar validation rejects malformed / out-of-order / duplicate data and reports missing sessions', () => {
  const ok = makeBars([10, 11, 12]);
  assert.equal(validateBars(ok).missingSessions.length, 0);
  assert.throws(() => validateBars([ok[1], ok[0]]), DataQualityError);
  assert.throws(() => validateBars([ok[0], ok[0]]), DataQualityError);
  assert.throws(() => validateBars([{ ...ok[0], h: 1 }]), DataQualityError);
  assert.throws(() => validateBars([{ ...ok[0], c: NaN }]), DataQualityError);
  assert.throws(() => validateBars([{ ...ok[0], c: -1, l: -2, o: -1, h: -1 }]), DataQualityError);
  const gap = validateBars([ok[0], ok[2]]);
  assert.deepEqual(gap.missingSessions, [ok[1].date]);
});
