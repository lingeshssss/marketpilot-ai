import { html, raw, mount, $, $$, on, extLink, esc } from '../lib/dom.js';
import { get, post, ApiError, withBudgetRetry } from '../lib/api.js';
import * as store from '../lib/store.js';
import { session } from '../lib/session.js';
import { I } from '../lib/icons.js';
import {
  changeView, priceView, provenance, errorState, emptyState, notice, setTitle, loadingState, openDialog, toast, fmtDate, fmtDateTime, fmtRelative, budgetWaitState,
} from '../lib/ui.js';
import { fmtPrice, fmtPct, fmtNumber, fmtCompact, fmtMoney } from '/shared/format.js';
import { riskReward, WARMUP } from '/shared/analysis.js';
import { ALERT_KINDS } from '/shared/alerts.js';
import { addDays } from '/shared/calendar.js';
import { priceChart, alignIndexed, indexChart } from '../components/chart.js';
import { dataNotice } from './dashboard.js';
import { alertForm } from './alerts.js';

const TABS = ['overview', 'analysis', 'scenarios', 'news', 'fundamentals', 'ai'];
const TAB_LABEL = { overview: 'Overview', analysis: 'Analysis', scenarios: 'Exit scenarios', news: 'News', fundamentals: 'Fundamentals', ai: 'AI explanation' };
const RANGES = [['1D', 'intraday', 1], ['5D', 'intraday', 5], ['1M', 'days', 22], ['3M', 'days', 66], ['6M', 'days', 130], ['YTD', 'ytd'], ['1Y', 'days', 252], ['2Y', 'all']];

const n2 = (v) => fmtNumber(v, 2);
const pctOrDash = (v) => (v === null || v === undefined ? '—' : fmtPct(v));

