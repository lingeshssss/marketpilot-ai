import './appearance.js';
// ============================================================
// MarketPilot AI — Main App Router & Entry Point
// ============================================================

import { renderSidebar, renderHeader, initSearch, ICONS } from './components/index.js';
import { renderLandingPage } from './pages/landing.js';
import { renderDashboard, initDashboard } from './pages/dashboard.js';
import { renderStockDetail, initStockDetail } from './pages/stockDetail.js';
import { renderScanner, initScanner } from './pages/scanner.js';
import { renderWatchlist, initWatchlist } from './pages/watchlist.js';
import { renderPortfolio, initPortfolio } from './pages/portfolio.js';
import { renderSettings, initSettings } from './pages/settings.js';

// ---- STATE ----
let currentPage = 'dashboard';
let currentTicker = null;

// ---- ROUTER ----
function navigate(page, param = null) {
  const allowed = ['landing', 'dashboard', 'stock', 'scanner', 'watchlist', 'portfolio', 'settings'];
  currentPage = allowed.includes(page) ? page : 'dashboard';
  currentTicker = param && /^[A-Z0-9.-]{1,10}$/.test(param) ? param : null;
  history.replaceState(null, '', `#${currentPage}${currentTicker ? '/' + currentTicker : ''}`);
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
  const heading = document.querySelector('.page-title, .hero-title');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}

