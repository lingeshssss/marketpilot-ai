// ============================================================
// MarketPilot AI — Watchlist Page
// ============================================================

import { renderDisclaimer, ICONS, initSparklines } from '../components/index.js';
import { STOCKS, getWatchlist, addToWatchlist, removeFromWatchlist, generatePriceHistory } from '../data/mockData.js';
import { generateScores, getSignalState, getTrendDirection } from '../services/aiEngine.js';

export function renderWatchlist(navigate) {
  const tickers = getWatchlist();

  const watchData = tickers.map(t => {
    const s = STOCKS[t];
    if (!s) return null;
    const scores = generateScores(t);
    const signal = getSignalState(scores);
    const trend = getTrendDirection(scores);
    const change = +((Math.random() - 0.43) * 5).toFixed(2);
    const hist = generatePriceHistory(s.price, 14, 0.012).map(d => d.close);
    return { ...s, scores, signal, trend, change, sparkData: hist };
  }).filter(Boolean);

  return `
    <div class="page-content animate-fade-in">
      ${renderDisclaimer()}
      <div class="page-heading">
        <div>
          <h1 class="page-title">Watchlist</h1>
          <p style="color:var(--text-muted);font-size:0.875rem;margin-top:2px;">${tickers.length} stocks monitored</p>
        </div>
        <button class="btn btn-secondary btn-sm" id="add-stock-btn">
          ${ICONS.plus} Add Stock
        </button>
      </div>

      ${tickers.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">⭐</div>
          <div class="empty-state-title">Your watchlist is empty</div>
          <div class="empty-state-desc">Search for stocks in the top bar and click "Add to Watchlist" on any stock detail page.</div>
          <button class="btn btn-primary" style="margin-top:20px;" data-page="dashboard">Go to Dashboard</button>
        </div>
      ` : `
        <div class="grid-auto stagger">
          ${watchData.map(s => {
    const isUp = s.change >= 0;
    return `
              <div class="card" style="cursor:pointer;" data-ticker="${s.ticker}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                  <div>
                    <div style="font-weight:700;font-size:1.1rem;">${s.ticker}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${s.name}</div>
                  </div>
                  <button class="remove-watchlist btn btn-ghost btn-sm" data-ticker="${s.ticker}" style="color:var(--text-muted);padding:4px;">
                    ${ICONS.x}
                  </button>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                  <div>
                    <div style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;">$${s.price.toFixed(2)}</div>
                    <div style="font-family:var(--font-mono);font-size:0.85rem;color:${isUp ? 'var(--green)' : 'var(--red)'};">
                      ${isUp ? '+' : ''}${s.change}%
                    </div>
                  </div>
                  <canvas class="sparkline-canvas" data-values="${s.sparkData.join(',')}" data-color="${isUp ? '#34d399' : '#f87171'}" width="80" height="40" style="width:80px;height:40px;"></canvas>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border-subtle);">
                  <div class="signal-badge ${s.signal.class}" style="font-size:0.65rem;padding:3px 10px;">
                    <span class="signal-dot" style="width:6px;height:6px;"></span>
                    ${s.signal.label}
                  </div>
                  <span class="${s.trend.label === 'Bullish' ? 'text-green' : s.trend.label === 'Bearish' ? 'text-red' : 'text-amber'}" style="font-size:0.8rem;font-weight:600;">
                    ${s.trend.icon} ${s.trend.label}
                  </span>
                </div>

                <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                  <span style="font-size:0.7rem;color:var(--text-muted);">Opp: <span style="color:var(--accent-primary);font-weight:600;">${s.scores.opportunity}</span></span>
                  <span style="font-size:0.7rem;color:var(--text-muted);">Risk: <span style="color:${s.scores.risk > 60 ? 'var(--red)' : s.scores.risk > 40 ? 'var(--amber)' : 'var(--green)'};font-weight:600;">${s.scores.risk}</span></span>
                  <span style="font-size:0.7rem;color:var(--text-muted);">Momentum: <span style="font-weight:600;">${s.scores.momentum}</span></span>
                </div>
              </div>
            `;
  }).join('')}
        </div>
      `}
    </div>
  `;
}

export function initWatchlist(navigate) {
  setTimeout(() => initSparklines(), 50);

  // Card clicks to detail
  document.querySelectorAll('.card[data-ticker]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.remove-watchlist')) {
        navigate('stock', card.dataset.ticker);
      }
    });
  });

  // Remove from watchlist
  document.querySelectorAll('.remove-watchlist').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromWatchlist(btn.dataset.ticker);
      navigate('watchlist');
    });
  });

}

