// Price / indicator charts (lightweight-charts v5, Apache-2.0, vendored).
// Overlays are computed with the SAME shared indicator functions the server
// uses, over the same bars, so they align bar-for-bar with the analysis.

import { createChart, LineSeries, CandlestickSeries, HistogramSeries, CrosshairMode, LineStyle } from '/vendor/lightweight-charts.mjs';
import { sma, rsi, macd, bollinger } from '/shared/indicators.js';
import { fmtPrice, fmtCompact, fmtNumber, fmtPct } from '/shared/format.js';
import { EXCHANGE_TZ } from '/shared/calendar.js';
import { esc } from '../lib/dom.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function themeOptions() {
  return {
    layout: { background: { color: 'transparent' }, textColor: css('--chart-text'), fontFamily: css('--font'), fontSize: 12, attributionLogo: true, panes: { separatorColor: css('--border'), enableResize: false } },
    grid: { vertLines: { visible: false }, horzLines: { color: css('--chart-grid') } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, rightOffset: 2, minBarSpacing: 1 },
    crosshair: { mode: CrosshairMode.Magnet },
  };
}

const etTime = new Intl.DateTimeFormat('en-US', { timeZone: EXCHANGE_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const etDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
function timeLabel(t) {
  if (typeof t === 'string') return etDate.format(new Date(`${t}T00:00:00Z`));
  if (typeof t === 'object' && t.year) return etDate.format(new Date(Date.UTC(t.year, t.month - 1, t.day)));
  return `${etTime.format(new Date(t * 1000))} ET`;
}

function onThemeChange(fn) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const obs = new MutationObserver(fn);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mq.addEventListener('change', fn);
  return () => { obs.disconnect(); mq.removeEventListener('change', fn); };
}

/**
 * @param el container (.chart-box)
 * @param opts { bars, intraday, mode, overlays: Set('sma20','sma50','bb'), panes: Set('volume','rsi','macd') }
 */
export function priceChart(el, opts) {
  const { bars, intraday = false } = opts;
  const mode = opts.mode || 'line';
  const overlays = opts.overlays || new Set();
  const panes = opts.panes || new Set(['volume']);
  el.innerHTML = '';
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
  el.appendChild(tip);

  const chart = createChart(el, {
    ...themeOptions(), autoSize: true,
    localization: { timeFormatter: timeLabel, priceFormatter: (p) => fmtPrice(p, { symbol: false }) },
    timeScale: { ...themeOptions().timeScale, timeVisible: intraday, secondsVisible: false },
    handleScroll: { vertTouchDrag: false }, // let the page scroll vertically on phones
  });
  const time = (b) => (intraday ? Math.floor(b.t / 1000) : b.date);
  const closes = bars.map((b) => b.c);
  const series = {};

  if (mode === 'candle') {
    series.price = chart.addSeries(CandlestickSeries, {
      upColor: css('--pos'), downColor: css('--neg'), borderUpColor: css('--pos'), borderDownColor: css('--neg'),
      wickUpColor: css('--pos'), wickDownColor: css('--neg'), priceLineVisible: false,
    });
    series.price.setData(bars.map((b) => ({ time: time(b), open: b.o, high: b.h, low: b.l, close: b.c })));
  } else {
    series.price = chart.addSeries(LineSeries, { color: css('--chart-line'), lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 4 });
    series.price.setData(bars.map((b) => ({ time: time(b), value: b.c })));
  }

  const lineFrom = (arr, color, extra = {}) => {
    const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra });
    s.setData(arr.map((v, i) => (v === null ? { time: time(bars[i]) } : { time: time(bars[i]), value: v })));
    return s;
  };
  let s20 = null, s50 = null, bb = null;
  if (!intraday && overlays.has('sma20')) { s20 = sma(closes, 20); series.sma20 = lineFrom(s20, css('--chart-sma20')); }
  if (!intraday && overlays.has('sma50')) { s50 = sma(closes, 50); series.sma50 = lineFrom(s50, css('--chart-sma50')); }
  if (!intraday && overlays.has('bb')) {
    bb = bollinger(closes, 20, 2);
    series.bbU = lineFrom(bb.upper, css('--chart-bb'), { lineWidth: 1, lineStyle: LineStyle.Dashed });
    series.bbL = lineFrom(bb.lower, css('--chart-bb'), { lineWidth: 1, lineStyle: LineStyle.Dashed });
  }

  let paneIdx = 0;
  if (panes.has('volume')) {
    series.vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    series.vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const up = css('--pos'), down = css('--neg');
    series.vol.setData(bars.map((b, i) => ({ time: time(b), value: b.v, color: `${(i && b.c < bars[i - 1].c) ? down : up}55` })));
  }
  let r = null, m = null;
  if (!intraday && panes.has('rsi')) {
    paneIdx++;
    r = rsi(closes, 14);
    series.rsi = chart.addSeries(LineSeries, { color: css('--chart-sma50'), lineWidth: 2, priceLineVisible: false, lastValueVisible: true }, paneIdx);
    series.rsi.setData(r.map((v, i) => (v === null ? { time: time(bars[i]) } : { time: time(bars[i]), value: v })));
    for (const lvl of [70, 30]) series.rsi.createPriceLine({ price: lvl, color: css('--border-strong'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '' });
  }
  if (!intraday && panes.has('macd')) {
    paneIdx++;
    m = macd(closes);
    series.macdHist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIdx);
    series.macdHist.setData(m.histogram.map((v, i) => (v === null ? { time: time(bars[i]) } : { time: time(bars[i]), value: v, color: v >= 0 ? `${css('--pos')}88` : `${css('--neg')}88` })));
    series.macd = chart.addSeries(LineSeries, { color: css('--chart-line'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, paneIdx);
    series.macd.setData(m.macd.map((v, i) => (v === null ? { time: time(bars[i]) } : { time: time(bars[i]), value: v })));
    series.macdSig = chart.addSeries(LineSeries, { color: css('--chart-sma20'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, paneIdx);
    series.macdSig.setData(m.signal.map((v, i) => (v === null ? { time: time(bars[i]) } : { time: time(bars[i]), value: v })));
  }
  const panesApi = chart.panes?.() || [];
  panesApi.forEach((p, i) => { if (i > 0) p.setHeight?.(90); });

  chart.timeScale().fitContent();

  const byTime = new Map(bars.map((b, i) => [String(typeof time(b) === 'string' ? time(b) : time(b)), i]));
  chart.subscribeCrosshairMove((param) => {
    if (!param.time || !param.point || param.point.x < 0) { tip.hidden = true; return; }
    const key = typeof param.time === 'object' ? `${param.time.year}-${String(param.time.month).padStart(2, '0')}-${String(param.time.day).padStart(2, '0')}` : String(param.time);
    const i = byTime.get(key);
    if (i === undefined) { tip.hidden = true; return; }
    const b = bars[i];
    const rows = [
      `<strong>${esc(timeLabel(intraday ? Math.floor(b.t / 1000) : b.date))}</strong>`,
      `O ${fmtPrice(b.o)} H ${fmtPrice(b.h)} L ${fmtPrice(b.l)} C ${fmtPrice(b.c)}`,
      `Vol ${fmtCompact(b.v)}`,
    ];
    if (i > 0) rows.push(`Chg ${fmtPct((b.c / bars[i - 1].c - 1) * 100)}`);
    if (s20?.[i] != null) rows.push(`SMA20 ${fmtPrice(s20[i])}`);
    if (s50?.[i] != null) rows.push(`SMA50 ${fmtPrice(s50[i])}`);
    if (bb?.upper[i] != null) rows.push(`BB ${fmtPrice(bb.lower[i])} – ${fmtPrice(bb.upper[i])}`);
    if (r?.[i] != null) rows.push(`RSI ${fmtNumber(r[i], 1)}`);
    if (m?.macd[i] != null) rows.push(`MACD ${fmtNumber(m.macd[i], 2)} / ${m.signal[i] != null ? fmtNumber(m.signal[i], 2) : '—'}`);
    tip.innerHTML = rows.join('<br>');
    tip.hidden = false;
  });

  const unTheme = onThemeChange(() => {
    chart.applyOptions(themeOptions());
    series.price.applyOptions(mode === 'candle'
      ? { upColor: css('--pos'), downColor: css('--neg'), borderUpColor: css('--pos'), borderDownColor: css('--neg'), wickUpColor: css('--pos'), wickDownColor: css('--neg') }
      : { color: css('--chart-line') });
    series.sma20?.applyOptions({ color: css('--chart-sma20') });
    series.sma50?.applyOptions({ color: css('--chart-sma50') });
  });

  return { chart, destroy() { unTheme(); chart.remove(); } };
}

/**
 * Two series indexed to 100 on their first COMMON date (one axis, comparable
 * scale). Both are split-adjusted price returns; dividends are not included.
 */
export function alignIndexed(barsA, barsB) {
  const bMap = new Map(barsB.map((b) => [b.date, b.c]));
  const common = barsA.filter((b) => bMap.has(b.date));
  if (common.length < 2) return null;
  const a0 = common[0].c, b0 = bMap.get(common[0].date);
  return {
    start: common[0].date,
    a: common.map((b) => ({ time: b.date, value: (b.c / a0) * 100 })),
    b: common.map((b) => ({ time: b.date, value: (bMap.get(b.date) / b0) * 100 })),
  };
}

export function indexChart(el, aligned, { labelA, labelB }) {
  el.innerHTML = '';
  const chart = createChart(el, { ...themeOptions(), autoSize: true, localization: { timeFormatter: timeLabel, priceFormatter: (v) => fmtNumber(v, 1) } });
  const sa = chart.addSeries(LineSeries, { color: css('--chart-line'), lineWidth: 2, priceLineVisible: false, title: labelA });
  const sb = chart.addSeries(LineSeries, { color: css('--chart-bench'), lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, title: labelB });
  sa.setData(aligned.a); sb.setData(aligned.b);
  sa.createPriceLine({ price: 100, color: css('--border-strong'), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
  chart.timeScale().fitContent();
  const unTheme = onThemeChange(() => { chart.applyOptions(themeOptions()); sa.applyOptions({ color: css('--chart-line') }); sb.applyOptions({ color: css('--chart-bench') }); });
  return { destroy() { unTheme(); chart.remove(); } };
}

/** Portfolio value series (one series). */
export function valueChart(el, series) {
  el.innerHTML = '';
  const chart = createChart(el, { ...themeOptions(), autoSize: true, localization: { timeFormatter: timeLabel, priceFormatter: (v) => fmtPrice(v) } });
  const s = chart.addSeries(LineSeries, { color: css('--chart-line'), lineWidth: 2, priceLineVisible: false });
  s.setData(series.map((p) => ({ time: p.date, value: p.value })));
  const c = chart.addSeries(LineSeries, { color: css('--chart-sma20'), lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
  c.setData(series.map((p) => ({ time: p.date, value: p.netContributions })));
  chart.timeScale().fitContent();
  const unTheme = onThemeChange(() => { chart.applyOptions(themeOptions()); s.applyOptions({ color: css('--chart-line') }); c.applyOptions({ color: css('--chart-sma20') }); });
  return { destroy() { unTheme(); chart.remove(); } };
}
