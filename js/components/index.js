// ============================================================
// MarketPilot AI — Reusable UI Components
// ============================================================

import { STOCKS, INDICES, SECTORS, getStableMovers, getMarketNews, getWatchlist, isInWatchlist, addToWatchlist, removeFromWatchlist } from '../data/mockData.js';
import { generateScores, getSignalState, getTrendDirection } from '../services/aiEngine.js';

// --- SVG ICONS ---
export const ICONS = {
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  home: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>`,
  dashboard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  chart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  scanner: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="12" y1="7" x2="12" y2="17"/></svg>`,
  star: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
  starFilled: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`,
  bell: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  settings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  briefcase: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  brain: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2"/></svg>`,
  arrowUp: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  arrowDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  zap: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10"/></svg>`,
  target: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  menu: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  x: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  newspaper: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>`,
};

// --- SIDEBAR ---
export function renderSidebar(currentPage, navigate) {
  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">M</div>
        <div class="sidebar-brand">
          <span class="sidebar-brand-name">MarketPilot</span>
          <span class="sidebar-brand-tag">Research workspace</span>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">
        <div class="nav-section-title">Main</div>
        <button type="button" class="nav-item ${currentPage === 'landing' ? 'active' : ''}" data-page="landing">
          ${ICONS.home} <span>Home</span>
        </button>
        <button type="button" class="nav-item ${currentPage === 'dashboard' ? 'active' : ''}" data-page="dashboard">
          ${ICONS.dashboard} <span>Dashboard</span>
        </button>
        <button type="button" class="nav-item ${currentPage === 'scanner' ? 'active' : ''}" data-page="scanner">
          ${ICONS.scanner} <span>Scanner</span>
          <span class="nav-badge">New</span>
        </button>

        <div class="nav-section-title">Analysis</div>
        <button type="button" class="nav-item ${currentPage === 'watchlist' ? 'active' : ''}" data-page="watchlist">
          ${ICONS.star} <span>Watchlist</span>
          <span class="nav-badge">${getWatchlist().length}</span>
        </button>
        <button type="button" class="nav-item ${currentPage === 'portfolio' ? 'active' : ''}" data-page="portfolio">
          ${ICONS.briefcase} <span>Portfolio</span>
        </button>

        <div class="nav-section-title">System</div>
        <button type="button" class="nav-item ${currentPage === 'settings' ? 'active' : ''}" data-page="settings">
          ${ICONS.settings} <span>Settings</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-disclaimer">
          ⚠️ Not financial advice. Probabilistic insights only.
        </div>
      </div>
    </aside>
  `;
}

// --- HEADER ---
export function renderHeader() {
  return `
    <header class="header" id="header">
      <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Open navigation" aria-expanded="false">
        ${ICONS.menu}
      </button>
      <div class="search-container">
        <span class="search-icon">${ICONS.search}</span>
        <input class="search-input" id="search-input" type="text" aria-label="Search stocks by name or symbol" placeholder="Search companies or symbols" autocomplete="off" />
        <span class="search-shortcut">/</span>
        <div class="search-dropdown" id="search-dropdown"></div>
      </div>
      <span class="demo-label">Sample data</span><div class="header-actions">
        <button class="header-btn tooltip" data-tooltip="Alerts" id="alerts-btn" aria-label="Sample alerts">
          ${ICONS.bell}
          
        </button>
        <button class="header-btn tooltip" data-tooltip="Settings" id="settings-nav-btn" aria-label="Settings" data-page="settings">
          ${ICONS.settings}
        </button>
      </div>
    </header>
  `;
}

