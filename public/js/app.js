// ============================================================
// MarketPilot — app shell & router (History API, addressable routes)
// ============================================================

import { html, mount, $, on, esc } from './lib/dom.js';
import { I } from './lib/icons.js';
import { session, loadSession, onSession, signOut, tickerMotion, savePrefs, setLocalPref, refreshUnread } from './lib/session.js';
import { toast, setTitle, errorState } from './lib/ui.js';
import * as store from './lib/store.js';
import { initSearch } from './components/search.js';
import { mountTape } from './components/tape.js';

const ROUTES = [
  { re: /^\/$/, page: () => import('./pages/dashboard.js'), nav: 'dashboard' },
  { re: /^\/symbols\/([A-Za-z0-9.\-]{1,10})\/?$/, page: () => import('./pages/symbol.js'), nav: 'symbols', params: ['symbol'] },
  { re: /^\/search\/?$/, page: () => import('./pages/searchPage.js'), nav: 'symbols' },
  { re: /^\/scanner\/?$/, page: () => import('./pages/scanner.js'), nav: 'scanner' },
  { re: /^\/watchlists\/?$/, page: () => import('./pages/watchlists.js'), nav: 'watchlists' },
  { re: /^\/watchlists\/([0-9a-f-]{36})\/?$/, page: () => import('./pages/watchlists.js'), nav: 'watchlists', params: ['id'] },
  { re: /^\/portfolios\/?$/, page: () => import('./pages/portfolios.js'), nav: 'portfolios' },
  { re: /^\/portfolios\/([0-9a-f-]{36})\/?$/, page: () => import('./pages/portfolios.js'), nav: 'portfolios', params: ['id'] },
  { re: /^\/alerts\/?$/, page: () => import('./pages/alerts.js'), nav: 'alerts' },
  { re: /^\/settings\/?$/, page: () => import('./pages/settings.js'), nav: 'settings' },
  { re: /^\/(signin|signup|reset-password|forgot-password)\/?$/, page: () => import('./pages/auth.js'), nav: null, params: ['mode'] },
];

const NAV = [
  { id: 'dashboard', href: '/', label: 'Dashboard', icon: I.home },
  { id: 'scanner', href: '/scanner', label: 'Scanner', icon: I.scan },
  { id: 'watchlists', href: '/watchlists', label: 'Watchlists', icon: I.list },
  { id: 'portfolios', href: '/portfolios', label: 'Portfolios', icon: I.briefcase },
  { id: 'alerts', href: '/alerts', label: 'Alerts', icon: I.bell },
  { id: 'settings', href: '/settings', label: 'Settings', icon: I.gear },
];

let current = { cleanup: null, controller: null };

function shell() {
  return html`<div class="app">
    <aside class="sidebar" aria-label="Primary">
      <a class="brand" href="/" data-link><span class="brand-mark">${I.sparkle}</span>MarketPilot</a>
      <nav class="nav" aria-label="Main">${NAV.map((n) => html`<a href="${n.href}" data-link data-nav="${n.id}">${n.icon}<span>${n.label}</span>${n.id === 'alerts' ? html`<span class="nav-count" data-unread hidden></span>` : ''}</a>`)}</nav>
      <div class="sidebar-foot" id="account-box"></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <a class="brand mobile-only" href="/" data-link aria-label="MarketPilot home" style="padding:0"><span class="brand-mark">${I.sparkle}</span></a>
        <div class="search" id="search-root"></div>
        <div class="spacer desktop-only"></div>
        <div id="market-state" class="desktop-only"></div>
        <a class="btn ghost icon mobile-only" href="/settings" data-link aria-label="Settings">${I.gear}</a>
      </header>
      <main id="main" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Main">${NAV.filter((n) => n.id !== 'settings').map((n) => html`<a href="${n.href}" data-link data-nav="${n.id}">${n.icon}<span>${n.label}</span>${n.id === 'alerts' ? html`<span class="nav-count" data-unread hidden></span>` : ''}</a>`)}</nav>
    <div id="tape-root"></div>
  </div>`;
}

