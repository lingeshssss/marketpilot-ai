import { html, mount, $, on, extLink } from '../lib/dom.js';
import { get, withBudgetRetry } from '../lib/api.js';
import * as store from '../lib/store.js';
import { session } from '../lib/session.js';
import { I } from '../lib/icons.js';
import { changeView, priceView, provenance, errorState, emptyState, notice, setTitle, skeletonRows, fmtDate, fmtRelative, budgetWaitState } from '../lib/ui.js';
import { fmtMoney, fmtPct, fmtDateTime } from '/shared/format.js';

export function dataNotice() {
  const md = session.caps?.marketData;
  if (!md) return notice(html`<strong>Couldn’t reach the server configuration.</strong> ${session.configError?.message || ''} Reload the page to try again.`, 'err');
  if (md.status !== 'configured') {
    const why = { unconfigured: 'No market-data provider is configured on this server.', missing_credentials: 'The market-data API key is missing.', demo_blocked_in_production: 'Demo data is disabled in production.' }[md.status];
    return notice(html`<strong>Market data unavailable.</strong> ${why} Prices, charts and scans are hidden rather than simulated.`, 'warn');
  }
  if (md.demo) return notice(html`<strong>Demo mode.</strong> Prices are synthetic and deterministic for development; they are not real market data.`, 'warn');
  if (md.quoteTimeliness === 'eod') return notice(html`Quotes are <strong>end-of-day</strong> closes from Massive (plan: ${md.plan}). Changes compare regular-session closes.`);
  return '';
}

