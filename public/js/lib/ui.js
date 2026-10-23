// Shared UI primitives: toasts, dialogs (native <dialog>, focus-managed),
// confirmations, status states, and the single change/price renderer.

import { html, raw, esc, mount } from './dom.js';
import { I } from './icons.js';
import { fmtPrice, fmtPct, fmtChange, direction, fmtDateTime, fmtRelative, fmtDate } from '/shared/format.js';

// ---------- toast ----------
export function toast(message, { action, onAction, timeout = 5000, tone } = {}) {
  const region = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  if (tone === 'error') el.setAttribute('role', 'alert');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button class="btn sm" type="button">${esc(action)}</button>` : ''}`;
  region.appendChild(el);
  let done = false;
  const close = () => { if (done) return; done = true; el.remove(); };
  if (action) el.querySelector('button').addEventListener('click', () => { onAction?.(); close(); });
  setTimeout(close, timeout);
  return close;
}

// ---------- dialog ----------
/**
 * Opens a modal sheet. `render(body)` fills content; returns { el, close }.
 * Focus moves into the dialog and returns to the opener on close.
 */
export function openDialog({ title, body, footer, wide = false, onClose, labelledBy }) {
  const opener = document.activeElement;
  const d = document.createElement('dialog');
  d.className = `sheet${wide ? ' wide' : ''}`;
  const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  d.setAttribute('aria-labelledby', labelledBy || `${id}-t`);
  d.innerHTML = String(html`<div class="sheet-inner">
    <div class="sheet-head"><h2 id="${id}-t">${title}</h2>
      <button class="btn ghost icon" type="button" data-close aria-label="Close">${I.x}</button></div>
    <div class="sheet-body">${body || ''}</div>
    ${footer ? html`<div class="sheet-foot">${footer}</div>` : ''}
  </div>`);
  document.body.appendChild(d);
  const close = (result) => { if (!d.open) return; d.close(result ?? ''); };
  d.addEventListener('close', () => {
    onClose?.(d.returnValue);
    setTimeout(() => d.remove(), 260);
    if (opener && document.contains(opener)) opener.focus();
  });
  d.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    else if (e.target === d) close(); // backdrop click
  });
  d.showModal();
  const first = d.querySelector('[autofocus], .sheet-body input, .sheet-body select, .sheet-body textarea, .sheet-body button, .sheet-foot button');
  (first || d).focus();
  return { el: d, close, body: d.querySelector('.sheet-body') };
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dlg = openDialog({
      title, body: html`<p class="muted">${message}</p>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-ok>${confirm}</button>`,
      onClose: (v) => resolve(v === 'ok'),
    });
    dlg.el.querySelector('[data-ok]').addEventListener('click', () => dlg.close('ok'));
  });
}

// ---------- states ----------
export const loadingState = (label = 'Loading') => html`<div class="state" role="status"><span class="spinner"></span><span class="small">${label}…</span></div>`;
export const skeletonRows = (n = 4) => html`<div class="stack" aria-hidden="true">${Array.from({ length: n }, () => raw('<div class="skeleton" style="height:18px"></div>'))}</div>`;

export function errorState(err, { retry = true, title } = {}) {
  const offline = err?.code === 'offline';
  const unavailable = /unavailable|unconfigured/.test(err?.code || '');
  const heading = title || (offline ? 'You’re offline' : unavailable ? 'Not available' : err?.status === 401 ? 'Sign in required' : err?.status === 429 ? 'Slow down' : 'Something went wrong');
  return html`<div class="state" role="alert">
    <h3>${heading}</h3><p class="small">${err?.message || 'Unknown error'}</p>
    ${err?.status === 401 ? html`<a class="btn primary" href="/signin?next=${encodeURIComponent(location.pathname + location.search)}" data-link>Sign in</a>`
      : retry && !unavailable ? html`<button class="btn" type="button" data-retry>${I.refresh} Try again</button>` : ''}
  </div>`;
}

