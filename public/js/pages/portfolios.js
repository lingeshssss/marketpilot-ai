import { html, mount, $, on } from '../lib/dom.js';
import { get, post, patch, del } from '../lib/api.js';
import * as store from '../lib/store.js';
import { session } from '../lib/session.js';
import { I } from '../lib/icons.js';
import { errorState, emptyState, notice, setTitle, loadingState, openDialog, toast, confirmDialog, fmtDate, fmtDateTime, provenance } from '../lib/ui.js';
import { fmtMoney, fmtPct, fmtPrice, fmtQty } from '/shared/format.js';
import { validateTransaction } from '/shared/portfolio.js';
import { valueChart } from '../components/chart.js';

const dir = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : 'flat');
const TYPES = { buy: 'Buy', sell: 'Sell', dividend: 'Dividend', deposit: 'Deposit', withdrawal: 'Withdrawal', split: 'Split', fee: 'Fee' };

function totalsCards(t, v) {
  return html`<div class="grid grid-4">
    <div class="card metric"><span class="metric-label">Total value</span><span class="metric-value">${fmtMoney(t.totalValue)}</span><span class="metric-sub muted">Holdings ${fmtMoney(t.marketValue)} · cash ${fmtMoney(t.cash)}</span></div>
    <div class="card metric"><span class="metric-label">Day P&amp;L</span><span class="metric-value ${dir(t.dailyPnl)}">${fmtMoney(t.dailyPnl, { signed: true })}</span><span class="metric-sub ${dir(t.dailyPnl)}">${fmtPct(t.dailyPnlPct)} vs previous close</span></div>
    <div class="card metric"><span class="metric-label">Unrealized P&amp;L</span><span class="metric-value ${dir(t.unrealized)}">${fmtMoney(t.unrealized, { signed: true })}</span><span class="metric-sub muted">Cost basis ${fmtMoney(t.costBasis)}</span></div>
    <div class="card metric"><span class="metric-label">Realized + dividends</span><span class="metric-value ${dir(t.realized + t.dividends)}">${fmtMoney(t.realized + t.dividends, { signed: true })}</span><span class="metric-sub muted">Fees ${fmtMoney(t.fees)} · net contributed ${fmtMoney(t.netContributions)}</span></div>
  </div>${v.missingQuotes?.length ? notice(html`Totals that depend on prices are unavailable: no current quote for ${v.missingQuotes.join(', ')}.`, 'warn') : ''}
  ${v.problems?.length ? notice(html`Transaction history has problems: ${v.problems.map((p) => `${p.date} ${p.symbol}: ${p.message}`).join('; ')}`, 'err') : ''}`;
}

export default async function portfoliosPage({ root, params, signal, navigate }) {
  setTitle('Portfolios');
  if (!session.user) {
    mount(root, html`<div class="page"><div class="page-head"><h1>Portfolios</h1></div>${emptyState('Sign in to track a portfolio', 'Record your actual buys, sells, dividends and cash; MarketPilot values them with the same quotes shown everywhere else.', session.caps?.auth ? html`<a class="btn primary" href="/signin?next=/portfolios" data-link>Sign in</a>` : '')}</div>`);
    return;
  }
  return params.id ? detail({ root, id: params.id, signal, navigate }) : overview({ root, signal, navigate });
}