export default async function dashboard({ root, signal }) {
  setTitle('Dashboard');
  mount(root, html`<div class="page">
    <div class="page-head"><div><h1>Dashboard</h1><p class="muted small" id="dash-sub"></p></div></div>
    <div class="stack">
      ${dataNotice()}
      <section aria-labelledby="mkt-h"><h2 id="mkt-h" class="sr-only">Market overview</h2><div class="grid grid-4" id="proxies">${skeletonRows(2)}</div></section>
      <div class="split">
        <div class="stack">
          <section class="card" aria-labelledby="movers-h"><div class="card-head"><h2 id="movers-h">Movers in the scan universe</h2><a class="small" href="/scanner" data-link>Open scanner</a></div><div id="movers">${skeletonRows(4)}</div></section>
          <section class="card" aria-labelledby="news-h"><div class="card-head"><h2 id="news-h">Market news</h2><span class="xs subtle" id="news-meta"></span></div><div id="news">${skeletonRows(3)}</div></section>
          <section class="card" aria-labelledby="pf-h"><div class="card-head"><h2 id="pf-h">Portfolio</h2><a class="small" href="/portfolios" data-link>All portfolios</a></div><div id="pf"></div></section>
        </div>
        <div class="stack">
          <section class="card" aria-labelledby="wl-h"><div class="card-head"><h2 id="wl-h">Watchlist</h2><a class="small" href="/watchlists" data-link>Manage</a></div><div id="wl"></div></section>
          <section class="card" aria-labelledby="al-h"><div class="card-head"><h2 id="al-h">Recent alerts</h2><a class="small" href="/alerts" data-link>Alerts</a></div><div id="al"></div></section>
        </div>
      </div>
    </div></div>`);

  const loadOverview = async () => {
    const box = $('#proxies', root); const mv = $('#movers', root);
    if (session.caps?.marketData?.status !== 'configured') { mount(box, ''); mount(mv, emptyState('No market data', 'Configure a provider to see movers.')); return; }
    try {
      const o = await withBudgetRetry(() => get('/api/market/overview', { signal }), { signal, onWait: (s) => mount(box, budgetWaitState(s)) });
      store.ingestQuotes(Object.fromEntries(o.proxies.map((p) => [p.symbol, p.quote])));
      $('#dash-sub', root).textContent = `${o.state.label}${o.state.reason ? ` · ${o.state.reason}` : ''} · last session ${fmtDate(o.state.lastSessionDate)}`;
      const drawProxies = () => mount(box, o.proxies.map((p) => {
        const q = store.quote(p.symbol) || p.quote;
        return html`<a class="card" href="/symbols/${p.symbol}" data-link style="color:inherit;text-decoration:none">
          <div class="metric"><span class="metric-label">${p.label}</span><span class="metric-value">${priceView(q)}</span><span class="metric-sub">${changeView(q, { showAbs: true })}</span></div>
          <div style="margin-top:8px">${provenance(q)}</div></a>`;
      }));
      drawProxies();
      if (!o.movers) mount(mv, emptyState('Scan not ready', 'Movers appear after the first background scan completes.'));
      else {
        const row = (q) => html`<a class="list-row" href="/symbols/${q.symbol}" data-link><span class="sym" style="min-width:64px">${q.symbol}</span><span class="end"><span>${priceView(q)}</span>${changeView(q)}</span></a>`;
        mount(mv, html`<div class="grid grid-2"><div><h3 class="small muted">Gainers</h3><div class="list">${o.movers.gainers.length ? o.movers.gainers.map(row) : html`<p class="small muted">None</p>`}</div></div>
          <div><h3 class="small muted">Decliners</h3><div class="list">${o.movers.losers.length ? o.movers.losers.map(row) : html`<p class="small muted">None</p>`}</div></div></div>
          <p class="xs subtle" style="margin-top:12px">Universe: ${o.movers.universeSize} large-cap US stocks & ETFs (${o.movers.universe}) · session ${fmtDate(o.movers.asOf)}</p>`);
        store.ingestQuotes(Object.fromEntries([...o.movers.gainers, ...o.movers.losers].map((q) => [q.symbol, q])));
      }
    } catch (e) { if (e.name !== 'AbortError') { mount(box, errorState(e)); mount(mv, ''); } }
  };

  const loadPrivate = async () => {
    const wl = $('#wl', root), pf = $('#pf', root), al = $('#al', root);
    if (!session.user) {
      const cta = session.caps?.auth
        ? html`<a class="btn primary" href="/signin?next=/" data-link>Sign in</a>`
        : html`<p class="xs subtle">Accounts are unavailable on this server (database not configured).</p>`;
      for (const [el, what] of [[wl, 'watchlists'], [pf, 'portfolio'], [al, 'alerts']]) mount(el, emptyState('Sign in to see your ' + what, 'Your data is saved to your account and syncs across devices.', cta));
      return;
    }
    // Watchlist
    try {
      const { watchlists } = await get('/api/watchlists', { signal });
      if (!watchlists.length || !watchlists[0].items.length) mount(wl, emptyState('No symbols yet', 'Create a watchlist and add symbols from search.', html`<a class="btn" href="/watchlists" data-link>${I.plus} New watchlist</a>`));
      else {
        const list = watchlists[0];
        const syms = list.items.slice(0, 8).map((i) => i.symbol);
        const draw = () => mount(wl, html`<p class="small muted" style="margin-bottom:6px">${list.name}</p><div class="list">${syms.map((s) => {
          const q = store.quote(s);
          return html`<a class="list-row" href="/symbols/${s}" data-link><span class="sym">${s}</span><span class="end"><span>${priceView(q)}</span>${changeView(q)}</span></a>`;
        })}</div>`);
        draw();
        await store.load(syms);
        draw();
        const unsub = store.subscribe((ch) => { if (ch.some((s) => syms.includes(s))) draw(); });
        signal.addEventListener('abort', unsub);
      }
    } catch (e) { if (e.name !== 'AbortError') mount(wl, errorState(e)); }
    // Portfolio — same valuation endpoint used by the portfolio page
    try {
      const v = await get('/api/portfolios/summary', { signal });
      store.ingestQuotes(v.quotes);
      if (!v.transactionCount) mount(pf, emptyState('No holdings recorded', 'Record buys and sells to track a real portfolio.', html`<a class="btn" href="/portfolios" data-link>${I.plus} Add a portfolio</a>`));
      else {
        const t = v.totals;
        const dir = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : 'flat');
        mount(pf, html`<div class="grid grid-3">
          <div class="metric"><span class="metric-label">Total value</span><span class="metric-value">${fmtMoney(t.totalValue)}</span><span class="metric-sub muted">incl. cash ${fmtMoney(t.cash)}</span></div>
          <div class="metric"><span class="metric-label">Day P&amp;L</span><span class="metric-value ${dir(t.dailyPnl)}">${fmtMoney(t.dailyPnl, { signed: true })}</span><span class="metric-sub ${dir(t.dailyPnl)}">${fmtPct(t.dailyPnlPct)}</span></div>
          <div class="metric"><span class="metric-label">Unrealized</span><span class="metric-value ${dir(t.unrealized)}">${fmtMoney(t.unrealized, { signed: true })}</span><span class="metric-sub muted">${v.positions.length} positions</span></div></div>
          ${v.missingQuotes.length ? notice(html`Totals unavailable — no quote for ${v.missingQuotes.join(', ')}.`, 'warn') : ''}
          <p class="xs subtle" style="margin-top:12px">All actual (non-simulated) portfolios · valued ${fmtDateTime(v.valuedAt)} · average-cost method</p>`);
      }
    } catch (e) { if (e.name !== 'AbortError') mount(pf, errorState(e)); }
    // Alerts
    try {
      const { events } = await get('/api/alerts/events', { signal });
      mount(al, events.length ? html`<div class="list">${events.slice(0, 5).map((e) => html`<a class="list-row" href="/symbols/${e.symbol}" data-link><div><div class="small" style="font-weight:${e.read_at ? 400 : 650}">${e.message}</div><div class="xs subtle">${fmtRelative(e.created_at)}</div></div></a>`)}</div>`
        : emptyState('No alerts triggered', 'Create price or RSI alerts; they’re checked on the server even when this page is closed.', html`<a class="btn" href="/alerts" data-link>${I.bell} Create alert</a>`));
    } catch (e) { if (e.name !== 'AbortError') mount(al, errorState(e)); }
  };

  const loadNews = async () => {
    const box = $('#news', root);
    if (session.caps?.marketData?.status !== 'configured') { mount(box, emptyState('No news source', 'News appears once a market-data provider is configured.')); return; }
    try {
      const n = await withBudgetRetry(() => get('/api/market/news', { signal }), { signal, onWait: (s) => mount(box, budgetWaitState(s)) });
      $('#news-meta', root).textContent = `${n.source === 'massive' ? 'Massive' : n.source} · retrieved ${fmtRelative(n.retrievedAt)}${n.stale ? ' · stale' : ''}`;
      mount(box, n.articles.length ? html`<div class="list">${n.articles.slice(0, 6).map((a) => html`<article class="list-row" style="align-items:flex-start"><div style="min-width:0">
        <h3 class="small" style="font-weight:600">${extLink(a.url, a.title)}</h3>
        <p class="xs muted" style="margin-top:2px">${a.publisher} · ${fmtDateTime(a.publishedAt)}${a.tickers?.length ? ` · ${a.tickers.slice(0, 4).join(', ')}` : ''}</p></div></article>`)}</div>`
        : emptyState('No articles', n.source === 'demo' ? 'Demo mode never fabricates news.' : 'The provider returned no recent articles.'));
    } catch (e) { if (e.name !== 'AbortError') mount(box, errorState(e)); }
  };

  on(root, 'click', '[data-retry]', () => { loadOverview(); loadPrivate(); loadNews(); });
  await Promise.all([loadOverview(), loadPrivate(), loadNews()]);
}