// ---- RENDER ----
function render() {
  const app = document.getElementById('app');
  document.getElementById('alerts-modal')?.remove();
  document.querySelectorAll('canvas').forEach(canvas => window.Chart?.getChart(canvas)?.destroy());

  if (currentPage === 'landing') {
    app.innerHTML = renderLandingPage(navigate);
    initLandingPage();
    return;
  }

  // App shell (sidebar + header + content)
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar(currentPage, navigate)}
      <main class="main-content" id="main-content">
        ${renderHeader()}
        <div id="page-root" tabindex="-1"></div>
      </main>
      ${renderMobileTabs()}
    </div>
  `;

  // Init shared features
  initSidebar();
  initHeader();
  initSearch(navigate);

  // Render page content
  const pageRoot = document.getElementById('page-root');
  switch (currentPage) {
    case 'dashboard':
      pageRoot.innerHTML = renderDashboard(navigate);
      initDashboard(navigate);
      break;
    case 'stock':
      pageRoot.innerHTML = renderStockDetail(currentTicker, navigate);
      initStockDetail(currentTicker, navigate);
      break;
    case 'scanner':
      pageRoot.innerHTML = renderScanner(navigate);
      initScanner(navigate);
      break;
    case 'watchlist':
      pageRoot.innerHTML = renderWatchlist(navigate);
      initWatchlist(navigate);
      break;
    case 'portfolio':
      pageRoot.innerHTML = renderPortfolio(navigate);
      initPortfolio(navigate);
      break;
    case 'settings':
      pageRoot.innerHTML = renderSettings(navigate);
      initSettings(navigate);
      break;
    default:
      pageRoot.innerHTML = renderDashboard(navigate);
      initDashboard(navigate);
  }

  // Global [data-page] delegation for any remaining elements
  document.querySelectorAll('[data-page]:not(.nav-item):not(#settings-nav-btn)').forEach(el => {
    if (!el._navBound) {
      el._navBound = true;
      el.addEventListener('click', () => navigate(el.dataset.page));
    }
  });

  // Apply keyboard and assistive technology support
  enhanceControls();
}

// ---- SIDEBAR INTERACTIONS ----
function initSidebar() {
  // Nav item clicks
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // Mobile toggle
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    });

  }
}

// ---- HEADER INTERACTIONS ----
function initHeader() {
  // Alert button
  document.getElementById('alerts-btn')?.addEventListener('click', showAlertsModal);

  // Settings button in header
  

  // Any [data-page] buttons in header
  document.querySelectorAll('#header [data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
}

// ---- ALERTS MODAL ----
function showAlertsModal() {
  const existing = document.getElementById('alerts-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'alerts-modal';
  modal.style.cssText = `
    position:fixed;top:72px;right:16px;width:360px;
    background:var(--bg-card-solid);border:1px solid var(--border-default);
    border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);
    z-index:999;animation:slideDown 200ms ease-out;overflow:hidden;
  `;

  const alerts = [
    { icon: '🟡', label: 'AAPL', msg: 'RSI approaching 70 — monitor for overbought conditions', time: '15m ago', color: 'var(--amber)' },
    { icon: '🔴', label: 'TSLA', msg: 'Price within 2% of key resistance at $278.20', time: '32m ago', color: 'var(--red)' },
    { icon: '🟢', label: 'NVDA', msg: 'Volume 18% above average — bullish continuation possible', time: '1h ago', color: 'var(--green)' },
    { icon: '🔵', label: 'MSFT', msg: 'MACD bullish crossover detected on weekly timeframe', time: '2h ago', color: 'var(--blue)' },
    { icon: '🟡', label: 'AMD', msg: 'Approaching support zone — watch for bounce or breakdown', time: '3h ago', color: 'var(--amber)' },
  ];

  modal.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;">
      <div style="font-weight:600;font-size:0.9rem;">Sample alerts</div>
      <button id="close-alerts" aria-label="Close alerts" style="color:var(--text-muted);background:none;border:none;cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div style="max-height:360px;overflow-y:auto;">
      ${alerts.map(a => `
        <div style="padding:14px 20px;border-bottom:1px solid var(--border-subtle);display:flex;gap:12px;cursor:pointer;" class="alert-item" data-ticker="${a.label}">
          <div style="font-size:16px;flex-shrink:0;">${a.icon}</div>
          <div>
            <div style="font-weight:600;font-size:0.85rem;color:${a.color};">${a.label}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">${a.msg}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${a.time}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="padding:12px 20px;text-align:center;">
      <span style="font-size:0.75rem;color:var(--text-muted);">Probabilistic alerts — not actionable advice</span>
    </div>
  `;

  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Sample alerts');
  document.body.appendChild(modal);
  document.getElementById('close-alerts')?.focus();

  document.getElementById('close-alerts')?.addEventListener('click', () => modal.remove());

  modal.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      modal.remove();
      navigate('stock', item.dataset.ticker);
    });
  });


}

// ---- LANDING PAGE INTERACTIONS ----
function initLandingPage() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
}

function renderMobileTabs() {
  return `<nav class="mobile-tabs" aria-label="Primary navigation">${[
    ['dashboard', 'dashboard', 'Today'], ['watchlist', 'star', 'Watchlist'],
    ['scanner', 'scanner', 'Explore'], ['portfolio', 'briefcase', 'Portfolio'],
    ['settings', 'settings', 'Settings']
  ].map(([page, icon, label]) => `<button type="button" data-page="${page}" ${currentPage === page ? 'aria-current="page"' : ''}>${ICONS[icon]}<span>${label}</span></button>`).join('')}</nav>`;
}

// Give existing interactive rows keyboard equivalents without changing their actions.
function enhanceControls() {
  document.querySelectorAll('.nav-item.active').forEach(el => el.setAttribute('aria-current', 'page'));
  document.querySelectorAll('[data-ticker], .card-action, .tab, .radio-option, .filter-chip').forEach(el => {
    if (el.matches('button, input, a') || el.closest('button')) return;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); }
    });
  });
  document.querySelectorAll('.toggle-switch').forEach(el => {
    const locked = !el.dataset.toggle;
    el.tabIndex = locked ? -1 : 0;
    el.setAttribute('role', 'switch');
    el.setAttribute('aria-label', el.closest('.settings-row')?.querySelector('.settings-label')?.textContent || 'Preference');
    const sync = () => el.setAttribute('aria-checked', String(el.classList.contains('active')));
    sync();
    el.addEventListener('click', sync);
    el.addEventListener('keydown', event => {
      if (!locked && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); el.click(); }
    });
  });
}

document.addEventListener('click', event => {
  if (!event.target.closest('.search-container')) document.getElementById('search-dropdown')?.classList.remove('visible');
  const sidebar = document.getElementById('sidebar');
  if (!event.target.closest('#sidebar, #mobile-menu-btn')) {
    sidebar?.classList.remove('open');
    document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.target.matches('input, textarea, select, [contenteditable]')) {
    event.preventDefault(); document.getElementById('search-input')?.focus();
  }
  if (event.key === 'Escape') {
    const modal = document.getElementById('alerts-modal');
    if (modal) { modal.remove(); document.getElementById('alerts-btn')?.focus(); }
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('mobile-menu-btn')?.setAttribute('aria-expanded', 'false');
  }
});

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  const [page, ticker] = location.hash.slice(1).split('/');
  navigate(page || 'dashboard', ticker);
});
window.addEventListener('hashchange', () => {
  const [page, ticker] = location.hash.slice(1).split('/');
  navigate(page || 'dashboard', ticker);
});

