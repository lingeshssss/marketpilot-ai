import { html, mount, $, $$, on } from '../lib/dom.js';
import { get, post, del } from '../lib/api.js';
import * as store from '../lib/store.js';
import { session } from '../lib/session.js';
import { I } from '../lib/icons.js';
import { errorState, emptyState, setTitle, loadingState, toast, fmtDate, fmtDateTime, changeView, openDialog, notice } from '../lib/ui.js';
import { fmtPrice, fmtNumber, fmtCompact, fmtPct } from '/shared/format.js';
import { SCREEN_FIELDS, SIGNAL_FILTERS } from '/shared/screen.js';
import { dataNotice } from './dashboard.js';
import { MACD_STATE_LABEL } from '/shared/analysis.js';

const PRESETS = {
  'Oversold large caps': { logic: 'AND', filters: [{ field: 'rsi14', op: 'lte', value: 35 }, { field: 'dollarVolume20', op: 'gte', value: 1e8 }] },
  'Uptrend + positive momentum': { logic: 'AND', filters: [{ field: 'trend', op: 'gte', value: 67 }, { field: 'momentum', op: 'gte', value: 60 }] },
  'Volume surge': { logic: 'AND', filters: [{ field: 'volumeRatio', op: 'gte', value: 1.5 }] },
  'Fresh MACD crosses': { logic: 'OR', filters: [{ signal: 'macd_bullish_cross' }, { signal: 'macd_bearish_cross' }] },
};

const COLS = [
  ['symbol', 'Symbol'], ['price', 'Price', 'r'], ['changePct', 'Day', 'r'], ['rsi14', 'RSI', 'r'], ['trend', 'Trend', 'r'], ['momentum', 'Mom.', 'r'],
  ['risk', 'Risk', 'r'], ['volatility20', 'Vol 20d', 'r'], ['return20', '20d', 'r'], ['volumeRatio', 'Vol ×', 'r'], ['dollarVolume20', 'Avg $ vol', 'r'], ['macdState', 'MACD'],
];
const hasCriteria = (d) => d.filters.length || d.sectors.length || d.types.length;

