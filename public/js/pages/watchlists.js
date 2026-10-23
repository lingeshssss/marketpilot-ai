import { html, mount, $, on } from '../lib/dom.js';
import { get, post, patch, put, del } from '../lib/api.js';
import * as store from '../lib/store.js';
import { session } from '../lib/session.js';
import { I } from '../lib/icons.js';
import { changeView, priceView, errorState, emptyState, setTitle, loadingState, openDialog, toast, confirmDialog, provenance, statusChip } from '../lib/ui.js';

const SORTS = { custom: 'Custom order', symbol: 'Symbol', change: 'Day change', price: 'Price' };

export default async function watchlistsPage({ root, params, signal, navigate }) {
  setTitle('Watchlists');
  if (!session.user) {
    mount(root, html`<div class="page"><div class="page-head"><h1>Watchlists</h1></div>${emptyState('Sign in to use watchlists', 'Lists are saved to your account and available on every device.', session.caps?.auth ? html`<a class="btn primary" href="/signin?next=/watchlists" data-link>Sign in</a>` : html`<p class="xs subtle">Accounts are unavailable on this server.</p>`)}</div>`);
    return;
  }
  let lists = []; let sort = 'custom'; let unsub = null;
  mount(root, html`<div class="page"><div class="page-head"><div><h1>Watchlists</h1><p class="small muted">Saved to your account.</p></div>
    <button class="btn primary" type="button" data-newlist>${I.plus} New list</button></div><div id="wl-body">${loadingState()}</div></div>`);

  const current = () => lists.find((l) => l.id === params.id) || lists[0];

  async function load() {
    try { lists = (await get('/api/watchlists', { signal })).watchlists; } catch (e) { if (e.name !== 'AbortError') mount($('#wl-body', root), errorState(e)); return; }
    if (params.id && !lists.some((l) => l.id === params.id)) { mount($('#wl-body', root), emptyState('Watchlist not found', 'It may have been deleted, or it belongs to another account.', html`<a class="btn" href="/watchlists" data-link>All watchlists</a>`)); return; }
    draw();
    const cur = current();
    if (cur?.items.length) { await store.load(cur.items.map((i) => i.symbol)); draw(); }
  }

  function sortedItems(l) {
    const items = [...l.items];
    const q = (s) => store.quote(s);
    if (sort === 'symbol') items.sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (sort === 'change') items.sort((a, b) => (q(b.symbol)?.changePct ?? -Infinity) - (q(a.symbol)?.changePct ?? -Infinity));
    if (sort === 'price') items.sort((a, b) => (q(b.symbol)?.price ?? -Infinity) - (q(a.symbol)?.price ?? -Infinity));
    return items;
  }

  function draw() {
    const body = $('#wl-body', root);
    if (!lists.length) { mount(body, emptyState('No watchlists yet', 'Create a list, then add symbols from search or a symbol page.', html`<button class="btn primary" type="button" data-newlist>${I.plus} Create your first list</button>`)); return; }
    const l = current();
    setTitle(`${l.name} · Watchlists`);
    const items = sortedItems(l);
    const anyQ = items.map((i) => store.quote(i.symbol)).find(Boolean);
    mount(body, html`<div class="stack">
      <nav class="tabs" aria-label="Watchlists">${lists.map((x) => html`<a href="/watchlists/${x.id}" data-link aria-current="${x.id === l.id ? 'page' : 'false'}">${x.name} <span class="subtle">${x.items.length}</span></a>`)}</nav>
      <section class="card flush" aria-labelledby="wl-name">
        <div class="card-head pad"><h2 id="wl-name">${l.name}</h2>
          <div class="row tight">
            <label class="sr-only" for="wl-sort">Sort by</label><select class="input" id="wl-sort" style="width:auto;min-height:32px">${Object.entries(SORTS).map(([k, v]) => html`<option value="${k}" ${k === sort ? 'selected' : ''}>${v}</option>`)}</select>
            <button class="btn sm" type="button" data-add>${I.plus} Add symbols</button>
            <button class="btn sm ghost icon" type="button" data-rename aria-label="Rename list">${I.edit}</button>
            <a class="btn sm ghost icon" href="/api/watchlists/${l.id}/export" download aria-label="Export CSV">${I.download}</a>
            <button class="btn sm ghost icon" type="button" data-dellist aria-label="Delete list">${I.trash}</button></div></div>
        ${items.length ? html`<div class="list" style="padding:0 12px 8px">${items.map((it, idx) => {
          const q = store.quote(it.symbol);
          return html`<div class="list-row" data-item="${it.id}">
            ${sort === 'custom' ? html`<div class="row tight" style="flex-direction:column;gap:0"><button class="btn sm ghost icon" type="button" data-move="-1" data-id="${it.id}" aria-label="Move ${it.symbol} up" ${idx === 0 ? 'disabled' : ''}>${I.chevUp}</button><button class="btn sm ghost icon" type="button" data-move="1" data-id="${it.id}" aria-label="Move ${it.symbol} down" ${idx === items.length - 1 ? 'disabled' : ''}>${I.chevDown}</button></div>` : ''}
            <div style="min-width:0;flex:1"><a class="sym" href="/symbols/${it.symbol}" data-link>${it.symbol}</a> ${statusChip(q)}
              <button class="btn ghost sm" type="button" data-note="${it.id}" style="display:block;min-height:24px;padding:0;text-align:left;font-weight:400;white-space:normal" aria-label="Edit note for ${it.symbol}">${it.note ? html`<span class="small muted">${it.note}</span>` : html`<span class="xs subtle">Add note</span>`}</button></div>
            <div class="end"><span>${priceView(q)}</span>${changeView(q)}</div>
            <button class="btn sm ghost icon" type="button" data-remove="${it.id}" aria-label="Remove ${it.symbol}">${I.x}</button></div>`;
        })}</div>
        <div style="padding:0 20px 16px">${anyQ ? provenance(anyQ) : ''}</div>` : emptyState('This list is empty', 'Add symbols by ticker. Unsupported symbols are reported, duplicates are skipped.', html`<button class="btn" type="button" data-add>${I.plus} Add symbols</button>`)}
      </section></div>`);
  }

  function addDialog() {
    const l = current();
    const dlg = openDialog({
      title: `Add to ${l.name}`,
      body: html`<div class="field"><label for="add-syms">Symbols</label><textarea class="input" id="add-syms" placeholder="AAPL, MSFT, SPY" autocapitalize="characters"></textarea><span class="hint">Separate with commas, spaces or new lines. Paste a column from a CSV to import.</span></div><div id="add-err" class="small neg" role="alert"></div>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-ok>Add</button>`,
    });
    dlg.el.querySelector('[data-ok]').addEventListener('click', async () => {
      const raw = dlg.el.querySelector('#add-syms').value.toUpperCase().split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s && s !== 'SYMBOL');
      const valid = raw.filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s));
      const invalid = raw.filter((s) => !valid.includes(s));
      if (!valid.length) { dlg.el.querySelector('#add-err').textContent = 'Enter at least one valid ticker.'; return; }
      try {
        const r = await post(`/api/watchlists/${l.id}/items`, { symbols: valid });
        dlg.close();
        const qs = await store.load(r.added.map((x) => x.symbol), { force: true });
        const unsupported = Object.values(qs).filter((q) => q && q.status === 'unavailable').map((q) => q.symbol);
        toast([`Added ${r.added.length}`, r.duplicates.length ? `${r.duplicates.length} already in list` : '', invalid.length ? `${invalid.length} invalid` : '', unsupported.length ? `no data for ${unsupported.join(', ')}` : ''].filter(Boolean).join(' · '), { timeout: 7000 });
        load();
      } catch (e) { dlg.el.querySelector('#add-err').textContent = e.message; }
    });
  }

  function textDialog({ title, label, value = '', multiline = false, onSave }) {
    const dlg = openDialog({
      title,
      body: html`<div class="field"><label for="td-in">${label}</label>${multiline ? html`<textarea class="input" id="td-in" maxlength="500">${value}</textarea>` : html`<input class="input" id="td-in" value="${value}" maxlength="60" />`}<div id="td-err" class="small neg" role="alert"></div></div>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-ok>Save</button>`,
    });
    const submit = async () => { try { await onSave(dlg.el.querySelector('#td-in').value.trim()); dlg.close(); } catch (e) { dlg.el.querySelector('#td-err').textContent = e.message; } };
    dlg.el.querySelector('[data-ok]').addEventListener('click', submit);
    if (!multiline) dlg.el.querySelector('#td-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  on(root, 'click', '[data-newlist]', () => textDialog({ title: 'New watchlist', label: 'Name', onSave: async (name) => { const r = await post('/api/watchlists', { name }); navigate(`/watchlists/${r.watchlist.id}`); toast('List created'); } }));
  on(root, 'click', '[data-rename]', () => textDialog({ title: 'Rename list', label: 'Name', value: current().name, onSave: async (name) => { await patch(`/api/watchlists/${current().id}`, { name }); load(); } }));
  on(root, 'click', '[data-dellist]', async () => {
    const l = current();
    if (await confirmDialog({ title: `Delete “${l.name}”?`, message: `This removes the list and its ${l.items.length} symbols. This can’t be undone.`, confirm: 'Delete list', danger: true })) {
      await del(`/api/watchlists/${l.id}`); toast('List deleted'); navigate('/watchlists');
    }
  });
  on(root, 'click', '[data-add]', addDialog);
  on(root, 'change', '#wl-sort', (e) => { sort = e.target.value; draw(); });
  on(root, 'click', '[data-note]', (e, b) => {
    const it = current().items.find((x) => x.id === b.dataset.note);
    textDialog({ title: `Note for ${it.symbol}`, label: 'Note', value: it.note, multiline: true, onSave: async (note) => { await patch(`/api/watchlists/${current().id}/items/${it.id}`, { note }); load(); } });
  });
  on(root, 'click', '[data-remove]', async (e, b) => {
    const l = current();
    try {
      const { removed } = await del(`/api/watchlists/${l.id}/items/${b.dataset.remove}`);
      l.items = l.items.filter((x) => x.id !== b.dataset.remove); draw();
      toast(`Removed ${removed.symbol}`, { action: 'Undo', timeout: 8000, onAction: async () => { await post(`/api/watchlists/${l.id}/items`, { symbol: removed.symbol, note: removed.note, position: removed.position }); load(); } });
    } catch (err) { toast(err.message, { tone: 'error' }); }
  });
  on(root, 'click', '[data-move]', async (e, b) => {
    const l = current();
    const ids = l.items.map((x) => x.id);
    const i = ids.indexOf(b.dataset.id); const j = i + Number(b.dataset.move);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    l.items = ids.map((id) => l.items.find((x) => x.id === id)); draw();
    root.querySelector(`[data-move="${b.dataset.move}"][data-id="${b.dataset.id}"]`)?.focus();
    try { await put(`/api/watchlists/${l.id}/order`, { itemIds: ids }); } catch (err) { toast(err.message, { tone: 'error' }); load(); }
  });
  on(root, 'click', '[data-retry]', load);
  unsub = store.subscribe((ch) => { if (current()?.items.some((i) => ch.includes(i.symbol))) draw(); });
  await load();
  return () => unsub?.();
}
