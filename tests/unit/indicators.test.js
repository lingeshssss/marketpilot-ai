import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, atr, realizedVolatility, maxDrawdown, supportResistance } from '../../public/shared/indicators.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

// ---- Independent brute-force reference implementations ----
const refSma = (xs, n, i) => xs.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n;
function refEma(xs, n) {
  const out = []; const k = 2 / (n + 1);
  for (let i = 0; i < xs.length; i++) {
    if (i < n - 1) out.push(null);
    else if (i === n - 1) out.push(refSma(xs, n, i));
    else out.push(k * xs[i] + (1 - k) * out[i - 1]);
  }
  return out;
}

// StockCharts ChartSchool "Moving Averages" spreadsheet (10-day SMA/EMA), published rounded to 2dp.
// Tolerance ±0.011 covers the table's cent rounding; exactness is covered by the brute-force test below.
const SC_CLOSES = [22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29, 22.15, 22.39, 22.38, 22.61, 23.36, 24.05, 23.75, 23.83, 23.95, 23.63, 23.82, 23.87, 23.65, 23.19, 23.10, 23.33, 22.68, 23.10, 22.40, 22.17];
const SC_SMA10 = [22.22, 22.21, 22.23, 22.26, 22.31, 22.42, 22.61, 22.77, 22.91, 23.08, 23.21, 23.38, 23.53, 23.65, 23.71, 23.69, 23.61, 23.51, 23.43, 23.28, 23.13];
const SC_EMA10 = [22.22, 22.21, 22.24, 22.27, 22.33, 22.52, 22.80, 22.97, 23.13, 23.28, 23.34, 23.43, 23.51, 23.54, 23.47, 23.40, 23.39, 23.26, 23.23, 23.08, 22.92];

test('SMA(10) matches StockCharts reference table', () => {
  const s = sma(SC_CLOSES, 10);
  for (let i = 0; i < 9; i++) assert.equal(s[i], null, 'warm-up must be null');
  SC_SMA10.forEach((v, j) => close(s[9 + j], v, 0.011, `SMA idx ${9 + j}`));
});

test('EMA(10) matches StockCharts reference table (SMA-seeded)', () => {
  const e = ema(SC_CLOSES, 10);
  SC_EMA10.forEach((v, j) => close(e[9 + j], v, 0.011, `EMA idx ${9 + j}`));
});

// StockCharts ChartSchool RSI spreadsheet (Wilder, 14 periods). The spreadsheet rounds its
// intermediate average gain/loss to 2dp, which shifts early values by up to ~0.07 and decays
// over time. Tolerance 0.1 still rejects non-Wilder smoothing (which differs by several points).
const RSI_CLOSES = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13];
const RSI_EXPECTED = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.30, 33.08, 37.77];

test('RSI(14) matches StockCharts Wilder reference', () => {
  const r = rsi(RSI_CLOSES, 14);
  for (let i = 0; i < 14; i++) assert.equal(r[i], null);
  RSI_EXPECTED.forEach((v, j) => close(r[14 + j], v, 0.1, `RSI idx ${14 + j}`));
});

test('RSI edge cases: flat prices = 50, monotonic up = 100, down = 0, insufficient = all null', () => {
  assert.equal(rsi(Array(30).fill(10), 14).at(-1), 50);
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => 10 + i), 14).at(-1), 100);
  assert.equal(rsi(Array.from({ length: 30 }, (_, i) => 50 - i), 14).at(-1), 0);
  assert.ok(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 14).every((v) => v === null), '14 closes < 15 needed');
  assert.notEqual(rsi(Array.from({ length: 15 }, (_, i) => i + 1), 14)[14], null, 'exactly 15 closes is enough');
});

test('EMA/SMA equal brute-force reference on random walk; warm-up boundaries', () => {
  let p = 100; const xs = Array.from({ length: 300 }, (_, i) => (p += Math.sin(i * 1.7) * 2 + Math.cos(i * 0.3)));
  const e = ema(xs, 26), r = refEma(xs, 26), s = sma(xs, 50);
  for (let i = 0; i < xs.length; i++) {
    if (r[i] === null) assert.equal(e[i], null); else close(e[i], r[i], 1e-9, `ema ${i}`);
    if (i < 49) assert.equal(s[i], null); else close(s[i], refSma(xs, 50, i), 1e-9, `sma ${i}`);
  }
  assert.ok(sma([1, 2], 3).every((v) => v === null));
});

test('MACD = EMA12 − EMA26, signal = EMA9 of MACD, warm-up 34 bars for histogram', () => {
  let p = 50; const xs = Array.from({ length: 120 }, (_, i) => (p += Math.sin(i / 3)));
  const m = macd(xs);
  const e12 = refEma(xs, 12), e26 = refEma(xs, 26);
  const line = xs.map((_, i) => (e26[i] === null ? null : e12[i] - e26[i]));
  const sig = refEma(line.slice(25), 9);
  assert.equal(m.macd[24], null); close(m.macd[25], line[25], 1e-9, 'first macd');
  assert.equal(m.signal[32], null); assert.notEqual(m.signal[33], null, 'signal defined at bar 34 (index 33)');
  for (let i = 33; i < xs.length; i++) {
    close(m.signal[i], sig[i - 25], 1e-9, `sig ${i}`);
    close(m.histogram[i], m.macd[i] - m.signal[i], 1e-12, `hist ${i}`);
  }
});

test('Bollinger uses population SD; flat prices collapse bands to the mean', () => {
  const xs = [2, 4, 4, 4, 5, 5, 7, 9]; // population SD = 2, mean = 5
  const b = bollinger(xs, 8, 2);
  close(b.middle[7], 5, 1e-12, 'mid'); close(b.upper[7], 9, 1e-12, 'upper'); close(b.lower[7], 1, 1e-12, 'lower');
  const f = bollinger(Array(25).fill(7), 20, 2);
  assert.equal(f.upper[24], 7); assert.equal(f.lower[24], 7);
});

test('ATR uses Wilder smoothing of true range including gaps', () => {
  const h = [10, 11, 12, 15], l = [9, 10, 11, 14], c = [9.5, 10.5, 11.5, 14.5];
  const a = atr(h, l, c, 2);
  // TR: [1, max(1,1.5,0.5)=1.5, max(1,1.5,0.5)=1.5, max(1,3.5,2.5)=3.5]
  close(a[2], (1.5 + 1.5) / 2, 1e-12, 'seed');
  close(a[3], (1.5 * 1 + 3.5) / 2, 1e-12, 'wilder');
});

test('Volatility & drawdown', () => {
  assert.equal(realizedVolatility(Array(30).fill(10)), 0);
  assert.equal(realizedVolatility([1, 2, 3], 20), null);
  close(maxDrawdown([100, 120, 90, 130, 117]), -0.25, 1e-12, 'mdd');
});

test('Support/resistance: pivots, clustering, and no resistance at window high', () => {
  const mk = (closes) => closes.map((c, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, o: c, h: c + 0.5, l: c - 0.5, c, v: 1 }));
  // peak at 20 (idx 6), trough at 10 (idx 13), then up to 15
  const closes = [12, 13, 14, 15, 16, 18, 20, 18, 16, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 15, 15];
  const sr = supportResistance(mk(closes), { k: 3, lookback: 120 });
  assert.equal(sr.resistance[0].level, 20.5);
  assert.equal(sr.support[0].level, 9.5);
  const rising = supportResistance(mk(Array.from({ length: 30 }, (_, i) => 10 + i)), { k: 3 });
  assert.equal(rising.resistance.length, 0, 'monotonic rise has no resistance above');
});