export default async function scannerPage({ root, query, signal }) {
  setTitle('Scanner');
  let def = { logic: 'AND', filters: [], sectors: [], types: [], sort: { field: 'symbol', dir: 'asc' }, page: 1, pageSize: 25 };
  try { if (query.screen) def = { ...def, ...JSON.parse(query.screen) }; } catch { /* ignore bad URL */ }
  let screens = []; let snapshot = null;

  if (session.caps?.marketData?.status !== 'configured') { mount(root, html`<div class="page"><div class="page-head"><h1>Scanner</h1></div>${dataNotice()}</div>`); return; }

  mount(root, html`<div class="page"><div class="page-head"><div><h1>Scanner</h1><p class="small muted" id="sc-sub">Precomputed from daily bars in the background.</p></div></div>
    <div class="split" style="grid-template-columns:320px minmax(0,1fr)">
      <aside class="card" aria-labelledby="flt-h" id="filters"></aside>
      <section class="card flush" aria-labelledby="res-h"><div class="card-head pad"><h2 id="res-h">Results</h2><span id="count" class="small muted" aria-live="polite"></span></div><div id="results">${loadingState()}</div></section>
    </div></div>`);

  function syncUrl() { const u = new URL(location.href); u.searchParams.set('screen', JSON.stringify(def)); history.replaceState(history.state, '', u); }

  function drawFilters() {
    const sectors = snapshot?.sectors || [];
    mount($('#filters', root), html`<div class="stack">
      <div class="row" style="justify-content:space-between"><h2 id="flt-h">Filters</h2><button class="btn sm ghost" type="button" data-reset>Reset</button></div>
      <div class="field"><label for="preset">Preset</label><select class="input" id="preset"><option value="">Choose…</option>${Object.keys(PRESETS).map((p) => html`<option>${p}</option>`)}</select></div>
      ${session.user ? html`<div class="field"><label for="saved">Saved screens</label><div class="row tight"><select class="input" id="saved" style="flex:1"><option value="">${screens.length ? 'Choose…' : 'None saved'}</option>${screens.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select><button class="btn sm icon ghost" type="button" data-delsaved aria-label="Delete saved screen">${I.trash}</button></div></div>` : ''}
      <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:560;margin-bottom:6px">Match</legend>
        <div class="segmented" role="radiogroup" aria-label="Combine conditions">${['AND', 'OR'].map((l) => html`<button type="button" role="radio" aria-checked="${def.logic === l}" aria-pressed="${def.logic === l}" data-logic="${l}">${l === 'AND' ? 'All conditions' : 'Any condition'}</button>`)}</div>
        <p class="xs subtle" style="margin-top:6px">Sector and type selections always narrow results; conditions below combine with ${def.logic}.</p></fieldset>
      <div class="stack" id="conds">${def.filters.map((f, i) => f.signal ? html`<div class="row tight"><span class="chip info" style="flex:1">${SIGNAL_FILTERS[f.signal]?.label}</span><button class="btn sm icon ghost" type="button" data-rmf="${i}" aria-label="Remove condition">${I.x}</button></div>`
        : html`<div class="row tight" role="group" aria-label="Condition ${i + 1}">
          <select class="input" data-ff="${i}" aria-label="Field" style="flex:2;min-height:34px">${Object.entries(SCREEN_FIELDS).map(([k, v]) => html`<option value="${k}" ${k === f.field ? 'selected' : ''}>${v.label}</option>`)}</select>
          <select class="input" data-fo="${i}" aria-label="Operator" style="width:64px;min-height:34px"><option value="gte" ${f.op === 'gte' ? 'selected' : ''}>≥</option><option value="lte" ${f.op === 'lte' ? 'selected' : ''}>≤</option><option value="between" ${f.op === 'between' ? 'selected' : ''}>↔</option></select>
          <input class="input num" data-fv="${i}" aria-label="Value" inputmode="decimal" value="${f.value}" style="width:76px;min-height:34px" />
          ${f.op === 'between' ? html`<input class="input num" data-fv2="${i}" aria-label="Upper value" inputmode="decimal" value="${f.value2 ?? ''}" style="width:76px;min-height:34px" />` : ''}
          <button class="btn sm icon ghost" type="button" data-rmf="${i}" aria-label="Remove condition">${I.x}</button></div>`)}</div>
      <div class="row tight"><button class="btn sm" type="button" data-addf>${I.plus} Numeric</button>
        <label class="sr-only" for="addsig">Add signal</label><select class="input" id="addsig" style="flex:1;min-height:32px"><option value="">+ Signal…</option>${Object.entries(SIGNAL_FILTERS).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select></div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:560;margin-bottom:6px">Type</legend><div class="row tight">${['Common Stock', 'ETF'].map((t) => html`<button class="btn sm" type="button" data-type="${t}" aria-pressed="${def.types.includes(t)}">${t === 'Common Stock' ? 'Stocks' : 'ETFs'}</button>`)}</div></fieldset>
      <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:560;margin-bottom:6px">Sector</legend><div class="row tight">${sectors.map((s) => html`<button class="btn sm" type="button" data-sector="${s}" aria-pressed="${def.sectors.includes(s)}">${s}</button>`)}</div></fieldset>
      ${session.user ? html`<button class="btn" type="button" data-save>Save screen…</button>` : ''}
    </div>`);
  }

  async function run() {
    syncUrl();
    const res = $('#results', root);
    try {
      const r = await get(`/api/scanner?screen=${encodeURIComponent(JSON.stringify(def))}`, { signal });
      const first = !snapshot; snapshot = r.snapshot;
      if (first) drawFilters();
      if (!r.snapshot) { mount(res, emptyState('No scan yet', r.message)); $('#count', root).textContent = ''; return; }
      const s = r.snapshot;
      $('#sc-sub', root).textContent = `Universe ${s.universeVersion}: ${s.coverage.computed} of ${s.coverage.universe} symbols covered · daily bars through ${fmtDate(s.asOf)} · computed ${fmtDateTime(s.computedAt)} · analysis ${s.analysisVersion}${s.coverage.partialHistory?.length ? ` · ${s.coverage.partialHistory.length} with partial history` : ''}`;
      const { rows, total, page, pages } = r.result;
      $('#count', root).textContent = `${total} match${total === 1 ? '' : 'es'}`;
      if (!rows.length) { mount(res, emptyState('No matches', def.filters.length ? `No symbol meets ${def.logic === 'AND' ? 'all' : 'any'} of your ${def.filters.length} condition(s) in this universe. Loosen a threshold or switch to “Any condition”.` : 'No symbols in the selected sectors/types.')); return; }
      const sortBtn = ([k, label, align]) => {
        const active = def.sort.field === k;
        return html`<th scope="col" class="${align || ''}" aria-sort="${active ? (def.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button class="sort" type="button" data-sort="${k}">${label}${active ? (def.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`;
      };
      const q = (row) => ({ price: row.price, change: null, changePct: row.changePct });
      const bf = s.backfill;
      const progress = bf && !bf.complete ? html`<div style="padding:0 20px 12px">${notice(html`<strong>Partial history:</strong> ${bf.storedSessions} of ${bf.targetSessions} daily sessions loaded. Indicators that need longer history (e.g. SMA 200) are blank until the background backfill finishes.`, 'warn')}</div>` : '';
      mount(res, html`${progress}<div class="table-wrap"><table class="data"><caption class="sr-only">Scanner results, page ${page} of ${pages}</caption><thead><tr>${COLS.map(sortBtn)}${hasCriteria(def) ? html`<th scope="col">Why it matched</th>` : ''}</tr></thead><tbody>
        ${rows.map((row) => html`<tr><td><a class="sym" href="/symbols/${row.symbol}" data-link>${row.symbol}</a><div class="sym-name">${row.name || row.sector}</div></td>
          <td class="r">${fmtPrice(row.price)}</td><td class="r">${changeView(q(row))}</td><td class="r">${fmtNumber(row.rsi14, 1)}</td>
          <td class="r">${row.trend ?? '—'}</td><td class="r">${row.momentum ?? '—'}</td><td class="r">${row.risk ?? '—'}</td>
          <td class="r">${row.volatility20 === null ? '—' : fmtPct(row.volatility20, { signed: false, dp: 1 })}</td><td class="r">${fmtPct(row.return20)}</td>
          <td class="r">${row.volumeRatio === null ? '—' : `${fmtNumber(row.volumeRatio, 2)}×`}</td><td class="r">${row.dollarVolume20 ? `$${fmtCompact(row.dollarVolume20)}` : '—'}</td>
          <td class="small">${MACD_STATE_LABEL[row.macdState] || '—'}</td>${hasCriteria(def) ? html`<td class="xs" style="min-width:220px">${row.matched.map((m) => html`<div>✓ ${m}</div>`)}</td>` : ''}</tr>`)}</tbody></table></div>
        <div class="row" style="padding:12px 20px;justify-content:space-between"><span class="xs subtle">Price & day change match the app-wide quote for session ${fmtDate(rows[0]?.quoteSessionDate)}. Scores are heuristics, not probabilities.</span>
          <div class="row tight"><button class="btn sm" type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button><span class="small">Page ${page} of ${pages}</span><button class="btn sm" type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button></div></div>`);
    } catch (e) { if (e.name !== 'AbortError') mount(res, errorState(e)); }
  }

  const changed = () => { def.page = 1; drawFilters(); run(); };
  let typing = null;
  on(root, 'click', '[data-logic]', (e, b) => { def.logic = b.dataset.logic; changed(); });
  on(root, 'click', '[data-addf]', () => { def.filters.push({ field: 'rsi14', op: 'lte', value: 30 }); changed(); });
  on(root, 'change', '#addsig', (e) => { if (e.target.value) { def.filters.push({ signal: e.target.value }); changed(); } });
  on(root, 'click', '[data-rmf]', (e, b) => { def.filters.splice(Number(b.dataset.rmf), 1); changed(); });
  on(root, 'change', '[data-ff]', (e, el) => { def.filters[el.dataset.ff].field = el.value; changed(); });
  on(root, 'change', '[data-fo]', (e, el) => { const f = def.filters[el.dataset.fo]; f.op = el.value; if (f.op === 'between' && f.value2 === undefined) f.value2 = f.value; changed(); });
  on(root, 'input', '[data-fv],[data-fv2]', (e, el) => {
    const i = el.dataset.fv ?? el.dataset.fv2; const v = Number(el.value);
    if (!Number.isFinite(v) || el.value.trim() === '') { el.setAttribute('aria-invalid', 'true'); return; }
    el.removeAttribute('aria-invalid');
    def.filters[i][el.dataset.fv !== undefined ? 'value' : 'value2'] = v; def.page = 1;
    clearTimeout(typing); typing = setTimeout(run, 300);
  });
  on(root, 'click', '[data-type]', (e, b) => { const t = b.dataset.type; def.types = def.types.includes(t) ? def.types.filter((x) => x !== t) : [...def.types, t]; changed(); });
  on(root, 'click', '[data-sector]', (e, b) => { const s = b.dataset.sector; def.sectors = def.sectors.includes(s) ? def.sectors.filter((x) => x !== s) : [...def.sectors, s]; changed(); });
  on(root, 'click', '[data-sort]', (e, b) => { const f = b.dataset.sort; def.sort = { field: f, dir: def.sort.field === f && def.sort.dir === 'desc' ? 'asc' : def.sort.field === f ? 'desc' : (f === 'symbol' ? 'asc' : 'desc') }; run(); });
  on(root, 'click', '[data-page]', (e, b) => { def.page = Number(b.dataset.page); run(); $('#res-h', root).scrollIntoView({ block: 'nearest' }); });
  on(root, 'click', '[data-reset]', () => { def = { logic: 'AND', filters: [], sectors: [], types: [], sort: { field: 'symbol', dir: 'asc' }, page: 1, pageSize: 25 }; changed(); });
  on(root, 'change', '#preset', (e) => { const p = PRESETS[e.target.value]; if (p) { def = { ...def, ...structuredClone(p) }; changed(); } });
  on(root, 'change', '#saved', (e) => { const s = screens.find((x) => x.id === e.target.value); if (s) { def = { ...def, ...s.definition, page: 1 }; drawFilters(); $('#saved', root).value = s.id; run(); } });
  on(root, 'click', '[data-delsaved]', async () => { const id = $('#saved', root)?.value; if (!id) return; await del(`/api/screens/${id}`); screens = screens.filter((s) => s.id !== id); toast('Saved screen deleted'); drawFilters(); });
  on(root, 'click', '[data-save]', () => {
    const dlg = openDialog({
      title: 'Save screen',
      body: html`<div class="field"><label for="scr-name">Name</label><input class="input" id="scr-name" maxlength="60" placeholder="e.g. Oversold tech" /><span class="hint">Saving with an existing name replaces it.</span><div id="scr-err" class="small neg" role="alert"></div></div>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-ok>Save</button>`,
    });
    dlg.el.querySelector('[data-ok]').addEventListener('click', async () => {
      try {
        const r = await post('/api/screens', { name: dlg.el.querySelector('#scr-name').value, definition: def });
        screens = [...screens.filter((s) => s.id !== r.screen.id), r.screen]; dlg.close(); toast('Screen saved'); drawFilters();
      } catch (err) { dlg.el.querySelector('#scr-err').textContent = err.message; }
    });
  });
  on(root, 'click', '[data-retry]', run);

  if (session.user) { try { screens = (await get('/api/screens', { signal })).screens; } catch { /* non-critical */ } }
  drawFilters();
  await run();
}
