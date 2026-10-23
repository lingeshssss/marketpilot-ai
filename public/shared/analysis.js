// ============================================================
// Versioned analysis object — the single source of truth for every
// indicator card, score, scanner column, alert check, explanation and
// AI prompt. Build once per (symbol, timeframe, data cutoff).
//
// Timeframe: daily bars ('1D'). Adjustment: as delivered by the provider
// (Massive aggregates are split-adjusted, not dividend-adjusted).
//
// SCORES ARE HEURISTICS, NOT PROBABILITIES. They summarise indicator states
// on a 0–100 scale. They have not been calibrated against forward returns and
// must not be read as a likelihood of profit.
// ============================================================

import {
  sma, ema, rsi, macd, bollinger, atr, realizedVolatility, maxDrawdown,
  last, supportResistance,
} from './indicators.js';

export const ANALYSIS_VERSION = 'mp-ta-1.0.0';

export const PARAMS = Object.freeze({
  rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30,
  macdFast: 12, macdSlow: 26, macdSignal: 9, crossLookback: 3,
  smaPeriods: [20, 50, 200], emaPeriods: [12, 26],
  bbPeriod: 20, bbK: 2, atrPeriod: 14, volAvgPeriod: 20,
  volatilityWindow: 20, drawdownWindow: 120, srPivot: 5, srLookback: 120, srTolerance: 0.015,
  stopAtrMultiple: 2,
});

/** Minimum bars needed before each output is defined. */
export const WARMUP = Object.freeze({
  rsi: PARAMS.rsiPeriod + 1,
  macd: PARAMS.macdSlow,
  macdSignal: PARAMS.macdSlow + PARAMS.macdSignal - 1,
  sma20: 20, sma50: 50, sma200: 200,
  ema12: 12, ema26: 26,
  bollinger: PARAMS.bbPeriod,
  atr: PARAMS.atrPeriod + 1,
  volume: PARAMS.volAvgPeriod + 1,
  volatility: PARAMS.volatilityWindow + 1,
  levels: PARAMS.srPivot * 2 + 1,
});

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function pctChange(closes, n) {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1 - n], b = closes[closes.length - 1];
  return a > 0 ? (b / a - 1) * 100 : null;
}

function macdState(m) {
  const h = m.histogram;
  const n = h.length;
  if (n === 0 || h[n - 1] === null) return { state: 'insufficient', crossBarsAgo: null };
  // Find most recent sign change in histogram within lookback
  for (let i = n - 1; i > n - 1 - PARAMS.crossLookback && i > 0; i--) {
    if (h[i] === null || h[i - 1] === null) break;
    if (h[i - 1] <= 0 && h[i] > 0) return { state: 'bullish_cross', crossBarsAgo: n - 1 - i };
    if (h[i - 1] >= 0 && h[i] < 0) return { state: 'bearish_cross', crossBarsAgo: n - 1 - i };
  }
  if (h[n - 1] > 0) return { state: 'above_signal', crossBarsAgo: null };
  if (h[n - 1] < 0) return { state: 'below_signal', crossBarsAgo: null };
  return { state: 'at_signal', crossBarsAgo: null };
}

export const MACD_STATE_LABEL = {
  bullish_cross: 'Bullish cross', bearish_cross: 'Bearish cross',
  above_signal: 'Above signal', below_signal: 'Below signal',
  at_signal: 'At signal', insufficient: 'Insufficient history',
};

function rsiZone(v) {
  if (!isNum(v)) return 'insufficient';
  if (v >= PARAMS.rsiOverbought) return 'overbought';
  if (v <= PARAMS.rsiOversold) return 'oversold';
  return 'neutral';
}

// ---------------- scores (documented heuristics) ----------------

/**
 * Trend (0–100): weighted share of satisfied trend conditions among those
 * with enough history. Conditions & weights:
 *   close > SMA20 (1), close > SMA50 (1), close > SMA200 (1),
 *   SMA20 > SMA50 (1), SMA50 > SMA200 (1), SMA50 rising over 10 bars (1).
 * Label: >= 67 Uptrend, <= 33 Downtrend, else Mixed.
 */
