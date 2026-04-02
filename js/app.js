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
let currentPage = 'landing';
let currentTicker = null;

// ---- ROUTER ----
function navigate(page, param = null) {
  currentPage = page;
  currentTicker = param;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- RENDER ----
function render() {
  const app = document.getElementById('app');

  if (currentPage === 'landing') {
    app.innerHTML = renderLandingPage(navigate);
    initLandingPage();
    return;
  }

  // App shell (sidebar + header + content)
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar(currentPage, navigate)}
      <div class="main-content" id="main-content">
        ${renderHeader()}
        <div id="page-root"></div>
      </div>
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

  // Show ticker tape
  setTimeout(() => createTickerTape(), 150);
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
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) &&
          !menuBtn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
}

// ---- HEADER INTERACTIONS ----
function initHeader() {
  // Alert button
  document.getElementById('alerts-btn')?.addEventListener('click', showAlertsModal);

  // Settings button in header
  document.getElementById('settings-nav-btn')?.addEventListener('click', () => navigate('settings'));

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
      <div style="font-weight:600;font-size:0.9rem;">Smart Alerts</div>
      <button id="close-alerts" style="color:var(--text-muted);background:none;border:none;cursor:pointer;font-size:18px;">✕</button>
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

  document.body.appendChild(modal);

  document.getElementById('close-alerts')?.addEventListener('click', () => modal.remove());

  modal.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => {
      modal.remove();
      navigate('stock', item.dataset.ticker);
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!modal.contains(e.target) && e.target !== document.getElementById('alerts-btn')) {
        modal.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 50);
}

// ---- LANDING PAGE INTERACTIONS ----
function initLandingPage() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
}

// ---- LIVE TICKER TAPE ----
function createTickerTape() {
  if (currentPage === 'landing') return;

  // Remove any existing tape first
  document.getElementById('ticker-tape')?.remove();

  const tickers = [
    { t: 'AAPL', p: 218.27, c: 0.82 },
    { t: 'NVDA', p: 142.65, c: 1.34 },
    { t: 'TSLA', p: 271.83, c: -2.14 },
    { t: 'MSFT', p: 428.50, c: 0.45 },
    { t: 'AMZN', p: 198.42, c: 0.92 },
    { t: 'GOOGL', p: 167.52, c: 0.31 },
    { t: 'META', p: 612.30, c: 1.45 },
    { t: 'AMD',  p: 114.82, c: -0.78 },
    { t: 'JPM',  p: 252.40, c: 0.22 },
    { t: 'NFLX', p: 1028.30, c: 2.15 },
  ];

  const existing = document.getElementById('ticker-tape');
  if (existing) existing.remove();

  const tape = document.createElement('div');
  tape.id = 'ticker-tape';
  tape.style.cssText = `
    position:fixed;bottom:0;left:var(--sidebar-width);right:0;
    height:32px;background:rgba(12,17,32,0.95);
    border-top:1px solid var(--border-subtle);
    backdrop-filter:var(--glass-blur);
    overflow:hidden;z-index:50;display:flex;align-items:center;
  `;

  const content = tickers.map(t => {
    const isUp = t.c >= 0;
    return `
      <span style="display:inline-flex;align-items:center;gap:8px;padding:0 20px;white-space:nowrap;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text-secondary);">${t.t}</span>
        <span style="font-family:var(--font-mono);font-size:0.72rem;">$${t.p.toFixed(2)}</span>
        <span style="font-family:var(--font-mono);font-size:0.72rem;color:${isUp ? 'var(--green)' : 'var(--red)'};">${isUp ? '▲' : '▼'} ${Math.abs(t.c).toFixed(2)}%</span>
      </span>
    `;
  }).join('<span style="color:var(--border-default);padding:0 4px;">·</span>');

  tape.innerHTML = `
    <div style="display:flex;animation:scroll-tape 30s linear infinite;width:max-content;">
      ${content}${content}
    </div>
  `;

  document.body.appendChild(tape);

  // Add scrolling keyframe
  if (!document.getElementById('ticker-style')) {
    const style = document.createElement('style');
    style.id = 'ticker-style';
    style.textContent = `
      @keyframes scroll-tape {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }
    `;
    document.head.appendChild(style);
  }

  // Adjust main content bottom padding
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.style.paddingBottom = '32px';
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  render();
});
