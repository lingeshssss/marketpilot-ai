// Accessible symbol search (WAI-ARIA combobox + listbox).
import { html, mount, esc } from '../lib/dom.js';
import { I } from '../lib/icons.js';
import { get } from '../lib/api.js';

export function initSearch(root, { navigate }) {
  mount(root, html`${I.search}
    <label class="sr-only" for="global-search">Search stocks and ETFs</label>
    <input id="global-search" class="input" type="search" autocomplete="off" spellcheck="false"
      placeholder="Search ticker or company (e.g. SPY, Apple)" role="combobox" aria-expanded="false"
      aria-controls="search-listbox" aria-autocomplete="list" enterkeyhint="search" />
    <div class="search-results" id="search-listbox" role="listbox" aria-label="Search results" hidden></div>`);
  const input = root.querySelector('input');
  const box = root.querySelector('[role="listbox"]');
  let items = []; let active = -1; let ctrl = null; let timer = null;

  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const open = () => { box.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const select = (i) => {
    active = i;
    [...box.querySelectorAll('[role="option"]')].forEach((el, j) => el.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', `sr-${i}`); box.querySelector(`#sr-${i}`)?.scrollIntoView({ block: 'nearest' }); }
  };
  const go = (sym) => { close(); input.value = ''; input.blur(); navigate(`/symbols/${encodeURIComponent(sym)}`); };

  async function run(q) {
    ctrl?.abort(); ctrl = new AbortController();
    open();
    mount(box, html`<div class="state small" style="padding:12px" role="status"><span class="spinner"></span>Searching…</div>`);
    try {
      const r = await get(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      items = r.results.slice(0, 10);
      if (!items.length) {
        mount(box, html`<div style="padding:12px" class="small muted" role="status">No supported US stock or ETF matches “${q}”.</div>`);
        return;
      }
      mount(box, html`${items.map((it, i) => html`<div role="option" id="sr-${i}" aria-selected="false" data-sym="${it.symbol}">
        <span class="sym" style="min-width:56px">${it.symbol}</span>
        <span class="sym-name" style="flex:1;max-width:none">${it.name}</span>
        <span class="chip">${it.type || '—'}</span><span class="xs subtle">${it.exchange || ''}</span></div>`)}
        ${r.partial ? html`<div class="xs subtle" style="padding:6px 12px">Showing cached matches — ${r.reason}</div>` : ''}`);
    } catch (e) {
      if (e.name === 'AbortError') return;
      mount(box, html`<div style="padding:12px" class="small" role="alert">${e.message}</div>`);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { close(); return; }
    timer = setTimeout(() => run(q), 220);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (box.hidden && input.value.trim()) run(input.value.trim()); else select(Math.min(items.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, active - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (active >= 0 && items[active]) go(items[active].symbol);
      else if (q) { close(); input.blur(); navigate(`/search?q=${encodeURIComponent(q)}`); }
    } else if (e.key === 'Escape') { close(); }
  });
  box.addEventListener('pointerdown', (e) => { const o = e.target.closest('[role="option"]'); if (o) { e.preventDefault(); go(o.dataset.sym); } });
  input.addEventListener('blur', () => setTimeout(close, 120));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); }
  });
}