function trendScore(close, s20, s50, s200, s50series) {
  const comps = [];
  const add = (label, ok, avail) => comps.push({ label, met: avail ? ok : null, weight: 1 });
  add('Close above SMA20', close > s20, isNum(s20));
  add('Close above SMA50', close > s50, isNum(s50));
  add('Close above SMA200', close > s200, isNum(s200));
  add('SMA20 above SMA50', s20 > s50, isNum(s20) && isNum(s50));
  add('SMA50 above SMA200', s50 > s200, isNum(s50) && isNum(s200));
  const n = s50series.length;
  const prev50 = n > 10 ? s50series[n - 11] : null;
  add('SMA50 rising (10 bars)', s50 > prev50, isNum(s50) && isNum(prev50));
  const avail = comps.filter((c) => c.met !== null);
  if (avail.length < 2) return { value: null, label: 'Insufficient history', components: comps, partial: true };
  const value = Math.round(100 * avail.filter((c) => c.met).length / avail.length);
  return {
    value, label: value >= 67 ? 'Uptrend' : value <= 33 ? 'Downtrend' : 'Mixed',
    components: comps, partial: avail.length < comps.length,
    formula: '100 × (conditions met ÷ conditions with sufficient history)',
  };
}

/**
 * Momentum (0–100) = 0.6 × RSI(14) + 0.4 × MACD component, where the MACD
 * component is 100 (MACD > signal and > 0), 70 (MACD > signal, <= 0),
 * 50 (equal), 30 (MACD < signal, >= 0), 0 (MACD < signal and < 0).
 * Label: >= 60 Positive, <= 40 Negative, else Neutral.
 */
function momentumScore(rsiV, macdV, sigV) {
  if (!isNum(rsiV) || !isNum(macdV) || !isNum(sigV)) {
    return { value: null, label: 'Insufficient history', components: [] };
  }
  let mc;
  if (macdV > sigV) mc = macdV > 0 ? 100 : 70;
  else if (macdV < sigV) mc = macdV >= 0 ? 30 : 0;
  else mc = 50;
  const value = Math.round(clamp(0.6 * rsiV + 0.4 * mc));
  return {
    value, label: value >= 60 ? 'Positive' : value <= 40 ? 'Negative' : 'Neutral',
    components: [{ label: 'RSI(14)', value: rsiV, weight: 0.6 }, { label: 'MACD component', value: mc, weight: 0.4 }],
    formula: '0.6 × RSI(14) + 0.4 × MACD component',
  };
}

/**
 * Risk (0–100), higher = more volatile:
 *   min(100, annualised 20-day volatility % × 1.0) × 0.7
 * + min(100, |max drawdown over 120 bars| % × 2.0) × 0.3
 * Label: < 33 Low, < 67 Moderate, else High.
 */
function riskScore(vol, mdd) {
  if (!isNum(vol)) return { value: null, label: 'Insufficient history', components: [] };
  const volPct = vol * 100;
  const ddPct = isNum(mdd) ? Math.abs(mdd) * 100 : 0;
  const value = Math.round(clamp(Math.min(100, volPct) * 0.7 + Math.min(100, ddPct * 2) * 0.3));
  return {
    value, label: value < 33 ? 'Low' : value < 67 ? 'Moderate' : 'High',
    components: [
      { label: 'Annualised volatility (20d)', value: volPct, unit: '%', weight: 0.7 },
      { label: 'Max drawdown (120d)', value: -ddPct, unit: '%', weight: 0.3 },
    ],
    formula: '0.7 × min(100, vol%) + 0.3 × min(100, 2 × |drawdown%|)',
  };
}

/**
 * Sentiment (0–100) from provider-tagged news insights for this ticker over
 * the supplied articles: 50 + 50 × (positive − negative) ÷ tagged.
 * Requires >= 3 tagged articles; otherwise null.
 */
export function sentimentScore(articles = [], symbol) {
  let pos = 0, neg = 0, neu = 0;
  for (const a of articles) {
    const s = (a.sentiment && (a.sentiment[symbol] || a.sentiment.overall)) || null;
    if (s === 'positive') pos++; else if (s === 'negative') neg++; else if (s === 'neutral') neu++;
  }
  const tagged = pos + neg + neu;
  if (tagged < 3) return { value: null, label: 'Insufficient coverage', counts: { pos, neg, neu }, components: [] };
  const value = Math.round(50 + 50 * (pos - neg) / tagged);
  return {
    value, label: value >= 60 ? 'Positive' : value <= 40 ? 'Negative' : 'Mixed',
    counts: { pos, neg, neu },
    formula: '50 + 50 × (positive − negative) ÷ tagged articles (provider sentiment tags)',
    components: [],
  };
}