function renderAccount() {
  const box = $('#account-box');
  if (!box) return;
  const caps = session.caps;
  const demo = caps?.marketData?.demo;
  mount(box, html`
    ${demo ? html`<div class="chip warn" style="align-self:flex-start">Demo data mode</div>` : ''}
    ${session.user
      ? html`<div class="small muted" style="padding:0 12px;overflow:hidden;text-overflow:ellipsis">${session.user.email}</div>
             <button class="btn ghost sm" type="button" data-signout style="justify-content:flex-start">Sign out</button>`
      : caps?.auth ? html`<a class="btn primary sm" href="/signin" data-link>Sign in</a>` : html`<p class="xs subtle" style="padding:0 12px">Accounts unavailable on this server</p>`}
  `);
  for (const el of document.querySelectorAll('[data-unread]')) {
    el.hidden = !session.unreadAlerts;
    el.textContent = session.unreadAlerts > 99 ? '99+' : String(session.unreadAlerts);
    el.setAttribute('aria-label', `${session.unreadAlerts} unread`);
  }
}

async function renderMarketState() {
  const el = $('#market-state');
  if (!el) return;
  try {
    const r = await (await fetch('/api/market/status')).json();
    const s = r.state;
    const open = s.phase === 'regular';
    const ext = s.phase === 'pre' || s.phase === 'post';
    mount(el, html`<span class="chip ${open ? 'pos' : ext ? 'info' : ''}" title="${s.reason || ''}"><span class="dot" aria-hidden="true"></span>${s.label}${s.phase === 'closed' && s.reason ? html` · ${s.reason}` : ''}</span>`);
  } catch { mount(el, ''); }
}

function setActiveNav(id) {
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

export function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) { location.href = href; return; }
  if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  route();
}

async function route() {
  current.cleanup?.(); current.controller?.abort();
  store.untrackAll();
  const main = $('#main');
  const path = location.pathname;
  let match = null; let params = {};
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = r; (r.params || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  setActiveNav(match?.nav);
  if (!match) {
    setTitle('Not found');
    mount(main, html`<div class="page"><div class="state"><h1>Page not found</h1><p>There’s nothing at ${path}.</p><a class="btn primary" href="/" data-link>Go to dashboard</a></div></div>`);
    return;
  }
  const controller = new AbortController();
  current = { controller, cleanup: null };
  try {
    const mod = await match.page();
    if (controller.signal.aborted) return;
    const query = Object.fromEntries(new URLSearchParams(location.search));
    current.cleanup = await mod.default({ root: main, params, query, signal: controller.signal, navigate });
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    mount(main, html`<div class="page">${errorState(e)}</div>`);
  }
  if (!history.state?.noFocus) {
    // Move focus to the page heading so screen readers announce the new screen.
    const h1 = main.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); } else main.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

async function boot() {
  const root = $('#app');
  mount(root, shell());
  root.setAttribute('aria-busy', 'false');

  on(document, 'click', 'a[data-link]', (e, a) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });
  on(document, 'click', '[data-signout]', async () => {
    try { await signOut(); toast('Signed out'); navigate('/'); } catch (e) { toast(e.message, { tone: 'error' }); }
  });
  window.addEventListener('popstate', route);
  window.addEventListener('online', () => toast('Back online'));
  window.addEventListener('offline', () => toast('You’re offline — showing the last loaded data', { timeout: 8000 }));

  initSearch($('#search-root'), { navigate });
  onSession(renderAccount);
  await loadSession();
  if (session.caps?.marketData?.quoteTimeliness) store.configureRefresh(session.caps.marketData.quoteTimeliness);
  renderMarketState();
  setInterval(renderMarketState, 60_000);
  setInterval(refreshUnread, 120_000);

  mountTape($('#tape-root'), {
    motion: () => tickerMotion(),
    setMotion: async (v) => { setLocalPref('ticker-motion', v); if (session.user) await savePrefs({ ticker_motion: v }); },
    available: () => session.caps?.marketData?.status === 'configured',
  });
  const qs = new URLSearchParams(location.search);
  if (qs.get('verified') === '1') toast('Email verified — you’re signed in');
  await route();
}

boot();