export default async function symbolPage({ root, params, query, signal, navigate }) {
  const symbol = params.symbol.toUpperCase();
  if (symbol !== params.symbol) { navigate(`/symbols/${symbol}${location.search}`, { replace: true }); return; }
  setTitle(symbol);
  let tab = TABS.includes(query.tab) ? query.tab : 'overview';
  const state = { range: query.range || '1Y', mode: session.prefs?.default_chart || 'line', overlays: new Set(['sma50']), panes: new Set(['volume']), compare: false, chart: null, cmp: null, daily: null, analysis: null, profile: null };

  if (session.caps?.marketData?.status !== 'configured') {
    mount(root, html`<div class="page"><div class="page-head"><h1>${symbol}</h1></div>${dataNotice()}</div>`);
    return;
  }

  mount(root, html`<div class="page">
    <div class="page-head" id="sym-head">${loadingState('Loading quote')}</div>
    <nav class="tabs" role="tablist" aria-label="${symbol} sections">${TABS.map((t) => html`<button role="tab" type="button" id="tab-${t}" aria-controls="panel" aria-selected="${t === tab}" tabindex="${t === tab ? 0 : -1}" data-tab="${t}">${TAB_LABEL[t]}</button>`)}</nav>
    <div id="panel" role="tabpanel" aria-labelledby="tab-${tab}" tabindex="0"></div>
  </div>`);

  // ---------- header ----------
  const drawHead = () => {
    const q = store.quote(symbol);
    const p = state.profile;
    mount($('#sym-head', root), html`<div style="min-width:0">
        <div class="row tight"><h1>${symbol}</h1>${p?.type ? html`<span class="chip">${p.type}</span>` : ''}${p?.exchange ? html`<span class="chip">${p.exchange}</span>` : ''}</div>
        <p class="muted" style="margin-top:2px">${p?.name || ''}</p>
        <div class="row" style="margin-top:10px;align-items:baseline">
          <span style="font-size:var(--t-3xl);font-weight:700;letter-spacing:-.03em" class="num">${priceView(q)}</span>
          <span style="font-size:var(--t-lg)">${changeView(q, { showAbs: true })}</span>
        </div>
        <div style="margin-top:6px">${q ? provenance(q, { long: true }) : ''}</div>
      </div>
      <div class="row tight">
        <button class="btn" type="button" data-act="watch">${I.plus} Watchlist</button>
        <button class="btn" type="button" data-act="alert">${I.bell} Alert</button>
        <button class="btn ghost icon" type="button" data-act="refresh" aria-label="Refresh data">${I.refresh}</button>
      </div>`);
  };

  // ---------- data loading ----------
  async function loadCore(force = false) {
    const [qr, an, prof] = await Promise.allSettled([
      store.load([symbol], { force }),
      withBudgetRetry(() => get(`/api/instruments/${symbol}/analysis`, { signal }), { signal }),
      state.profile ? Promise.resolve(null) : withBudgetRetry(() => get(`/api/instruments/${symbol}/fundamentals`, { signal }), { signal }),
    ]);
    if (an.status === 'fulfilled') state.analysis = an.value;
    else if (an.reason?.name !== 'AbortError') state.analysisError = an.reason;
    if (prof.status === 'fulfilled' && prof.value) { state.fund = prof.value; state.profile = prof.value.profile?.data || null; if (state.profile?.name) setTitle(`${symbol} · ${state.profile.name}`); }
    drawHead();
    if (!store.quote(symbol) && an.status === 'rejected') {
      const e = an.reason;
      mount($('#sym-head', root), e?.status === 404 ? emptyState(`${symbol} is not supported`, 'The configured provider has no data for this symbol. Check the ticker or search by company name.', html`<a class="btn" href="/search?q=${encodeURIComponent(symbol)}" data-link>Search</a>`) : errorState(e));
    }
  }

  // ---------- overview ----------
  async function drawOverview(panel) {
    mount(panel, html`<div class="split">
      <div class="stack">
        <section class="card" aria-labelledby="ch-h">
          <div class="card-head"><h2 id="ch-h">Price chart</h2>
            <div class="row tight">
              <div class="segmented" role="group" aria-label="Chart range">${RANGES.map(([r]) => html`<button type="button" data-range="${r}" aria-pressed="${r === state.range}">${r}</button>`)}</div>
              <div class="segmented" role="group" aria-label="Chart type"><button type="button" data-mode="line" aria-pressed="${state.mode === 'line'}">Line</button><button type="button" data-mode="candle" aria-pressed="${state.mode === 'candle'}">Candles</button></div>
            </div></div>
          <div class="row tight" style="margin-bottom:8px" role="group" aria-label="Indicators">
            ${[['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['bb', 'Bollinger 20,2']].map(([k, l]) => html`<button class="btn sm" type="button" data-ov="${k}" aria-pressed="${state.overlays.has(k)}">${l}</button>`)}
            ${[['volume', 'Volume'], ['rsi', 'RSI 14'], ['macd', 'MACD']].map(([k, l]) => html`<button class="btn sm" type="button" data-pane="${k}" aria-pressed="${state.panes.has(k)}">${l}</button>`)}
            <button class="btn sm" type="button" data-compare aria-pressed="${state.compare}">vs SPY</button>
            <span class="spacer"></span><button class="btn sm ghost" type="button" data-table>Data table</button>
          </div>
          <div class="chart-box" id="chart" role="img" aria-label="${symbol} price chart"></div>
          <div class="chart-legend" id="legend"></div>
          <div id="chart-note" class="xs subtle" style="margin-top:6px"></div>
          <div id="compare-box" hidden><hr class="divider"><h3 class="small">Indexed to 100 vs SPY</h3><div class="chart-box sm" id="cmp" role="img" aria-label="${symbol} versus SPY, indexed"></div><p class="xs subtle" id="cmp-note"></p></div>
        </section>
      </div>
      <div class="stack" id="ov-side"></div>
    </div>`);
    await drawChart();
    drawSide();
  }

  function rangeSlice(bars) {
    const r = RANGES.find((x) => x[0] === state.range);
    if (!r || r[1] === 'all') return bars;
    if (r[1] === 'ytd') { const y = bars.at(-1)?.date.slice(0, 4); return bars.filter((b) => b.date >= `${y}-01-01`); }
    return bars.slice(-r[2]);
  }

  async function drawChart() {
    const box = $('#chart', root); if (!box) return;
    state.chart?.destroy(); state.chart = null;
    const r = RANGES.find((x) => x[0] === state.range) || RANGES[6];
    mount(box, loadingState('Loading chart'));
    try {
      let bars, intraday = false, note = '';
      if (r[1] === 'intraday') {
        const h = await withBudgetRetry(() => get(`/api/instruments/${symbol}/history?intradayDays=${r[2]}`, { signal }), { signal, onWait: (n) => mount(box, budgetWaitState(n)) });
        bars = h.bars; intraday = true;
        note = `${h.minutes}-minute bars, ${fmtDate(h.from)}${h.from !== h.to ? ` – ${fmtDate(h.to)}` : ''}, including extended hours, exchange time (ET). Source ${h.source}${h.stale ? ' · stale' : ''}.`;
      } else {
        if (!state.daily) state.daily = await withBudgetRetry(() => get(`/api/instruments/${symbol}/history`, { signal }), { signal, onWait: (n) => mount(box, budgetWaitState(n)) });
        const d = state.daily;
        bars = rangeSlice(d.bars);
        note = `Daily bars through ${fmtDate(d.bars.at(-1)?.date)} · ${d.adjustment} · source ${d.source} · retrieved ${fmtRelative(d.retrievedAt)}${d.stale ? ' · stale (provider unavailable)' : ''}. Indicators use full history, then the view is trimmed.`;
        // compute overlays on the full series, then display the slice: pass full bars & let chart fit the range
        const full = d.bars;
        const startIdx = full.length - bars.length;
        bars = full; state.visibleFrom = full[startIdx]?.date;
      }
      if (!bars.length) { mount(box, emptyState('No bars', 'The provider returned no data for this range.')); return; }
      box.innerHTML = '';
      state.chart = priceChart(box, { bars, intraday, mode: state.mode, overlays: state.overlays, panes: state.panes });
      if (!intraday && state.visibleFrom) state.chart.chart.timeScale().setVisibleRange({ from: state.visibleFrom, to: bars.at(-1).date });
      state.chartBars = bars; state.chartIntraday = intraday;
      $('#chart-note', root).textContent = note;
      mount($('#legend', root), html`<span><i style="background:var(--chart-line)"></i>${symbol} ${state.mode === 'candle' ? '(candles)' : 'close'}</span>
        ${!intraday && state.overlays.has('sma20') ? html`<span><i style="background:var(--chart-sma20)"></i>SMA 20</span>` : ''}
        ${!intraday && state.overlays.has('sma50') ? html`<span><i style="background:var(--chart-sma50)"></i>SMA 50</span>` : ''}
        ${!intraday && state.overlays.has('bb') ? html`<span><i style="background:var(--chart-bb)"></i>Bollinger (20, 2σ)</span>` : ''}
        ${intraday && (state.overlays.size || state.panes.has('rsi') || state.panes.has('macd')) ? html`<span>Indicators are computed on daily bars and hidden on intraday views.</span>` : ''}`);
      await drawCompare();
    } catch (e) { if (e.name !== 'AbortError') mount(box, errorState(e)); }
  }

  async function drawCompare() {
    const wrap = $('#compare-box', root); if (!wrap) return;
    state.cmp?.destroy(); state.cmp = null;
    wrap.hidden = !state.compare;
    if (!state.compare || !state.daily) return;
    try {
      const spy = await withBudgetRetry(() => get('/api/instruments/SPY/history', { signal }), { signal, onWait: (n) => mount($('#cmp', root), budgetWaitState(n)) });
      const from = state.visibleFrom || state.daily.bars[0].date;
      const aligned = alignIndexed(state.daily.bars.filter((b) => b.date >= from), spy.bars.filter((b) => b.date >= from));
      if (!aligned) { mount($('#cmp', root), emptyState('No overlap', 'No common trading dates.')); return; }
      state.cmp = indexChart($('#cmp', root), aligned, { labelA: symbol, labelB: 'SPY' });
      const ra = aligned.a.at(-1).value - 100, rb = aligned.b.at(-1).value - 100;
      $('#cmp-note', root).textContent = `Since ${fmtDate(aligned.start)}: ${symbol} ${fmtPct(ra)} vs SPY ${fmtPct(rb)} (solid = ${symbol}, dashed = SPY). Both are split-adjusted price returns on common trading dates; dividends excluded.`;
    } catch (e) { if (e.name !== 'AbortError') mount($('#cmp', root), errorState(e, { retry: false })); }
  }

  function drawSide() {
    const side = $('#ov-side', root); if (!side) return;
    const a = state.analysis?.analysis; const q = store.quote(symbol); const p = state.profile;
    const I_ = a?.indicators;
    mount(side, html`
      <section class="card" aria-labelledby="ks-h"><h2 id="ks-h" style="margin-bottom:12px">Key statistics</h2>
        <dl class="kv">
          <div><dt>Open</dt><dd>${fmtPrice(q?.dayOpen)}</dd></div><div><dt>Day range</dt><dd>${q?.dayLow ? `${fmtPrice(q.dayLow)} – ${fmtPrice(q.dayHigh)}` : '—'}</dd></div>
          <div><dt>Prev close</dt><dd>${fmtPrice(q?.prevClose)}</dd></div><div><dt>Volume</dt><dd>${fmtCompact(q?.dayVolume)}</dd></div>
          <div><dt>52-wk range</dt><dd>${I_?.range.low52w ? `${fmtPrice(I_.range.low52w)} – ${fmtPrice(I_.range.high52w)}` : '—'}</dd></div>
          <div><dt>Market cap</dt><dd>${p?.marketCap ? `$${fmtCompact(p.marketCap)}` : '—'}</dd></div>
          <div><dt>RSI (14, daily)</dt><dd>${I_ ? fmtNumber(I_.rsi14.value, 1) : '—'}</dd></div>
          <div><dt>20-day return</dt><dd>${pctOrDash(I_?.returns.d20)}</dd></div>
        </dl>
        ${a && I_?.range.high52w && a.barsUsed < 252 ? html`<p class="xs subtle" style="margin-top:8px">52-week range uses ${a.barsUsed} available bars.</p>` : ''}
      </section>
      ${a ? html`<section class="card" aria-labelledby="sum-h"><div class="card-head"><h2 id="sum-h">Signal summary</h2><button class="btn sm ghost" type="button" data-tab-go="analysis">Details</button></div>
        <div class="stack">${['trend', 'momentum', 'risk'].map((k) => scoreBar(k, a.scores[k]))}</div>
        <p class="xs subtle" style="margin-top:12px">Heuristic 0–100 scores from daily bars through ${fmtDate(a.cutoff)} (analysis ${a.version}). Not probabilities or advice.</p></section>`
    : state.analysisError ? html`<section class="card">${errorState(state.analysisError, { retry: false, title: 'Analysis unavailable' })}</section>` : ''}`);
  }

  function scoreBar(key, s) {
    const label = { trend: 'Trend', momentum: 'Momentum', risk: 'Risk (volatility)' }[key];
    return html`<div><div class="row" style="justify-content:space-between"><span class="small" style="font-weight:560">${label}</span><span class="small num">${s.value ?? '—'}${s.value !== null ? '/100' : ''} · ${s.label}</span></div>
      <div class="bar-track" role="img" aria-label="${label} ${s.value ?? 'unavailable'} of 100"><div class="bar-fill" style="width:${s.value ?? 0}%"></div></div></div>`;
  }

  // ---------- analysis ----------
  function drawAnalysis(panel) {
    if (!state.analysis) { mount(panel, state.analysisError ? errorState(state.analysisError) : loadingState()); return; }
    const { analysis: a, explanations } = state.analysis;
    const I_ = a.indicators;
    const lv = a.levels;
    mount(panel, html`<div class="split"><div class="stack">
      <section class="card" aria-labelledby="ex-h"><div class="card-head"><h2 id="ex-h">What the indicators say</h2><span class="chip">Daily · cutoff ${fmtDate(a.cutoff)}</span></div>
        <div class="ev">${explanations.map((e) => html`<div class="ev-item ${e.tone}"><h4>${e.title}</h4><p>${e.text}</p></div>`)}</div>
        <p class="xs subtle" style="margin-top:12px">Each statement is generated from the values on this page (analysis ${a.version}, id ${a.id.slice(0, 10)}), so cards and text cannot disagree.</p></section>
      <section class="card" aria-labelledby="ind-h"><h2 id="ind-h" style="margin-bottom:12px">Indicator values</h2>
        <div class="table-wrap"><table class="data"><thead><tr><th scope="col">Indicator</th><th scope="col" class="r">Value</th><th scope="col">Definition</th></tr></thead><tbody>
          <tr><td>RSI (14)</td><td class="r">${fmtNumber(I_.rsi14.value, 1)}</td><td class="small muted">Wilder smoothing; ≥70 overbought, ≤30 oversold. Needs ${WARMUP.rsi} bars.</td></tr>
          <tr><td>MACD (12,26,9)</td><td class="r">${n2(I_.macd.macd)} / ${n2(I_.macd.signal)}</td><td class="small muted">${I_.macd.label}${I_.macd.crossBarsAgo !== null ? ` (${I_.macd.crossBarsAgo} bars ago)` : ''}; histogram ${n2(I_.macd.histogram)}. Needs ${WARMUP.macdSignal} bars.</td></tr>
          ${[20, 50, 200].map((p) => html`<tr><td>SMA ${p}</td><td class="r">${fmtPrice(I_.sma[p])}</td><td class="small muted">${I_.sma[p] === null ? `Needs ${p} bars` : a.close > I_.sma[p] ? 'Close above' : 'Close below'}</td></tr>`)}
          <tr><td>EMA 12 / 26</td><td class="r">${fmtPrice(I_.ema[12])} / ${fmtPrice(I_.ema[26])}</td><td class="small muted">α = 2/(n+1), SMA-seeded</td></tr>
          <tr><td>Bollinger (20, 2σ)</td><td class="r">${fmtPrice(I_.bollinger.lower)} – ${fmtPrice(I_.bollinger.upper)}</td><td class="small muted">%B ${I_.bollinger.percentB === null ? '—' : n2(I_.bollinger.percentB)} · width ${pctOrDash(I_.bollinger.widthPct)} (population σ)</td></tr>
          <tr><td>ATR (14)</td><td class="r">${fmtPrice(I_.atr14.value)}</td><td class="small muted">${pctOrDash(I_.atr14.pctOfClose)} of close</td></tr>
          <tr><td>Volume vs 20-day avg</td><td class="r">${I_.volume.ratio === null ? '—' : `${n2(I_.volume.ratio)}×`}</td><td class="small muted">Latest ${fmtCompact(I_.volume.last)} vs prior-20 avg ${fmtCompact(I_.volume.avg20)}</td></tr>
          <tr><td>Volatility (20d, ann.)</td><td class="r">${I_.volatility20 === null ? '—' : fmtPct(I_.volatility20 * 100, { signed: false })}</td><td class="small muted">σ of daily log returns × √252</td></tr>
          <tr><td>Max drawdown (120d)</td><td class="r">${I_.drawdown120 === null ? '—' : fmtPct(I_.drawdown120 * 100)}</td><td class="small muted">Peak-to-trough on closes</td></tr>
        </tbody></table></div></section>
    </div><div class="stack">
      <section class="card" aria-labelledby="lv-h"><h2 id="lv-h" style="margin-bottom:8px">Support & resistance</h2>
        <p class="xs subtle" style="margin-bottom:12px">${lv.method}</p>
        <div class="list">${(lv.resistance || []).slice().reverse().map((l, i) => html`<div class="list-row"><span class="chip neg">R${(lv.resistance.length - i)}</span><span class="num">${fmtPrice(l.level)}</span><span class="end xs subtle">${l.touches} touch${l.touches === 1 ? '' : 'es'} · ${fmtPct((l.level / a.close - 1) * 100)}</span></div>`)}
          <div class="list-row"><span class="chip">Close</span><span class="num" style="font-weight:650">${fmtPrice(a.close)}</span></div>
          ${(lv.support || []).map((l, i) => html`<div class="list-row"><span class="chip pos">S${i + 1}</span><span class="num">${fmtPrice(l.level)}</span><span class="end xs subtle">${l.touches} touch${l.touches === 1 ? '' : 'es'} · ${fmtPct((l.level / a.close - 1) * 100)}</span></div>`)}</div>
        ${!lv.resistance?.length ? html`<p class="small muted" style="margin-top:8px">No pivot resistance above the close in the lookback window.</p>` : ''}
      </section>
      <section class="card" aria-labelledby="sc-h"><h2 id="sc-h" style="margin-bottom:12px">Scores & formulas</h2>
        <div class="stack">${['trend', 'momentum', 'risk', 'composite'].map((k) => html`<details><summary class="small" style="cursor:pointer"><strong>${k[0].toUpperCase() + k.slice(1)}</strong> ${a.scores[k].value ?? '—'}${a.scores[k].value !== null ? '/100' : ''} · ${a.scores[k].label}</summary>
          <p class="xs muted" style="margin-top:6px">${a.scores[k].formula || ''}</p>
          ${(a.scores[k].components || []).length ? html`<ul class="xs muted" style="margin:6px 0 0;padding-left:18px">${a.scores[k].components.map((c) => html`<li>${c.label}${'met' in c ? `: ${c.met === null ? 'insufficient history' : c.met ? 'yes' : 'no'}` : c.value !== undefined ? `: ${fmtNumber(c.value, 1)}` : ''}</li>`)}</ul>` : ''}</details>`)}</div>
        <p class="xs subtle" style="margin-top:12px">${a.quality.note} ${a.quality.missingSessions?.length ? `${a.quality.missingSessions.length} expected sessions missing from provider data.` : ''}</p>
      </section></div></div>`);
  }

  // ---------- scenarios ----------
  function drawScenarios(panel) {
    if (!state.analysis) { mount(panel, state.analysisError ? errorState(state.analysisError) : loadingState()); return; }
    const { analysis: a, scenarios: s } = state.analysis;
    const res1 = s.technical.resistance[0]?.level ?? s.illustrative[0]?.price;
    const defaults = { entry: a.close, target: res1, stop: s.volatility.stop };
    mount(panel, html`<div class="stack">
      ${notice(html`Research scenarios, not instructions. Levels come from daily bars through ${fmtDate(a.cutoff)}; horizon ≈ swing (days to weeks). Nothing here predicts where the price will go.`)}
      <div class="grid grid-3">
        <section class="card"><h2 style="margin-bottom:6px">Technical levels</h2><p class="xs subtle" style="margin-bottom:10px">${s.technical.method}</p>
          <div class="list">${s.technical.resistance.length ? s.technical.resistance.map((l, i) => html`<div class="list-row"><span>Resistance ${i + 1}</span><span class="end num">${fmtPrice(l.level)}</span></div>`) : html`<p class="small muted">No pivot resistance above the close.</p>`}
          ${s.technical.support.map((l, i) => html`<div class="list-row"><span>Support ${i + 1}</span><span class="end num">${fmtPrice(l.level)}</span></div>`)}</div></section>
        <section class="card"><h2 style="margin-bottom:6px">Volatility stop</h2><p class="xs subtle" style="margin-bottom:10px">${s.volatility.method}</p>
          <div class="metric"><span class="metric-value">${fmtPrice(s.volatility.stop)}</span><span class="metric-sub muted">ATR(14) ${fmtPrice(s.volatility.atr)} · ${fmtPct((s.volatility.stop / a.close - 1) * 100)} from close</span></div></section>
        <section class="card"><h2 style="margin-bottom:6px">Illustrative targets</h2><p class="xs subtle" style="margin-bottom:10px">Fixed percentages above the close — <strong>not</strong> technical levels.</p>
          <div class="list">${s.illustrative.map((t) => html`<div class="list-row"><span>+${t.pct}%</span><span class="end num">${fmtPrice(t.price)}</span></div>`)}</div></section>
      </div>
      <section class="card" aria-labelledby="rr-h"><h2 id="rr-h" style="margin-bottom:12px">Hypothetical exit & risk/reward</h2>
        <form class="form-grid" id="rr-form" novalidate>
          <div class="field"><label for="rr-entry">Entry / cost basis</label><input class="input num" id="rr-entry" inputmode="decimal" value="${defaults.entry?.toFixed(2) ?? ''}" /></div>
          <div class="field"><label for="rr-target">Hypothetical exit</label><input class="input num" id="rr-target" inputmode="decimal" value="${defaults.target?.toFixed(2) ?? ''}" /><span class="hint">Default: resistance 1 (or +5% if none)</span></div>
          <div class="field"><label for="rr-stop">Hypothetical stop</label><input class="input num" id="rr-stop" inputmode="decimal" value="${defaults.stop?.toFixed(2) ?? ''}" /><span class="hint">Default: 2×ATR volatility stop</span></div>
        </form>
        <div id="rr-out" aria-live="polite" style="margin-top:16px"></div>
      </section></div>`);
    const out = $('#rr-out', root);
    const calc = () => {
      const v = (id) => Number($(`#${id}`, root).value.replace(/[$,]/g, ''));
      const r = riskReward({ entry: v('rr-entry'), target: v('rr-target'), stop: v('rr-stop') });
      if (!r) { mount(out, html`<p class="small muted">Enter three positive prices.</p>`); return; }
      mount(out, html`<div class="grid grid-3">
        <div class="metric"><span class="metric-label">Potential reward</span><span class="metric-value ${r.reward >= 0 ? 'pos' : 'neg'}">${fmtPct(r.rewardPct)}</span><span class="metric-sub">${fmtMoney(r.reward, { signed: true })} per share</span></div>
        <div class="metric"><span class="metric-label">Potential loss to stop</span><span class="metric-value neg">${fmtPct(-r.riskPct)}</span><span class="metric-sub">${fmtMoney(-r.risk, { signed: true })} per share</span></div>
        <div class="metric"><span class="metric-label">Reward : risk</span><span class="metric-value">${r.ratio === null ? '—' : `${fmtNumber(r.ratio, 2)} : 1`}</span><span class="metric-sub muted">${r.valid ? 'Arithmetic only — says nothing about likelihood' : 'Stop must be below entry and exit above entry'}</span></div></div>`);
    };
    $('#rr-form', root).addEventListener('input', calc);
    calc();
  }

  // ---------- news ----------
  async function drawNews(panel) {
    mount(panel, loadingState('Loading news'));
    try {
      const n = await withBudgetRetry(() => get(`/api/instruments/${symbol}/news`, { signal }), { signal, onWait: (s) => mount(panel, budgetWaitState(s)) });
      const s = n.sentiment;
      mount(panel, html`<div class="split"><section class="card flush" aria-labelledby="news-h"><div class="card-head pad"><h2 id="news-h">Recent news</h2><span class="xs subtle">Retrieved ${fmtDateTime(n.retrievedAt)}${n.stale ? ' · stale' : ''}</span></div>
        ${n.articles.length ? html`<div class="list" style="padding:0 12px 8px">${n.articles.map((a) => html`<article class="list-row" style="align-items:flex-start">
          <div style="min-width:0"><h3 class="small" style="font-weight:600">${extLink(a.url, a.title)}</h3>
          <p class="xs muted" style="margin-top:2px">${a.publisherUrl ? extLink(a.publisherUrl, a.publisher) : a.publisher} · ${fmtDateTime(a.publishedAt)}${a.author ? ` · ${a.author}` : ''}</p>
          ${a.description ? html`<p class="small muted" style="margin-top:4px">${a.description}</p>` : ''}</div>
          ${a.sentiment?.[symbol] ? html`<span class="chip ${a.sentiment[symbol] === 'positive' ? 'pos' : a.sentiment[symbol] === 'negative' ? 'neg' : ''}" title="${a.sentimentReasoning?.[symbol] || ''}">${a.sentiment[symbol]}</span>` : ''}</article>`)}</div>`
        : emptyState('No articles', n.source === 'demo' ? 'Demo mode never fabricates news.' : 'The provider returned no recent articles for this symbol.')}</section>
        <section class="card"><h2 style="margin-bottom:8px">News sentiment</h2>
          <div class="metric"><span class="metric-value">${s.value ?? '—'}${s.value !== null ? '/100' : ''}</span><span class="metric-sub muted">${s.label}</span></div>
          <p class="xs subtle" style="margin-top:8px">${s.formula || 'Needs at least 3 articles tagged by the provider.'} Counts: +${s.counts?.pos ?? 0} / −${s.counts?.neg ?? 0} / ${s.counts?.neu ?? 0} neutral. Tags come from ${n.articles[0]?.sentimentSource || 'the provider'}; MarketPilot does not score article text itself.</p></section></div>`);
    } catch (e) { if (e.name !== 'AbortError') mount(panel, errorState(e)); }
  }

  // ---------- fundamentals ----------
  async function drawFundamentals(panel) {
    if (!state.fund) { mount(panel, loadingState()); try { state.fund = await withBudgetRetry(() => get(`/api/instruments/${symbol}/fundamentals`, { signal }), { signal, onWait: (s) => mount(panel, budgetWaitState(s)) }); } catch (e) { if (e.name !== 'AbortError') mount(panel, errorState(e)); return; } }
    const f = state.fund; const p = f.profile.data;
    const unavailable = (x, what) => html`<p class="small muted">${what}: ${x.error?.message || 'unavailable'}</p>`;
    mount(panel, html`<div class="grid grid-2">
      <section class="card"><h2 style="margin-bottom:12px">Profile</h2>${p ? html`<dl class="kv">
        <div><dt>Name</dt><dd>${p.name}</dd></div><div><dt>Type</dt><dd>${p.type || '—'}</dd></div><div><dt>Exchange</dt><dd>${p.exchange || '—'}</dd></div>
        <div><dt>Market cap</dt><dd>${p.marketCap ? `$${fmtCompact(p.marketCap)}` : '—'}</dd></div><div><dt>Shares outstanding</dt><dd>${fmtCompact(p.sharesOutstanding)}</dd></div>
        <div><dt>Listed</dt><dd>${fmtDate(p.listDate)}</dd></div><div><dt>Industry (SIC)</dt><dd>${p.sic || '—'}</dd></div><div><dt>Employees</dt><dd>${p.employees ? fmtCompact(p.employees) : '—'}</dd></div>
        <div><dt>FIGI</dt><dd class="mono xs">${p.figi?.composite || p.id}</dd></div><div><dt>Website</dt><dd>${p.homepage ? extLink(p.homepage, new URL(p.homepage).hostname) : '—'}</dd></div></dl>
        ${p.description ? html`<p class="small muted" style="margin-top:12px">${p.description}</p>` : ''}
        <p class="xs subtle" style="margin-top:8px">Retrieved ${fmtDateTime(f.profile.retrievedAt)} from ${f.source}. Market cap = latest close × weighted shares outstanding.</p>` : unavailable(f.profile, 'Profile')}</section>
      <section class="card"><h2 style="margin-bottom:12px">Reported financials</h2>${f.statements.data?.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Period end</th><th scope="col">Filed</th><th class="r" scope="col">Revenue</th><th class="r" scope="col">Net income</th><th class="r" scope="col">EPS (dil.)</th></tr></thead><tbody>
        ${f.statements.data.map((r) => html`<tr><td>${fmtDate(r.periodEnd)} <span class="xs subtle">FY${r.fiscalYear} Q${r.fiscalQuarter}</span></td><td>${fmtDate(r.filingDate)}</td><td class="r">$${fmtCompact(r.revenue)}</td><td class="r">$${fmtCompact(r.netIncome)}</td><td class="r">${n2(r.epsDiluted)}</td></tr>`)}</tbody></table></div>` : unavailable(f.statements, 'Financial statements')}
        <hr class="divider"><h3 class="small" style="margin-bottom:6px">Earnings dates</h3>${unavailable(f.earnings, 'Earnings calendar')}</section>
      <section class="card"><h2 style="margin-bottom:12px">Dividends</h2>${f.dividends.data?.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Ex-date</th><th scope="col">Pay date</th><th class="r" scope="col">Amount</th><th scope="col">Type</th></tr></thead><tbody>
        ${f.dividends.data.slice(0, 12).map((d) => html`<tr><td>${fmtDate(d.exDate)}</td><td>${fmtDate(d.payDate)}</td><td class="r">${fmtPrice(d.amount)} ${d.currency !== 'USD' ? d.currency : ''}</td><td class="small">${d.type || '—'}</td></tr>`)}</tbody></table></div>` : f.dividends.data ? html`<p class="small muted">No dividends on record.</p>` : unavailable(f.dividends, 'Dividends')}</section>
      <section class="card"><h2 style="margin-bottom:12px">Splits</h2>${f.splits.data?.length ? html`<div class="list">${f.splits.data.map((s) => html`<div class="list-row"><span>${fmtDate(s.date)}</span><span class="end num">${s.to}-for-${s.from}</span></div>`)}</div>` : f.splits.data ? html`<p class="small muted">No splits on record.</p>` : unavailable(f.splits, 'Splits')}
        <p class="xs subtle" style="margin-top:8px">Price history on this page is split-adjusted by the provider.</p></section></div>`);
  }

  // ---------- AI ----------
  let aiCtrl = null;
  async function drawAI(panel) {
    const can = session.caps?.ai;
    mount(panel, html`<div class="split"><section class="card" aria-labelledby="ai-h"><div class="card-head"><h2 id="ai-h">Grounded AI explanation</h2>
        <div class="row tight"><button class="btn primary" type="button" data-ai-run ${!can || !session.user ? 'disabled' : ''}>${I.sparkle} Generate</button><button class="btn" type="button" data-ai-cancel hidden>Cancel</button></div></div>
      <p class="small muted">The model may only explain the validated metrics and cited articles shown on this page. Every number in its answer is checked against those inputs; answers that fail are discarded.</p>
      ${!can ? notice('AI explanations are not configured on this server (ANTHROPIC_API_KEY).', 'warn') : !session.user ? notice(html`<a href="/signin?next=${encodeURIComponent(location.pathname + '?tab=ai')}" data-link>Sign in</a> to generate explanations (they’re saved to your history).`) : ''}
      <div id="ai-status" role="status" aria-live="polite" style="margin-top:12px"></div><div id="ai-out"></div></section>
      <section class="card"><h2 style="margin-bottom:8px">Your history</h2><div id="ai-hist" class="small muted">${session.user ? 'Loading…' : 'Sign in to see history.'}</div></section></div>`);
    if (session.user) loadHistory();
  }
  async function loadHistory() {
    try {
      const { history } = await get(`/api/ai/history?symbol=${symbol}`, { signal });
      mount($('#ai-hist', root), history.length ? html`<div class="list">${history.map((h) => html`<button class="list-row btn ghost" style="justify-content:flex-start;border-radius:8px" type="button" data-ai-hist="${h.id}" ${h.status !== 'succeeded' ? 'disabled' : ''}>
        <span class="chip ${h.status === 'succeeded' ? 'pos' : 'neg'}">${h.status}</span><span class="xs">${fmtDateTime(h.created_at)}</span></button>`)}</div>` : 'No saved explanations yet.');
      state.aiHistory = history;
    } catch { /* ignore */ }
  }
  function renderAI(result) {
    const { output: o, meta: m } = result;
    const src = new Map(m.sources.map((s) => [s.id, s]));
    const refs = (it) => html`${(it.metricRefs || []).length ? html`<span class="xs subtle"> [${it.metricRefs.join(', ')}]</span>` : ''}${(it.sourceRefs || []).map((id) => { const s = src.get(id); return s ? html` <span class="xs">${extLink(s.url, `— ${s.publisher}`)}</span>` : ''; })}`;
    const sect = (title, items, help) => (items?.length ? html`<h3 class="small" style="margin-top:16px">${title}</h3><p class="xs subtle">${help}</p><ul class="small" style="margin:6px 0 0;padding-left:18px">${items.map((it) => html`<li style="margin-bottom:4px">${it.text}${refs(it)}</li>`)}</ul>` : '');
    const scen = (k, label) => { const s = o.scenarios[k]; return html`<div class="ev-item ${k === 'bull' ? 'positive' : k === 'bear' ? 'negative' : ''}"><h4>${label}</h4><p>${s.narrative}${refs(s)}</p>${s.assumptions.length ? html`<p class="xs" style="margin-top:4px">Assumes: ${s.assumptions.join('; ')}</p>` : ''}</div>`; };
    mount($('#ai-out', root), html`<div class="provenance" style="margin:8px 0">Data cutoff ${fmtDate(m.dataCutoff)} · generated ${fmtDateTime(m.generatedAt)}${result.cached ? ' (cached)' : ''} · ${m.model} · prompt ${m.promptVersion} · analysis ${m.analysisVersion}${m.inputsStale ? html` <span class="chip warn">Inputs stale</span>` : ''}</div>
      <p style="margin-top:8px">${o.summary}</p>
      ${sect('Observed facts', o.observations, 'Read directly from the data.')}
      ${sect('Calculations', o.calculations, 'How scores and levels were derived.')}
      ${sect('Interpretation', o.interpretation, 'The model’s reading — opinion, not fact.')}
      ${sect('From the news', o.newsClaims, 'Each claim links to its source article.')}
      <h3 class="small" style="margin-top:16px">Research scenarios</h3><div class="ev" style="margin-top:6px">${scen('bull', 'Bull case')}${scen('base', 'Base case')}${scen('bear', 'Bear case')}</div>
      ${sect('Evidence against', o.contradictoryEvidence, 'What cuts against the dominant reading.')}
      ${o.limitations.length ? html`<h3 class="small" style="margin-top:16px">Limitations</h3><ul class="small muted" style="margin:6px 0 0;padding-left:18px">${o.limitations.map((l) => html`<li>${l}</li>`)}</ul>` : ''}
      <p class="disclosure" style="margin-top:16px">AI-generated research summary. Not investment advice; no buy/sell instruction is implied.</p>`);
  }
  async function runAI() {
    aiCtrl?.abort(); aiCtrl = new AbortController();
    const status = $('#ai-status', root);
    $('[data-ai-run]', root).disabled = true; $('[data-ai-cancel]', root).hidden = false;
    mount($('#ai-out', root), '');
    const phases = ['Gathering validated metrics and articles…', 'Generating explanation…', 'Checking every number against the inputs…'];
    let i = 0; mount(status, html`<div class="row"><span class="spinner"></span><span class="small">${phases[0]}</span></div>`);
    const tick = setInterval(() => { i = Math.min(phases.length - 1, i + 1); mount(status, html`<div class="row"><span class="spinner"></span><span class="small">${phases[i]}</span></div>`); }, 4000);
    try {
      const r = await post('/api/ai/analyze', { symbol }, { signal: aiCtrl.signal });
      mount(status, html`<p class="small pos">Done.</p>`);
      renderAI(r); loadHistory();
    } catch (e) {
      if (e.name === 'AbortError') mount(status, html`<p class="small muted">Cancelled. Nothing was saved.</p>`);
      else mount(status, html`<div class="notice err" role="alert"><div><strong>${e.code === 'ai_output_rejected' ? 'Answer discarded' : 'Failed'}.</strong> ${e.message}${e.details?.errors ? html`<ul class="xs" style="margin:6px 0 0;padding-left:16px">${e.details.errors.slice(0, 4).map((x) => html`<li>${x}</li>`)}</ul>` : ''}</div></div>`);
    } finally {
      clearInterval(tick);
      const run = $('[data-ai-run]', root); if (run) run.disabled = false;
      const c = $('[data-ai-cancel]', root); if (c) c.hidden = true;
    }
  }

  // ---------- tabs ----------
  async function show(t, { push = false } = {}) {
    tab = t;
    for (const b of $$('[role="tab"]', root)) { const sel = b.dataset.tab === t; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; }
    const panel = $('#panel', root);
    panel.setAttribute('aria-labelledby', `tab-${t}`);
    const url = new URL(location.href);
    if (t === 'overview') url.searchParams.delete('tab'); else url.searchParams.set('tab', t);
    if (push) history.pushState({ noFocus: true }, '', url); else history.replaceState(history.state, '', url);
    state.chart?.destroy(); state.chart = null; state.cmp?.destroy(); state.cmp = null;
    if (t === 'overview') await drawOverview(panel);
    else if (t === 'analysis') drawAnalysis(panel);
    else if (t === 'scenarios') drawScenarios(panel);
    else if (t === 'news') await drawNews(panel);
    else if (t === 'fundamentals') await drawFundamentals(panel);
    else if (t === 'ai') await drawAI(panel);
  }

  on(root, 'click', '[role="tab"]', (e, b) => show(b.dataset.tab, { push: true }));
  on(root, 'keydown', '[role="tab"]', (e, b) => {
    const i = TABS.indexOf(b.dataset.tab);
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i - 1 + TABS.length) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS.at(-1) : null;
    if (next) { e.preventDefault(); $(`#tab-${next}`, root).focus(); show(next, { push: true }); }
  });
  on(root, 'click', '[data-tab-go]', (e, b) => show(b.dataset.tabGo, { push: true }));
  on(root, 'click', '[data-range]', (e, b) => { state.range = b.dataset.range; $$('[data-range]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); const u = new URL(location.href); u.searchParams.set('range', state.range); history.replaceState(history.state, '', u); drawChart(); });
  on(root, 'click', '[data-mode]', (e, b) => { state.mode = b.dataset.mode; $$('[data-mode]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawChart(); });
  on(root, 'click', '[data-ov]', (e, b) => { const k = b.dataset.ov; state.overlays.has(k) ? state.overlays.delete(k) : state.overlays.add(k); b.setAttribute('aria-pressed', String(state.overlays.has(k))); drawChart(); });
  on(root, 'click', '[data-pane]', (e, b) => { const k = b.dataset.pane; state.panes.has(k) ? state.panes.delete(k) : state.panes.add(k); b.setAttribute('aria-pressed', String(state.panes.has(k))); drawChart(); });
  on(root, 'click', '[data-compare]', (e, b) => { state.compare = !state.compare; b.setAttribute('aria-pressed', String(state.compare)); drawCompare(); });
  on(root, 'click', '[data-table]', () => {
    const bars = (state.chartBars || []).slice(-30).reverse();
    openDialog({ title: `${symbol} — last ${bars.length} bars`, wide: true, body: html`<div class="table-wrap"><table class="data"><caption class="sr-only">${symbol} OHLCV</caption><thead><tr><th scope="col">${state.chartIntraday ? 'Time (ET)' : 'Date'}</th><th class="r" scope="col">Open</th><th class="r" scope="col">High</th><th class="r" scope="col">Low</th><th class="r" scope="col">Close</th><th class="r" scope="col">Volume</th></tr></thead><tbody>
      ${bars.map((b) => html`<tr><td>${state.chartIntraday ? new Date(b.t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : fmtDate(b.date)}</td><td class="r">${fmtPrice(b.o)}</td><td class="r">${fmtPrice(b.h)}</td><td class="r">${fmtPrice(b.l)}</td><td class="r">${fmtPrice(b.c)}</td><td class="r">${fmtCompact(b.v)}</td></tr>`)}</tbody></table></div>` });
  });
  on(root, 'click', '[data-act]', async (e, b) => {
    const act = b.dataset.act;
    if (act === 'refresh') { state.daily = null; state.analysis = null; await loadCore(true); show(tab); return; }
    if (!session.user) { navigate(`/signin?next=${encodeURIComponent(location.pathname)}`); return; }
    if (act === 'watch') addToWatchlistDialog(symbol);
    if (act === 'alert') alertForm({ symbol, onSaved: () => toast('Alert created') });
  });
  on(root, 'click', '[data-ai-run]', runAI);
  on(root, 'click', '[data-ai-cancel]', () => aiCtrl?.abort());
  on(root, 'click', '[data-ai-hist]', (e, b) => { const h = state.aiHistory?.find((x) => x.id === b.dataset.aiHist); if (h?.output) renderAI({ output: h.output.output, meta: h.output.meta, cached: true }); });
  on(root, 'click', '[data-retry]', async () => { await loadCore(true); show(tab); });

  const unsub = store.subscribe((ch) => { if (ch.includes(symbol)) drawHead(); });
  await loadCore();
  await show(tab);
  return () => { unsub(); aiCtrl?.abort(); state.chart?.destroy(); state.cmp?.destroy(); };
}

export async function addToWatchlistDialog(symbol) {
  let lists;
  try { lists = (await get('/api/watchlists')).watchlists; } catch (e) { toast(e.message, { tone: 'error' }); return; }
  const dlg = openDialog({
    title: `Add ${symbol} to a watchlist`,
    body: html`<div class="stack">${lists.length ? html`<fieldset style="border:0;padding:0;margin:0"><legend class="small muted" style="margin-bottom:8px">Choose a list</legend>
      ${lists.map((l, i) => html`<label class="list-row" style="cursor:pointer"><input type="radio" name="wl" value="${l.id}" ${i === 0 ? 'checked' : ''}/> <span>${l.name}</span><span class="end xs subtle">${l.items.some((x) => x.symbol === symbol) ? 'Already added' : `${l.items.length} symbols`}</span></label>`)}</fieldset>` : ''}
      <div class="field"><label for="wl-new">${lists.length ? 'Or create a new list' : 'New list name'}</label><input class="input" id="wl-new" maxlength="60" placeholder="e.g. Semiconductors" /></div></div>`,
    footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-save>Add</button>`,
  });
  dlg.el.querySelector('[data-save]').addEventListener('click', async () => {
    try {
      const name = dlg.el.querySelector('#wl-new').value.trim();
      let id = dlg.el.querySelector('input[name="wl"]:checked')?.value;
      if (name) id = (await post('/api/watchlists', { name })).watchlist.id;
      if (!id) { toast('Enter a list name'); return; }
      const r = await post(`/api/watchlists/${id}/items`, { symbol });
      dlg.close();
      toast(r.duplicates.length ? `${symbol} is already in that list` : `Added ${symbol}`);
    } catch (e) { toast(e.message, { tone: 'error' }); }
  });
}
