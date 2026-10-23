// ============================================================
// Deterministic technical indicators. Pure functions over number arrays.
//
// Conventions
//  * Input arrays are ordered oldest -> newest, one element per bar.
//  * Output arrays have the same length; positions inside the warm-up
//    window are `null` (never 0 and never a partial-window value).
//  * No rounding is done here — rounding is a display concern (format.js).
//
// Definitions
//  SMA(n)        arithmetic mean of last n closes. Warm-up: n bars.
//  EMA(n)        alpha = 2/(n+1), seeded with SMA(n) at bar n-1. Warm-up: n bars.
//  RSI(n)        Wilder smoothing (alpha = 1/n), seeded with the simple average
//                of the first n changes. Warm-up: n+1 bars.
//                avgLoss = 0 & avgGain > 0 -> 100; avgGain = 0 & avgLoss > 0 -> 0;
//                both 0 (flat prices) -> 50 (no directional information).
//  MACD(f,s,sig) MACD = EMA(f) - EMA(s); signal = EMA(sig) of MACD computed over
//                the defined MACD values; histogram = MACD - signal.
//                Warm-up: s + sig - 1 bars for the signal/histogram.
//  Bollinger     middle = SMA(n); bands = middle ± k * population std-dev of the
//                same n closes (as published by J. Bollinger). Warm-up: n bars.
//  ATR(n)        Wilder smoothing of True Range. Warm-up: n+1 bars.
// ============================================================

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  let avgG = gain / period, avgL = loss / period;
  const value = () => {
    if (avgL === 0 && avgG === 0) return 50;
    if (avgL === 0) return 100;
    if (avgG === 0) return 0;
    return 100 - 100 / (1 + avgG / avgL);
  };
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (ch > 0 ? ch : 0)) / period;
    avgL = (avgL * (period - 1) + (ch < 0 ? -ch : 0)) / period;
    out[i] = value();
  }
  return out;
}

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const line = closes.map((_, i) => (ef[i] !== null && es[i] !== null) ? ef[i] - es[i] : null);
  const firstIdx = line.findIndex((v) => v !== null);
  const sigLine = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const defined = line.slice(firstIdx);
    const s = ema(defined, signal);
    for (let j = 0; j < s.length; j++) sigLine[firstIdx + j] = s[j];
  }
  const hist = line.map((v, i) => (v !== null && sigLine[i] !== null) ? v - sigLine[i] : null);
  return { macd: line, signal: sigLine, histogram: hist };
}

export function bollinger(closes, period = 20, k = 2) {
  const mid = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  const width = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i];
    let ss = 0;
    for (let j = i - period + 1; j <= i; j++) ss += (closes[j] - m) ** 2;
    const sd = Math.sqrt(ss / period);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
    width[i] = m !== 0 ? (upper[i] - lower[i]) / m : null;
  }
  return { upper, middle: mid, lower, width };
}

export function trueRange(highs, lows, closes) {
  return highs.map((h, i) => {
    if (i === 0) return h - lows[i];
    return Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  });
}

export function atr(highs, lows, closes, period = 14) {
  const tr = trueRange(highs, lows, closes);
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let s = 0;
  for (let i = 1; i <= period; i++) s += tr[i];
  let prev = s / period;
  out[period] = prev;
  for (let i = period + 1; i < closes.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Annualised volatility of daily log returns over the trailing window. */
export function realizedVolatility(closes, window = 20, periodsPerYear = 252) {
  if (closes.length < window + 1) return null;
  const rets = [];
  for (let i = closes.length - window; i < closes.length; i++) {
    if (closes[i - 1] <= 0 || closes[i] <= 0) return null;
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

/** Maximum peak-to-trough decline (negative fraction) over the trailing window. */
export function maxDrawdown(closes, window = closes.length) {
  const start = Math.max(0, closes.length - window);
  let peak = -Infinity, mdd = 0;
  for (let i = start; i < closes.length; i++) {
    peak = Math.max(peak, closes[i]);
    if (peak > 0) mdd = Math.min(mdd, closes[i] / peak - 1);
  }
  return mdd;
}

export function last(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return arr[i];
  return null;
}

export function lastIndexDefined(arr) {
  for (let i = arr.length - 1; i >= 0; i--) if (isNum(arr[i])) return i;
  return -1;
}

/**
 * Pivot-based support/resistance.
 * A pivot high at i: high[i] is the strict maximum of highs[i-k .. i+k]
 * (ties resolved to the earliest bar). Pivot lows symmetric.
 * Pivots within `tolerance` (fraction of price) are clustered; a cluster's
 * level is the mean of its members and `touches` the member count.
 * Levels above the reference price are resistance, below are support.
 */
/** @param {import('./types.js').Bar[]} bars @param {{ k?: number, lookback?: number, tolerance?: number, max?: number, reference?: number }} [opts] */
export function supportResistance(bars, { k = 5, lookback = 120, tolerance = 0.015, max = 3, reference = undefined } = {}) {
  const slice = bars.slice(-lookback);
  const ref = reference ?? slice[slice.length - 1]?.c;
  const pivots = [];
  for (let i = k; i < slice.length - k; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (slice[j].h > slice[i].h || (j < i && slice[j].h === slice[i].h)) isHigh = false;
      if (slice[j].l < slice[i].l || (j < i && slice[j].l === slice[i].l)) isLow = false;
    }
    if (isHigh) pivots.push({ price: slice[i].h, date: slice[i].date, kind: 'high' });
    if (isLow) pivots.push({ price: slice[i].l, date: slice[i].date, kind: 'low' });
  }
  pivots.sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(p.price - c.level) / c.level <= tolerance) {
      c.members.push(p);
      c.level = c.members.reduce((a, m) => a + m.price, 0) / c.members.length;
    } else {
      clusters.push({ level: p.price, members: [p] });
    }
  }
  const shaped = clusters.map((c) => ({
    level: c.level,
    touches: c.members.length,
    lastTouched: c.members.map((m) => m.date).sort().pop(),
  }));
  const resistance = shaped.filter((c) => c.level > ref).sort((a, b) => a.level - b.level).slice(0, max);
  const support = shaped.filter((c) => c.level < ref).sort((a, b) => b.level - a.level).slice(0, max);
  return {
    method: `Pivot highs/lows (${k} bars each side) over the last ${slice.length} daily bars, clustered within ${(tolerance * 100).toFixed(1)}%`,
    reference: ref,
    lookbackBars: slice.length,
    support,
    resistance,
    windowHigh: slice.length ? Math.max(...slice.map((b) => b.h)) : null,
    windowLow: slice.length ? Math.min(...slice.map((b) => b.l)) : null,
  };
}