/** Composite setup score: 0.5 × trend + 0.3 × momentum + 0.2 × (100 − risk). */
function compositeScore(trend, momentum, risk) {
  if (!isNum(trend.value) || !isNum(momentum.value) || !isNum(risk.value)) {
    return { value: null, label: 'Insufficient history', components: [] };
  }
  const value = Math.round(0.5 * trend.value + 0.3 * momentum.value + 0.2 * (100 - risk.value));
  return {
    value, label: value >= 65 ? 'Constructive' : value <= 35 ? 'Weak' : 'Neutral',
    formula: '0.5 × trend + 0.3 × momentum + 0.2 × (100 − risk)',
    components: [],
  };
}

// ---------------- builder ----------------

/**
 * @param {{ symbol: string, timeframe?: string, bars: import('./types.js').Bar[], adjustment?: string, source?: string,
 *           news?: any[]|null, dataQuality?: import('./types.js').DataQuality }} input
 */
export function buildAnalysis({ symbol, timeframe = '1D', bars, adjustment = 'split-adjusted', source = 'unknown', news = null, dataQuality = {} }) {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const vols = bars.map((b) => b.v);
  const n = bars.length;
  const lastBar = bars[n - 1] || null;
  const close = lastBar ? lastBar.c : null;

  const s = Object.fromEntries(PARAMS.smaPeriods.map((p) => [p, sma(closes, p)]));
  const e = Object.fromEntries(PARAMS.emaPeriods.map((p) => [p, ema(closes, p)]));
  const r = rsi(closes, PARAMS.rsiPeriod);
  const m = macd(closes, PARAMS.macdFast, PARAMS.macdSlow, PARAMS.macdSignal);
  const bb = bollinger(closes, PARAMS.bbPeriod, PARAMS.bbK);
  const a = atr(highs, lows, closes, PARAMS.atrPeriod);
  const vol = realizedVolatility(closes, PARAMS.volatilityWindow);
  const mdd = n >= 2 ? maxDrawdown(closes, PARAMS.drawdownWindow) : null;

  const rsiV = n ? r[n - 1] : null;
  const rsiPrev = n > 1 ? r[n - 2] : null;
  const macdV = n ? m.macd[n - 1] : null;
  const sigV = n ? m.signal[n - 1] : null;
  const histV = n ? m.histogram[n - 1] : null;
  const ms = macdState(m);

  // volume: compare last bar with mean of the PREVIOUS 20 bars (excludes the bar itself)
  let volAvg = null;
  if (n >= PARAMS.volAvgPeriod + 1) {
    let sum = 0;
    for (let i = n - 1 - PARAMS.volAvgPeriod; i < n - 1; i++) sum += vols[i];
    volAvg = sum / PARAMS.volAvgPeriod;
  }
  const volRatio = volAvg && volAvg > 0 ? vols[n - 1] / volAvg : null;

  const bbU = n ? bb.upper[n - 1] : null, bbL = n ? bb.lower[n - 1] : null, bbM = n ? bb.middle[n - 1] : null;
  const percentB = isNum(bbU) && isNum(bbL) && bbU !== bbL ? (close - bbL) / (bbU - bbL) : null;
  const atrV = n ? a[n - 1] : null;

  const levels = n >= WARMUP.levels
    ? supportResistance(bars, { k: PARAMS.srPivot, lookback: PARAMS.srLookback, tolerance: PARAMS.srTolerance })
    : { method: 'Insufficient history', support: [], resistance: [], lookbackBars: n };

  const insufficient = Object.entries(WARMUP).filter(([, need]) => n < need).map(([k]) => k);

  const trend = trendScore(close, s[20][n - 1] ?? null, s[50][n - 1] ?? null, s[200][n - 1] ?? null, s[50]);
  const momentum = momentumScore(rsiV, macdV, sigV);
  const risk = riskScore(vol, mdd);
  const composite = compositeScore(trend, momentum, risk);
  const sentiment = news ? sentimentScore(news, symbol) : { value: null, label: 'No news data', components: [] };

  const stop = isNum(atrV) ? close - PARAMS.stopAtrMultiple * atrV : null;

  return {
    version: ANALYSIS_VERSION,
    symbol, timeframe, adjustment, source,
    cutoff: lastBar ? lastBar.date : null,
    barsUsed: n,
    firstBarDate: bars[0]?.date ?? null,
    close,
    prevClose: n >= 2 ? bars[n - 2].c : null,
    changePct: n >= 2 && bars[n - 2].c > 0 ? (close / bars[n - 2].c - 1) * 100 : null,
    params: PARAMS,
    indicators: {
      rsi14: { value: rsiV, previous: rsiPrev, zone: rsiZone(rsiV), period: PARAMS.rsiPeriod },
      macd: {
        macd: macdV, signal: sigV, histogram: histV, state: ms.state, crossBarsAgo: ms.crossBarsAgo,
        label: MACD_STATE_LABEL[ms.state], params: [PARAMS.macdFast, PARAMS.macdSlow, PARAMS.macdSignal],
      },
      sma: Object.fromEntries(PARAMS.smaPeriods.map((p) => [p, n ? s[p][n - 1] : null])),
      ema: Object.fromEntries(PARAMS.emaPeriods.map((p) => [p, n ? e[p][n - 1] : null])),
      bollinger: { upper: bbU, middle: bbM, lower: bbL, percentB, widthPct: isNum(bb.width[n - 1]) ? bb.width[n - 1] * 100 : null },
      atr14: { value: atrV, pctOfClose: isNum(atrV) && close ? atrV / close * 100 : null },
      volume: { last: lastBar ? lastBar.v : null, avg20: volAvg, ratio: volRatio },
      volatility20: vol,
      drawdown120: mdd,
      returns: { d5: pctChange(closes, 5), d20: pctChange(closes, 20), d60: pctChange(closes, 60), d252: pctChange(closes, 252) },
      range: { high52w: n ? Math.max(...highs.slice(-252)) : null, low52w: n ? Math.min(...lows.slice(-252)) : null },
    },
    levels,
    stops: {
      atrStop: stop,
      method: `Close − ${PARAMS.stopAtrMultiple} × ATR(${PARAMS.atrPeriod}) — volatility-derived`,
    },
    scores: { trend, momentum, risk, composite, sentiment },
    quality: {
      insufficient,
      zeroVolumeBars: dataQuality.zeroVolumeBars ?? vols.filter((v) => v === 0).length,
      missingSessions: dataQuality.missingSessions ?? [],
      note: 'Scores are heuristics on a 0–100 scale, not probabilities.',
    },
  };
}