export const emptyState = (title, text, action = '') => html`<div class="state"><h3>${title}</h3><p class="small">${text}</p>${action}</div>`;

export function notice(text, tone = 'info') {
  const icon = tone === 'warn' || tone === 'err' ? I.warn : I.info;
  return html`<div class="notice ${tone === 'info' ? '' : tone}" role="${tone === 'err' ? 'alert' : 'note'}">${icon}<div>${text}</div></div>`;
}

// ---------- prices & changes (single renderer => identical everywhere) ----------
export function changeView(q, { showAbs = false } = {}) {
  if (!q || q.changePct === null || q.changePct === undefined) return html`<span class="change flat">—</span>`;
  const d = direction(q.changePct);
  const arrow = d === 'up' ? I.up : d === 'down' ? I.down : '';
  const label = `${d === 'up' ? 'Up' : d === 'down' ? 'Down' : 'Unchanged'} ${fmtPct(Math.abs(q.changePct), { signed: false })}`;
  const cls = d === 'up' ? 'pos' : d === 'down' ? 'neg' : 'flat';
  return html`<span class="change ${cls}" aria-label="${label}${showAbs ? `, ${fmtChange(q.change, { reference: q.price })}` : ''}">${arrow}<span aria-hidden="true">${showAbs ? `${fmtChange(q.change, { reference: q.price })} ` : ''}${showAbs ? `(${fmtPct(q.changePct)})` : fmtPct(q.changePct)}</span></span>`;
}

export function priceView(q) {
  if (!q || q.price === null || q.price === undefined) return html`<span class="flat">—</span>`;
  return html`<span class="num">${fmtPrice(q.price)}</span>`;
}

export function statusChip(q) {
  if (!q) return '';
  if (q.source === 'demo') return html`<span class="chip warn" title="Synthetic demo data">Demo data</span>`;
  if (q.status === 'unavailable') return html`<span class="chip neg">Unavailable</span>`;
  if (q.status === 'stale') return html`<span class="chip warn" title="${q.reason || ''}">Stale</span>`;
  return '';
}

/** "Close Oct 16, 4:00 PM EDT · end-of-day · Massive · retrieved 2 min ago" */
export function provenance(q, { long = false } = {}) {
  if (!q) return '';
  if (q.status === 'unavailable') return html`<span class="provenance">${q.reason || 'Quote unavailable'}</span>`;
  const sessionLabel = { 'regular-close': 'Close', pre: 'Pre-market', regular: 'Regular session', post: 'After hours' }[q.session] || 'As of';
  const tl = { eod: 'end-of-day', delayed: '15-min delayed', realtime: 'real-time', demo: 'synthetic demo' }[q.timeliness] || q.timeliness;
  const src = q.source === 'massive' ? 'Massive' : q.source === 'demo' ? 'Demo' : q.source;
  if (!long) return html`<span class="provenance"><span>${sessionLabel} ${fmtDateTime(q.marketTime, { withTz: true }).replace(/, \d{4},/, ',')}</span>${q.source !== 'demo' ? html`<span aria-hidden="true">·</span><span>${tl}</span>` : ''}${statusChip(q)}</span>`;
  return html`<span class="provenance"><span>${sessionLabel} ${fmtDateTime(q.marketTime)}</span><span aria-hidden="true">·</span><span>${tl}</span><span aria-hidden="true">·</span><span>${src}</span>${long ? html`<span aria-hidden="true">·</span><span>retrieved ${fmtRelative(q.retrievedAt)}</span><span aria-hidden="true">·</span><span>${q.changeBasis || ''}</span>` : ''}${statusChip(q)}</span>`;
}

export { fmtDate, fmtDateTime, fmtRelative };
export function setTitle(t) { document.title = t ? `${t} · MarketPilot` : 'MarketPilot — Stock & ETF research'; }
export function render(el, content) { return mount(el, content); }