async function overview({ root, signal, navigate }) {
  mount(root, html`<div class="page"><div class="page-head"><div><h1>Portfolios</h1><p class="small muted">Manually recorded holdings. No brokerage connection; no trading.</p></div>
    <button class="btn primary" type="button" data-new>${I.plus} New portfolio</button></div><div id="pf-body" class="stack">${loadingState()}</div></div>`);
  const load = async () => {
    const body = $('#pf-body', root);
    try {
      const [{ portfolios }, v] = await Promise.all([get('/api/portfolios', { signal }), get('/api/portfolios/summary', { signal })]);
      store.ingestQuotes(v.quotes);
      const actual = portfolios.filter((p) => p.kind === 'actual'); const sim = portfolios.filter((p) => p.kind === 'simulated');
      const row = (p) => html`<a class="list-row" href="/portfolios/${p.id}" data-link><div><div style="font-weight:600">${p.name}</div><div class="xs subtle">${p.transactions} transactions · created ${fmtDate(String(p.created_at).slice(0, 10))}</div></div><span class="end">${p.kind === 'simulated' ? html`<span class="chip warn">Simulated</span>` : ''}</span></a>`;
      mount(body, html`
        ${actual.length ? html`<section aria-labelledby="all-h" class="stack"><h2 id="all-h">All actual portfolios</h2>${totalsCards(v.totals, v)}<p class="xs subtle">Same valuation as the dashboard card · valued ${fmtDateTime(v.valuedAt)} · average-cost method · simulated portfolios excluded</p></section>` : ''}
        <section class="card" aria-labelledby="act-h"><h2 id="act-h" style="margin-bottom:8px">Actual holdings</h2>${actual.length ? html`<div class="list">${actual.map(row)}</div>` : emptyState('No portfolios yet', 'Create one and record your transactions, or import a CSV from your broker.', html`<button class="btn primary" type="button" data-new>${I.plus} New portfolio</button>`)}</section>
        ${sim.length ? html`<section class="card" aria-labelledby="sim-h"><h2 id="sim-h" style="margin-bottom:4px">Simulated</h2><p class="xs subtle" style="margin-bottom:8px">Hypothetical — never included in your actual totals.</p><div class="list">${sim.map(row)}</div></section>` : ''}`);
    } catch (e) { if (e.name !== 'AbortError') mount(body, errorState(e)); }
  };
  on(root, 'click', '[data-new]', () => {
    const dlg = openDialog({
      title: 'New portfolio',
      body: html`<div class="stack"><div class="field"><label for="pf-name">Name</label><input class="input" id="pf-name" maxlength="60" placeholder="e.g. Brokerage" /></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:560;margin-bottom:6px">Kind</legend>
        <label class="row small"><input type="radio" name="kind" value="actual" checked /> Actual — holdings I really own</label>
        <label class="row small"><input type="radio" name="kind" value="simulated" /> Simulated — hypothetical, kept separate</label></fieldset><div id="pf-err" class="small neg" role="alert"></div></div>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-ok>Create</button>`,
    });
    dlg.el.querySelector('[data-ok]').addEventListener('click', async () => {
      try {
        const r = await post('/api/portfolios', { name: dlg.el.querySelector('#pf-name').value, kind: dlg.el.querySelector('input[name="kind"]:checked').value });
        dlg.close(); navigate(`/portfolios/${r.portfolio.id}`);
      } catch (e) { dlg.el.querySelector('#pf-err').textContent = e.message; }
    });
  });
  on(root, 'click', '[data-retry]', load);
  await load();
}