// ---------------- explanations (rule-based, from the same object) ----------------

const f2 = (v) => (isNum(v) ? v.toFixed(2) : '—');
const f1 = (v) => (isNum(v) ? v.toFixed(1) : '—');

/**
 * Each explanation cites the exact fields it is based on (`refs`) and the
 * displayed numbers are taken from the analysis object, so text can never
 * contradict the cards.
 */
export function explainAnalysis(an) {
  const out = [];
  const I = an.indicators;
  const push = (id, title, text, tone, refs) => out.push({ id, title, text, tone, refs });

  // RSI
  if (I.rsi14.zone === 'insufficient') {
    push('rsi', 'RSI(14)', `Needs at least ${WARMUP.rsi} daily bars; ${an.barsUsed} available.`, 'neutral', ['indicators.rsi14']);
  } else if (I.rsi14.zone === 'overbought') {
    push('rsi', 'RSI(14) overbought', `RSI(14) is ${f1(I.rsi14.value)}, at or above the ${PARAMS.rsiOverbought} overbought threshold. Price has risen sharply relative to recent declines; this describes the recent move, it does not time a reversal.`, 'caution', ['indicators.rsi14.value']);
  } else if (I.rsi14.zone === 'oversold') {
    push('rsi', 'RSI(14) oversold', `RSI(14) is ${f1(I.rsi14.value)}, at or below the ${PARAMS.rsiOversold} oversold threshold. Recent declines have dominated; oversold readings can persist in downtrends.`, 'caution', ['indicators.rsi14.value']);
  } else {
    push('rsi', 'RSI(14) neutral', `RSI(14) is ${f1(I.rsi14.value)}, between ${PARAMS.rsiOversold} and ${PARAMS.rsiOverbought}. No overbought or oversold condition.`, 'neutral', ['indicators.rsi14.value']);
  }

  // MACD
  const md = I.macd;
  if (md.state === 'insufficient') {
    push('macd', 'MACD (daily)', `Needs ${WARMUP.macdSignal} daily bars for the signal line; ${an.barsUsed} available.`, 'neutral', ['indicators.macd']);
  } else {
    const when = md.crossBarsAgo === 0 ? 'on the latest bar' : `${md.crossBarsAgo} bar${md.crossBarsAgo === 1 ? '' : 's'} ago`;
    const base = `Daily MACD(12,26,9) is ${f2(md.macd)} vs signal ${f2(md.signal)} (histogram ${f2(md.histogram)}).`;
    const text = {
      bullish_cross: `${base} MACD crossed above its signal ${when}.`,
      bearish_cross: `${base} MACD crossed below its signal ${when}.`,
      above_signal: `${base} MACD is above its signal line; no crossover in the last ${PARAMS.crossLookback} bars.`,
      below_signal: `${base} MACD is below its signal line; no crossover in the last ${PARAMS.crossLookback} bars.`,
      at_signal: `${base} MACD equals its signal line.`,
    }[md.state];
    const tone = md.state === 'bullish_cross' || md.state === 'above_signal' ? 'positive' : md.state === 'at_signal' ? 'neutral' : 'negative';
    push('macd', `MACD · ${md.label}`, text, tone, ['indicators.macd']);
  }

  // Trend
  const tr = an.scores.trend;
  if (isNum(tr.value)) {
    const met = tr.components.filter((c) => c.met === true).map((c) => c.label);
    const missed = tr.components.filter((c) => c.met === false).map((c) => c.label);
    push('trend', `Trend · ${tr.label} (${tr.value}/100)`,
      `Conditions met: ${met.join(', ') || 'none'}.${missed.length ? ` Not met: ${missed.join(', ')}.` : ''}${tr.partial ? ' Some conditions lack history (SMA200 needs 200 bars).' : ''}`,
      tr.label === 'Uptrend' ? 'positive' : tr.label === 'Downtrend' ? 'negative' : 'neutral', ['scores.trend']);
  }

  // Volume
  if (isNum(I.volume.ratio)) {
    const pct = (I.volume.ratio - 1) * 100;
    push('volume', 'Volume vs 20-day average',
      `Latest volume is ${pct >= 0 ? f1(pct) + '% above' : f1(-pct) + '% below'} the prior 20-bar average.`,
      'neutral', ['indicators.volume']);
  }

  // Levels
  const lv = an.levels;
  if (lv.resistance && lv.support) {
    const res = lv.resistance.length ? lv.resistance.map((x) => `$${f2(x.level)}`).join(', ') : null;
    const sup = lv.support.length ? lv.support.map((x) => `$${f2(x.level)}`).join(', ') : null;
    push('levels', 'Support & resistance',
      `${res ? `Resistance: ${res}.` : `No pivot resistance above $${f2(an.close)} in the last ${lv.lookbackBars} bars (price is at or near the window high).`} ${sup ? `Support: ${sup}.` : `No pivot support below $${f2(an.close)} in the window.`}`,
      'neutral', ['levels']);
  }

  // Risk
  const rk = an.scores.risk;
  if (isNum(rk.value)) {
    push('risk', `Risk · ${rk.label} (${rk.value}/100)`,
      `20-day annualised volatility ${f1(an.indicators.volatility20 * 100)}%; max drawdown over ${PARAMS.drawdownWindow} bars ${f1((an.indicators.drawdown120 ?? 0) * 100)}%.`,
      rk.label === 'High' ? 'caution' : 'neutral', ['scores.risk', 'indicators.volatility20', 'indicators.drawdown120']);
  }

  if (an.quality.insufficient.length) {
    push('quality', 'Limited history', `Not enough bars for: ${an.quality.insufficient.join(', ')}. Those values are shown as unavailable.`, 'neutral', ['quality.insufficient']);
  }
  return out;
}

/** Research-only exit scenario helper. All inputs explicit; nothing implied. */
export function riskReward({ entry, target, stop }) {
  if (![entry, target, stop].every(isNum) || entry <= 0) return null;
  const reward = target - entry;
  const risk = entry - stop;
  return {
    reward, risk,
    rewardPct: (reward / entry) * 100,
    riskPct: (risk / entry) * 100,
    ratio: risk > 0 ? reward / risk : null,
    valid: risk > 0 && reward > 0,
  };
}

/** Labelled scenario zones: technical levels vs illustrative percentages. */
export function exitScenarios(an) {
  const close = an.close;
  return {
    technical: {
      resistance: an.levels.resistance || [],
      support: an.levels.support || [],
      method: an.levels.method,
    },
    volatility: { stop: an.stops.atrStop, method: an.stops.method, atr: an.indicators.atr14.value },
    illustrative: isNum(close) ? [5, 10].map((p) => ({ pct: p, price: close * (1 + p / 100), method: `Close + ${p}% (illustrative, not a technical level)` })) : [],
  };
}
