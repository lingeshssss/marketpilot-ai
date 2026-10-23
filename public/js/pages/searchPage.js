import { html, mount, on } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { setTitle, errorState, emptyState, loadingState } from '../lib/ui.js';
import { session } from '../lib/session.js';
import { dataNotice } from './dashboard.js';

export default async function searchPage({ root, query, signal }) {
  const q = (query.q || '').trim();
  setTitle(q ? `Search “${q}”` : 'Search');
  if (session.caps?.marketData?.status !== 'configured') { mount(root, html`<div class="page"><div class="page-head"><h1>Search</h1></div>${dataNotice()}</div>`); return; }
  mount(root, html`<div class="page"><div class="page-head"><div><h1>Search</h1><p class="small muted">${q ? `Results for “${q}”` : 'Use the search field above.'}</p></div></div><div id="res" class="card flush">${q ? loadingState('Searching') : ''}</div></div>`);
  if (!q) return;
  const load = async () => {
    try {
      const r = await get(`/api/search?q=${encodeURIComponent(q)}`, { signal });
      mount(root.querySelector('#res'), r.results.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Symbol</th><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Exchange</th><th scope="col">Currency</th><th scope="col">Identifier</th></tr></thead><tbody>
        ${r.results.map((x) => html`<tr><td><a class="sym" href="/symbols/${x.symbol}" data-link>${x.symbol}</a></td><td>${x.name}</td><td>${x.type || '—'}</td><td>${x.exchange || '—'}</td><td>${x.currency || '—'}</td><td class="mono xs">${x.id || '—'}</td></tr>`)}</tbody></table></div>
        ${r.partial ? html`<p class="xs subtle" style="padding:12px 20px">Partial results from cache: ${r.reason}</p>` : ''}`
        : emptyState('No matches', `No supported US stock or ETF matches “${q}”. Try a ticker (e.g. SPY) or part of the company name.`));
    } catch (e) { if (e.name !== 'AbortError') mount(root.querySelector('#res'), errorState(e)); }
  };
  on(root, 'click', '[data-retry]', load);
  await load();
}