async function detail({ root, id, signal, navigate }) {
  let data = null; let chart = null;
  mount(root, html`<div class="page" id="pf-page">${loadingState()}</div>`);
  const page = () => $('#pf-page', root);

  async function load() {
    try { data = await get(`/api/portfolios/${id}`, { signal }); } catch (e) { if (e.name !== 'AbortError') mount(page(), e.status === 404 ? emptyState('Portfolio not found', 'It may have been deleted or belong to another account.', html`<a class="btn" href="/portfolios" data-link>All portfolios</a>`) : errorState(e)); return; }
    store.ingestQuotes(data.valuation.quotes);
    draw(); loadPerf();
  }

  function draw() {
    const { portfolio: p, transactions: txns, valuation: v } = data;
    setTitle(`${p.name} · Portfolios`);
    const t = v.totals;
    const anyQ = Object.values(v.quotes || {})[0];
    mount(page(), html`
      <div class="page-head"><div><div class="row tight"><h1>${p.name}</h1>${p.kind === 'simulated' ? html`<span class="chip warn">Simulated</span>` : html`<span class="chip">Actual</span>`}</div>
        <p class="small muted"><a href="/portfolios" data-link>All portfolios</a> · ${txns.length} transactions · ${v.method}</p></div>
        <div class="row tight"><button class="btn primary" type="button" data-addtx>${I.plus} Transaction</button><button class="btn" type="button" data-import>${I.upload} Import CSV</button>
          <button class="btn ghost icon" type="button" data-rename aria-label="Rename portfolio">${I.edit}</button><button class="btn ghost icon" type="button" data-delpf aria-label="Delete portfolio">${I.trash}</button></div></div>
      <div class="stack">
        ${txns.length ? totalsCards(t, v) : ''}
        ${txns.length ? html`<section class="card flush" aria-labelledby="h-h"><div class="card-head pad"><h2 id="h-h">Holdings</h2><span>${anyQ ? provenance(anyQ) : ''}</span></div>
          ${v.positions.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Symbol</th><th class="r" scope="col">Quantity</th><th class="r" scope="col">Avg cost</th><th class="r" scope="col">Price</th><th class="r" scope="col">Value</th><th class="r" scope="col">Unrealized</th><th class="r" scope="col">Day P&amp;L</th><th class="r" scope="col">Weight</th></tr></thead><tbody>
            ${v.positions.map((r) => html`<tr><td><a class="sym" href="/symbols/${r.symbol}" data-link>${r.symbol}</a>${r.quoteStatus === 'stale' ? html` <span class="chip warn">Stale</span>` : ''}</td><td class="r">${fmtQty(r.quantity)}</td><td class="r">${fmtPrice(r.avgCost)}</td><td class="r">${fmtPrice(r.price)}</td><td class="r">${fmtMoney(r.marketValue)}</td>
              <td class="r ${dir(r.unrealized)}">${fmtMoney(r.unrealized, { signed: true })}<div class="xs">${fmtPct(r.unrealizedPct)}</div></td><td class="r ${dir(r.dailyPnl)}">${fmtMoney(r.dailyPnl, { signed: true })}</td><td class="r">${fmtPct(r.weight, { signed: false, dp: 1 })}</td></tr>`)}
          </tbody></table></div>
          <div style="padding:12px 20px 16px"><h3 class="small" style="margin-bottom:8px">Allocation</h3>${v.positions.map((r) => html`<div class="row" style="margin-bottom:6px"><span class="small" style="width:64px">${r.symbol}</span><div class="bar-track" style="flex:1" role="img" aria-label="${r.symbol} ${fmtPct(r.weight, { signed: false, dp: 1 })} of holdings"><div class="bar-fill" style="width:${r.weight ?? 0}%"></div></div><span class="xs num" style="width:52px;text-align:right">${fmtPct(r.weight, { signed: false, dp: 1 })}</span></div>`)}</div>`
          : html`<p class="small muted" style="padding:0 20px 16px">No open positions.</p>`}</section>
        <section class="card" aria-labelledby="perf-h"><div class="card-head"><h2 id="perf-h">Performance</h2><span id="twr" class="small"></span></div><div class="chart-box" id="perf-chart" role="img" aria-label="Portfolio value over time"></div>
          <div class="chart-legend"><span><i style="background:var(--chart-line)"></i>Portfolio value</span><span><i style="background:var(--chart-sma20)"></i>Net contributions (dashed)</span></div><p class="xs subtle" id="perf-note" style="margin-top:6px"></p></section>` : ''}
        <section class="card flush" aria-labelledby="tx-h"><div class="card-head pad"><h2 id="tx-h">Transactions</h2></div>
          ${txns.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Symbol</th><th class="r" scope="col">Qty / ratio</th><th class="r" scope="col">Price</th><th class="r" scope="col">Amount</th><th class="r" scope="col">Fees</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${[...txns].reverse().map((x) => html`<tr><td>${fmtDate(x.date)}</td><td>${TYPES[x.type]}${x.source === 'csv' ? html` <span class="xs subtle">CSV</span>` : ''}</td><td>${x.symbol || '—'}</td>
              <td class="r">${x.type === 'split' ? `${x.splitTo}:${x.splitFrom}` : x.quantity !== null ? fmtQty(x.quantity) : '—'}</td><td class="r">${x.price !== null ? fmtPrice(x.price) : '—'}</td>
              <td class="r">${x.type === 'buy' || x.type === 'sell' ? fmtMoney(x.quantity * x.price) : x.amount !== null ? fmtMoney(x.amount) : '—'}</td><td class="r">${x.fees ? fmtMoney(x.fees) : '—'}</td>
              <td class="r"><div class="row tight" style="justify-content:flex-end"><button class="btn sm icon ghost" type="button" data-edittx="${x.id}" aria-label="Edit ${TYPES[x.type]} on ${x.date}">${I.edit}</button><button class="btn sm icon ghost" type="button" data-deltx="${x.id}" aria-label="Delete ${TYPES[x.type]} on ${x.date}">${I.trash}</button></div></td></tr>`)}
          </tbody></table></div>` : emptyState('No transactions', 'Add your first buy, a cash deposit, or import a CSV.', html`<button class="btn primary" type="button" data-addtx>${I.plus} Add transaction</button>`)}</section>
        <details class="card"><summary style="cursor:pointer;font-weight:600">How these numbers are calculated</summary><ul class="small muted" style="margin-top:8px;padding-left:18px">
          <li>Average-cost basis; buy fees add to basis, sell fees reduce proceeds. Realized P&amp;L uses average cost (tax-lot methods like FIFO can differ).</li>
          <li>Splits multiply quantity and keep total basis. Dividends are cash income and do not change basis.</li>
          <li>Buys larger than recorded cash count as implicit contributions, so portfolios without deposits still reconcile.</li>
          <li>Day P&amp;L compares the current quote with the previous close for shares held at that close, plus today’s trades at their trade prices; fees excluded.</li>
          <li>Performance is a time-weighted return over daily split-adjusted closes, removing the effect of deposits and withdrawals. History is limited by the data plan.</li></ul></details>
      </div>`);
  }

  async function loadPerf() {
    const box = $('#perf-chart', root); if (!box) return;
    chart?.destroy(); chart = null;
    mount(box, loadingState('Computing performance'));
    try {
      const r = await get(`/api/portfolios/${id}/performance`, { signal });
      if (r.series.length < 5) { mount(box, emptyState('Not enough history yet', `Performance needs at least 5 priced trading days after the first transaction (${r.series.length} so far). Value and gains above are current, not historical returns.`)); return; }
      box.innerHTML = '';
      chart = valueChart(box, r.series);
      mount($('#twr', root), html`Time-weighted return <strong class="${dir(r.twr)}">${fmtPct(r.twr)}</strong>`);
      $('#perf-note', root).textContent = [r.note, r.truncated, r.missing.length ? `Missing price history: ${r.missing.map((m) => m.symbol).join(', ')}.` : '', r.carriedForward.length ? `${r.carriedForward.length} day(s) used the last known price.` : '', r.stale ? 'Some histories are stale.' : ''].filter(Boolean).join(' ');
    } catch (e) { if (e.name !== 'AbortError') mount(box, errorState(e, { retry: false })); }
  }

  function txDialog(existing = null) {
    const x = existing || { type: 'buy', date: new Date().toISOString().slice(0, 10), fees: 0 };
    const dlg = openDialog({
      title: existing ? 'Edit transaction' : 'Add transaction',
      body: html`<form class="stack" novalidate>
        <div class="segmented" role="radiogroup" aria-label="Type">${Object.entries(TYPES).map(([k, l]) => html`<button type="button" role="radio" aria-checked="${k === x.type}" aria-pressed="${k === x.type}" data-type="${k}">${l}</button>`)}</div>
        <div class="form-grid">
          <div class="field" data-f="date"><label for="tx-date">Date</label><input class="input" type="date" id="tx-date" name="date" value="${x.date}" max="${new Date().toISOString().slice(0, 10)}" /></div>
          <div class="field" data-f="symbol"><label for="tx-sym">Symbol</label><input class="input" id="tx-sym" name="symbol" value="${x.symbol || ''}" autocapitalize="characters" maxlength="10" /></div>
          <div class="field" data-f="quantity"><label for="tx-qty">Quantity</label><input class="input num" id="tx-qty" name="quantity" inputmode="decimal" value="${x.quantity ?? ''}" /><span class="hint">Fractional shares allowed</span></div>
          <div class="field" data-f="price"><label for="tx-px">Price per share</label><input class="input num" id="tx-px" name="price" inputmode="decimal" value="${x.price ?? ''}" /></div>
          <div class="field" data-f="fees"><label for="tx-fee">Fees</label><input class="input num" id="tx-fee" name="fees" inputmode="decimal" value="${x.fees ?? 0}" /></div>
          <div class="field" data-f="amount"><label for="tx-amt">Amount</label><input class="input num" id="tx-amt" name="amount" inputmode="decimal" value="${x.amount ?? ''}" /></div>
          <div class="field" data-f="split"><span class="label">Split ratio</span><div class="row tight"><input class="input num" aria-label="New shares" name="splitTo" inputmode="decimal" value="${x.splitTo ?? ''}" placeholder="4" style="width:80px" /><span>for</span><input class="input num" aria-label="Old shares" name="splitFrom" inputmode="decimal" value="${x.splitFrom ?? ''}" placeholder="1" style="width:80px" /></div></div>
        </div>
        <div class="field"><label for="tx-note">Note (optional)</label><input class="input" id="tx-note" name="note" maxlength="500" value="${x.note || ''}" /></div>
        <div id="tx-err" class="small neg" role="alert"></div></form>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-ok>${existing ? 'Save' : 'Add'}</button>`,
    });
    const f = dlg.el.querySelector('form');
    let type = x.type;
    const FIELDS = { buy: ['date', 'symbol', 'quantity', 'price', 'fees'], sell: ['date', 'symbol', 'quantity', 'price', 'fees'], dividend: ['date', 'symbol', 'amount'], deposit: ['date', 'amount'], withdrawal: ['date', 'amount'], fee: ['date', 'amount'], split: ['date', 'symbol', 'split'] };
    const sync = () => { for (const el of f.querySelectorAll('[data-f]')) el.hidden = !FIELDS[type].includes(el.dataset.f); for (const b of f.querySelectorAll('[data-type]')) { const on_ = b.dataset.type === type; b.setAttribute('aria-checked', on_); b.setAttribute('aria-pressed', on_); } };
    f.addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) { type = b.dataset.type; sync(); } });
    sync();
    dlg.el.querySelector('[data-ok]').addEventListener('click', async () => {
      const num = (n) => { const s = f[n]?.value?.replace(/[$,]/g, '').trim(); return s === '' || s === undefined ? undefined : Number(s); };
      const body = { type, date: f.date.value, symbol: f.symbol.value.trim().toUpperCase() || undefined, quantity: num('quantity'), price: num('price'), fees: num('fees') ?? 0, amount: num('amount'), splitFrom: num('splitFrom'), splitTo: num('splitTo'), note: f.note.value };
      for (const k of Object.keys(body)) if (!FIELDS[type].includes(k) && !['type', 'date', 'note', 'fees'].includes(k) && !(k.startsWith('split') && type === 'split')) delete body[k];
      if (type !== 'buy' && type !== 'sell') body.fees = 0;
      const errs = validateTransaction(body);
      if (errs.length) { f.querySelector('#tx-err').textContent = errs.join(' · '); return; }
      try {
        if (existing) await patch(`/api/portfolios/${id}/transactions/${existing.id}`, body); else await post(`/api/portfolios/${id}/transactions`, body);
        dlg.close(); toast(existing ? 'Transaction updated' : 'Transaction added'); load();
      } catch (e) { f.querySelector('#tx-err').textContent = e.message; }
    });
  }

  function importDialog() {
    let csv = ''; let header = [];
    const dlg = openDialog({
      title: 'Import transactions from CSV', wide: true,
      body: html`<div class="stack" id="imp">
        <p class="small muted">Step 1 — choose a file or paste CSV text. Columns can be in any order; you’ll map them next. Dates: YYYY-MM-DD or M/D/YYYY. Types: buy, sell, dividend, deposit, withdrawal, fee.</p>
        <input type="file" accept=".csv,text/csv" id="imp-file" class="input" style="padding:6px" aria-label="CSV file" />
        <label class="sr-only" for="imp-text">CSV text</label><textarea class="input" id="imp-text" placeholder="type,date,symbol,quantity,price,fees&#10;buy,2026-01-05,AAPL,10,190.25,1"></textarea>
        <div id="imp-step"></div><div id="imp-err" class="small neg" role="alert"></div></div>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn" type="button" data-next>Map columns</button><button class="btn primary" type="button" data-commit hidden>Import</button>`,
    });
    const el = dlg.el; let preview = null;
    el.querySelector('#imp-file').addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { if (file.size > 1_900_000) { el.querySelector('#imp-err').textContent = 'File is larger than 1.9 MB.'; return; } el.querySelector('#imp-text').value = await file.text(); } });
    const FIELDS = ['type', 'date', 'symbol', 'quantity', 'price', 'fees', 'amount'];
    el.querySelector('[data-next]').addEventListener('click', async () => {
      csv = el.querySelector('#imp-text').value;
      if (!csv.trim()) { el.querySelector('#imp-err').textContent = 'Add CSV content first.'; return; }
      if (!header.length) {
        try { header = (await post(`/api/portfolios/${id}/import/preview`, { csv })).header; } catch (e) { el.querySelector('#imp-err').textContent = e.message; return; }
        const guess = (f) => header.find((h) => h.toLowerCase().replace(/[^a-z]/g, '').startsWith(f === 'quantity' ? 'q' : f === 'fees' ? 'fee' : f)) || header.find((h) => ({ type: /action|side|transaction/i, quantity: /shares|qty/i, fees: /commission/i, symbol: /ticker/i }[f] || /^$/).test(h)) || '';
        mount(el.querySelector('#imp-step'), html`<h3 class="small">Step 2 — map columns</h3><div class="form-grid">${FIELDS.map((f) => html`<div class="field"><label for="map-${f}">${f}</label><select class="input" id="map-${f}" data-map="${f}"><option value="">— none —</option>${header.map((h) => html`<option ${guess(f) === h ? 'selected' : ''}>${h}</option>`)}</select></div>`)}</div>`);
        el.querySelector('[data-next]').textContent = 'Preview';
        return;
      }
      const mapping = Object.fromEntries([...el.querySelectorAll('[data-map]')].map((s) => [s.dataset.map, s.value]).filter(([, v]) => v));
      try { preview = await post(`/api/portfolios/${id}/import/preview`, { csv, mapping }); } catch (e) { el.querySelector('#imp-err').textContent = e.message; return; }
      const ok = preview.items.filter((i) => !i.errors.length && !i.duplicate);
      mount(el.querySelector('#imp-step'), html`<h3 class="small">Step 3 — review</h3>
        <p class="small">${ok.length} ready · ${preview.items.filter((i) => i.duplicate).length} duplicates skipped · ${preview.items.filter((i) => i.errors.length).length} with errors</p>
        ${preview.ledgerProblems?.length ? notice(html`Importing would create an invalid history: ${preview.ledgerProblems[0].date} ${preview.ledgerProblems[0].symbol} — ${preview.ledgerProblems[0].message}`, 'err') : ''}
        <div class="table-wrap" style="max-height:300px"><table class="data"><thead><tr><th scope="col">Line</th><th scope="col">Type</th><th scope="col">Date</th><th scope="col">Symbol</th><th class="r" scope="col">Qty</th><th class="r" scope="col">Price</th><th class="r" scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>
          ${preview.items.map((i) => html`<tr><td>${i.line}</td><td>${i.txn.type}</td><td>${i.txn.date || '—'}</td><td>${i.txn.symbol || ''}</td><td class="r">${i.txn.quantity ?? ''}</td><td class="r">${i.txn.price ?? ''}</td><td class="r">${i.txn.amount ?? ''}</td>
            <td>${i.errors.length ? html`<span class="chip neg" title="${i.errors.join('; ')}">${i.errors[0]}</span>` : i.duplicate ? html`<span class="chip">Duplicate (${i.duplicate})</span>` : html`<span class="chip pos">Ready</span>`}</td></tr>`)}</tbody></table></div>`);
      const btn = el.querySelector('[data-commit]'); btn.hidden = !ok.length || !!preview.ledgerProblems?.length; btn.textContent = `Import ${ok.length}`;
    });
    el.querySelector('[data-commit]').addEventListener('click', async () => {
      const txns = preview.items.filter((i) => !i.errors.length && !i.duplicate).map((i) => i.txn);
      try { const r = await post(`/api/portfolios/${id}/import/commit`, { transactions: txns }); dlg.close(); toast(`Imported ${r.inserted}${r.skippedDuplicates ? ` · ${r.skippedDuplicates} duplicates skipped` : ''}`); load(); }
      catch (e) { el.querySelector('#imp-err').textContent = e.message; }
    });
  }

  on(root, 'click', '[data-addtx]', () => txDialog());
  on(root, 'click', '[data-edittx]', (e, b) => txDialog(data.transactions.find((x) => x.id === b.dataset.edittx)));
  on(root, 'click', '[data-deltx]', async (e, b) => {
    if (!(await confirmDialog({ title: 'Delete transaction?', message: 'Positions and performance will be recalculated.', confirm: 'Delete', danger: true }))) return;
    try { await del(`/api/portfolios/${id}/transactions/${b.dataset.deltx}`); toast('Transaction deleted'); load(); } catch (err) { toast(err.message, { tone: 'error', timeout: 8000 }); }
  });
  on(root, 'click', '[data-import]', importDialog);
  on(root, 'click', '[data-rename]', () => {
    const dlg = openDialog({ title: 'Rename portfolio', body: html`<div class="field"><label for="rn">Name</label><input class="input" id="rn" value="${data.portfolio.name}" maxlength="60" /><div id="rn-err" class="small neg" role="alert"></div></div>`, footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-ok>Save</button>` });
    dlg.el.querySelector('[data-ok]').addEventListener('click', async () => { try { await patch(`/api/portfolios/${id}`, { name: dlg.el.querySelector('#rn').value }); dlg.close(); load(); } catch (e) { dlg.el.querySelector('#rn-err').textContent = e.message; } });
  });
  on(root, 'click', '[data-delpf]', async () => {
    if (await confirmDialog({ title: `Delete “${data.portfolio.name}”?`, message: `All ${data.transactions.length} transactions will be permanently deleted. Export your data from Settings first if you need a copy.`, confirm: 'Delete portfolio', danger: true })) {
      await del(`/api/portfolios/${id}`); toast('Portfolio deleted'); navigate('/portfolios');
    }
  });
  on(root, 'click', '[data-retry]', load);
  await load();
  return () => chart?.destroy();
}
