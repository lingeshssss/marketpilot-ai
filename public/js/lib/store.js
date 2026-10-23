// ============================================================
// Client quote store — one normalized quote per symbol, shared by every
// component (ticker tape, dashboard, watchlists, scanner, detail, portfolio).
// A component never computes its own change; it renders the stored quote.
// Values only change when the server returns a different quoteId.
// ============================================================

import { get } from './api.js';

const quotes = new Map();      // symbol -> quote
const listeners = new Set();
const inflight = new Map();    // symbol -> Promise
let refreshMs = 10 * 60_000;
let timer = null;
let tracked = new Set();
const pinned = new Set(); // e.g. ticker tape symbols, refreshed on every route

export function quote(symbol) { return quotes.get(symbol) || null; }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function notify(changed) { if (changed.length) for (const fn of listeners) fn(changed); }

function ingest(map) {
  const changed = [];
  for (const [s, q] of Object.entries(map || {})) {
    const prev = quotes.get(s);
    if (!prev || prev.quoteId !== q.quoteId || prev.status !== q.status) { quotes.set(s, q); changed.push(s); }
  }
  notify(changed);
}

/** Loads quotes for symbols, de-duplicating concurrent requests. */
export async function load(symbols, { force = false } = {}) {
  const want = [...new Set(symbols.filter(Boolean))];
  for (const s of want) tracked.add(s);
  const need = want.filter((s) => force || !quotes.has(s));
  const pending = want.filter((s) => inflight.has(s)).map((s) => inflight.get(s));
  const toFetch = need.filter((s) => !inflight.has(s));
  if (toFetch.length) {
    for (let i = 0; i < toFetch.length; i += 100) {
      const batch = toFetch.slice(i, i + 100);
      const p = get(`/api/quotes?symbols=${encodeURIComponent(batch.join(','))}`).then((r) => { ingest(r.quotes); return r; })
        .finally(() => batch.forEach((s) => inflight.delete(s)));
      batch.forEach((s) => inflight.set(s, p));
      pending.push(p);
    }
  }
  await Promise.allSettled(pending);
  return Object.fromEntries(want.map((s) => [s, quotes.get(s) || null]));
}

/** Server-provided quotes (e.g. portfolio valuation) join the same store. */
export function ingestQuotes(map) { ingest(map); }

export function configureRefresh(timeliness) {
  refreshMs = timeliness === 'realtime' ? 30_000 : timeliness === 'delayed' ? 60_000 : 10 * 60_000;
  restart();
}

function restart() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (tracked.size) load([...tracked], { force: true }).catch(() => {});
  }, refreshMs);
}

export function untrackAll() { tracked = new Set(pinned); }
export function pin(symbols) { for (const s of symbols) { pinned.add(s); tracked.add(s); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tracked.size) load([...tracked], { force: true }).catch(() => {}); });
restart();