// --- SEARCH FUNCTIONALITY ---
export function initSearch(navigate) {
  const input = document.getElementById('search-input');
  const dropdown = document.getElementById('search-dropdown');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    const query = input.value.trim().toUpperCase();
    if (query.length === 0) { dropdown.classList.remove('visible'); return; }

    const results = Object.values(STOCKS).filter(s =>
      s.ticker.includes(query) || s.name.toUpperCase().includes(query)
    ).slice(0, 8);

    if (results.length === 0) {
      dropdown.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.85rem;">No matching companies. Try AAPL or Microsoft.</div>`;
    } else {
      dropdown.innerHTML = results.map(s => {
        const change = ((Math.random() - 0.45) * 5).toFixed(2);
        const isUp = parseFloat(change) >= 0;
        return `
          <button type="button" class="search-result-item" data-ticker="${s.ticker}">
            <div class="search-result-info">
              <span class="search-result-ticker">${s.ticker}</span>
              <span class="search-result-name">${s.name}</span>
            </div>
            <div style="text-align:right;">
              <div class="search-result-price">$${s.price.toFixed(2)}</div>
              <div style="font-size:0.75rem;font-family:var(--font-mono);color:${isUp ? 'var(--green)' : 'var(--red)'};">${isUp ? '+' : ''}${change}%</div>
            </div>
          </button>
        `;
      }).join('');
    }

    dropdown.classList.add('visible');
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim().toUpperCase();
      if (STOCKS[query]) {
        navigate('stock', query);
        input.value = '';
        dropdown.classList.remove('visible');
      }
    }
    if (e.key === 'Escape') {
      dropdown.classList.remove('visible');
      input.blur();
    }
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) {
      navigate('stock', item.dataset.ticker);
      input.value = '';
      dropdown.classList.remove('visible');
    }
  });


}

// --- MARKET OVERVIEW CARDS ---
export function renderMarketCards() {
  return `
    <div class="grid-4 stagger">
      ${INDICES.map(idx => {
        const isUp = idx.change >= 0;
        const sparkData = Array.from({ length: 20 }, (_, i) => 50 + Math.sin(i * 0.5) * 20 + Math.random() * 10);
        return `
          <div class="market-card">
            <div class="market-card-name">${idx.name}</div>
            <div class="market-card-value">${idx.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            <div class="market-card-change ${isUp ? 'text-green' : 'text-red'}">
              ${isUp ? ICONS.arrowUp : ICONS.arrowDown}
              <span>${isUp ? '+' : ''}${idx.change}%</span>
              <span style="color:var(--text-muted);font-size:0.75rem;">(${isUp ? '+' : ''}${idx.changeAmt.toFixed(2)})</span>
            </div>
            <div class="market-card-sparkline">
              <canvas class="sparkline-canvas" data-values="${sparkData.join(',')}" data-color="${getComputedStyle(document.documentElement).getPropertyValue(isUp ? '--green' : '--red').trim()}" width="200" height="32"></canvas>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// --- SPARKLINE RENDERER ---
export function initSparklines() {
  document.querySelectorAll('.sparkline-canvas').forEach(canvas => {
    const values = canvas.dataset.values.split(',').map(Number);
    const color = canvas.dataset.color || '#818cf8';
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const rw = canvas.offsetWidth;
    const rh = canvas.offsetHeight;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = rw / (values.length - 1);

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, rh);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '00');

    ctx.beginPath();
    ctx.moveTo(0, rh);
    values.forEach((v, i) => {
      const x = i * step;
      const y = rh - ((v - min) / range) * (rh - 4) - 2;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(rw, rh);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = i * step;
      const y = rh - ((v - min) / range) * (rh - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// --- SECTOR HEATMAP ---
export function renderSectorHeatmap() {
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Sector Performance</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        ${SECTORS.map(s => {
          const isUp = s.change >= 0;
          return `
            <div style="background:${isUp ? 'var(--green-bg)' : 'var(--red-bg)'};border:1px solid ${isUp ? 'var(--green-border)' : 'var(--red-border)'};border-radius:var(--radius-md);padding:12px;text-align:center;">
              <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">${s.name}</div>
              <div style="font-family:var(--font-mono);font-weight:600;font-size:0.85rem;color:${isUp ? 'var(--green)' : 'var(--red)'};">${isUp ? '+' : ''}${s.change}%</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// --- TOP MOVERS ---
export function renderTopMovers(navigate) {
  const { gainers, losers } = getStableMovers();
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Top Movers</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:0.7rem;color:var(--green-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">📈 Gainers</div>
          ${gainers.map(s => `
            <div class="stock-row" data-ticker="${s.ticker}" style="padding:8px 0;">
              <span class="stock-row-ticker">${s.ticker}</span>
              <span class="stock-row-price">$${s.price.toFixed(2)}</span>
              <span class="stock-row-change text-green">+${s.change.toFixed(2)}%</span>
            </div>
          `).join('')}
        </div>
        <div>
          <div style="font-size:0.7rem;color:var(--red-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">📉 Losers</div>
          ${losers.map(s => `
            <div class="stock-row" data-ticker="${s.ticker}" style="padding:8px 0;">
              <span class="stock-row-ticker">${s.ticker}</span>
              <span class="stock-row-price">$${s.price.toFixed(2)}</span>
              <span class="stock-row-change text-red">${s.change.toFixed(2)}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// --- WATCHLIST SIDEBAR ---
export function renderWatchlistPanel(navigate) {
  const tickers = getWatchlist();
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${ICONS.star} Watchlist</span>
        <span class="card-action" data-page="watchlist">View All</span>
      </div>
      ${tickers.length === 0 ? `
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem;">
          No stocks in watchlist. Search and add some!
        </div>
      ` : tickers.map(t => {
        const s = STOCKS[t];
        if (!s) return '';
        const change = ((Math.random() - 0.43) * 4).toFixed(2);
        const isUp = parseFloat(change) >= 0;
        return `
          <div class="watchlist-mini-card" data-ticker="${t}">
            <div>
              <div style="font-weight:700;font-size:0.9rem;">${t}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);">${s.name}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:var(--font-mono);font-weight:600;font-size:0.9rem;">$${s.price.toFixed(2)}</div>
              <div style="font-family:var(--font-mono);font-size:0.75rem;color:${isUp ? 'var(--green)' : 'var(--red)'};">${isUp ? '+' : ''}${change}%</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// --- NEWS PANEL ---
export function renderNewsPanel() {
  const news = getMarketNews();
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${ICONS.newspaper} Market News</span>
      </div>
      ${news.slice(0, 5).map(n => {
        const dotColor = n.sentiment === 'positive' ? 'var(--green)' : n.sentiment === 'negative' ? 'var(--red)' : 'var(--text-muted)';
        return `
          <div class="news-item">
            <div class="news-sentiment-dot" style="background:${dotColor};"></div>
            <div class="news-content">
              <div class="news-title">${n.title}</div>
              <div class="news-meta">${n.source} · ${n.time} · ${n.category || ''}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// --- AI SUMMARY CARD (for dashboard) ---
export function renderAISummaryCard() {
  return `
    <div class="insight-card">
      <div class="insight-card-header">
        <div class="insight-icon" style="background:var(--accent-glow);">
          ${ICONS.brain}
        </div>
        <div class="insight-card-title">Market brief</div>
        <span class="badge badge-blue">Illustrative</span>
      </div>
      <div class="insight-card-body">
        <p>Markets are showing <strong>mixed signals</strong> today. The technology sector continues to lead with AI-driven growth, while energy faces headwinds from declining oil prices.</p>
        <p style="margin-top:10px;">This example scenario illustrates an upside case in large-cap tech names, though elevated valuations suggest maintaining disciplined position sizing. The Fed's latest commentary hints at potential rate adjustments, which could benefit growth stocks if confirmed.</p>
        <p style="margin-top:10px;color:var(--text-muted);font-size:0.8rem;font-style:italic;">⚠️ This is a probabilistic market summary, not investment advice. All conclusions are scenario-based.</p>
      </div>
    </div>
  `;
}

// --- DISCLAIMER BAR ---
export function renderDisclaimer() {
  return `
    <div class="disclaimer-bar">
      <span class="sample-dot"></span><strong>Sample workspace</strong><span>Simulated prices, news, signals, and holdings. For exploration only.</span>
    </div>
  `;
}

// --- SCORE BAR ---
export function renderScoreBar(label, value, color) {
  return `
    <div class="score-bar">
      <span class="score-bar-label">${label}</span>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${value}%;background:${color};"></div>
      </div>
      <span class="score-bar-value" style="color:${color};">${value}</span>
    </div>
  `;
}

// --- SIGNAL BADGE ---
export function renderSignalBadge(signal) {
  return `
    <div class="signal-badge ${signal.class}">
      <span class="signal-dot"></span>
      ${signal.label}
    </div>
  `;
}

// --- WATCHLIST TOGGLE BUTTON ---
export function renderWatchlistBtn(ticker) {
  const inWatchlist = isInWatchlist(ticker);
  return `
    <button class="btn btn-secondary btn-sm watchlist-toggle" data-ticker="${ticker}">
      ${inWatchlist ? ICONS.starFilled : ICONS.star}
      ${inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
    </button>
  `;
}

export function initWatchlistToggle() {
  document.querySelectorAll('.watchlist-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const ticker = btn.dataset.ticker;
      if (isInWatchlist(ticker)) {
        removeFromWatchlist(ticker);
        btn.innerHTML = `${ICONS.star} Add to Watchlist`;
      } else {
        addToWatchlist(ticker);
        btn.innerHTML = `${ICONS.starFilled} In Watchlist`;
      }
    });
  });
}

