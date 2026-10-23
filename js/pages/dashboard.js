// ============================================================
// MarketPilot AI — Dashboard Page
// ============================================================

import {
  renderMarketCards, renderSectorHeatmap, renderTopMovers,
  renderWatchlistPanel, renderNewsPanel, renderAISummaryCard,
  renderDisclaimer, initSparklines, ICONS
} from '../components/index.js';
import { STOCKS, getWatchlist } from '../data/mockData.js';
import { generateScores, getSignalState, getTrendDirection } from '../services/aiEngine.js';

export function renderDashboard(navigate) {
  return `
    <div class="page-content animate-fade-in">
      ${renderDisclaimer()}
      <div class="page-heading">
        <div>
          <h1 class="page-title">Your market, at a glance.</h1>
          <p style="color:var(--text-muted);font-size:0.875rem;margin-top:2px;">Today · ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--green);">
            <span style="width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 2s infinite;display:inline-block;"></span>
            Sample market snapshot
          </div>
        </div>
      </div>

      <!-- Market Overview -->
      <section style="margin-bottom:24px;">
        <div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Market Overview</div>
        ${renderMarketCards()}
      </section>

      <!-- Main grid -->
      <div class="dashboard-grid">
        <div class="dashboard-main">
          <!-- AI Summary -->
          ${renderAISummaryCard()}

          <!-- Top Movers -->
          ${renderTopMovers(navigate)}

          <!-- Sector Performance -->
          ${renderSectorHeatmap()}

          <!-- Market News -->
          ${renderNewsPanel()}
        </div>

        <div class="dashboard-aside">
          <!-- Watchlist -->
          ${renderWatchlistPanel(navigate)}

          <!-- Quick Signal Panel -->
          ${renderQuickSignals(navigate)}

          <!-- Portfolio Summary -->
          ${renderPortfolioSummary(navigate)}
        </div>
      </div>
    </div>
  `;
}

function renderQuickSignals(navigate) {
  const tickers = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMD'];
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${ICONS.zap} Signal Snapshot</span>
        <span class="card-action" data-page="scanner">Full Scanner</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${tickers.map(t => {
          const s = STOCKS[t];
          const scores = generateScores(t);
          const signal = getSignalState(scores);
          const trend = getTrendDirection(scores);
          const change = ((Math.random() - 0.42) * 5).toFixed(2);
          const isUp = parseFloat(change) >= 0;
          return `
            <div class="stock-row" data-ticker="${t}" style="border-bottom:1px solid var(--border-subtle);border-radius:0;padding:10px 4px;">
              <div style="flex:1;">
                <div style="font-weight:700;font-size:0.85rem;">${t}</div>
                <div style="font-size:0.7rem;color:var(--text-muted);">
                  <span class="${trend.label === 'Bullish' ? 'text-green' : trend.label === 'Bearish' ? 'text-red' : 'text-amber'}">${trend.icon} ${trend.label}</span>
                </div>
              </div>
              <div>
                <div class="signal-badge ${signal.class}" style="padding:3px 10px;font-size:0.65rem;">
                  <span class="signal-dot" style="width:6px;height:6px;"></span>
                  ${signal.label}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderPortfolioSummary(navigate) {
  const totalValue = 184620;
  const totalGain = 22340;
  const totalGainPct = 13.8;

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${ICONS.briefcase} Portfolio</span>
        <span class="card-action" data-page="portfolio">View All</span>
      </div>
      <div style="text-align:center;padding:16px 0;border-bottom:1px solid var(--border-subtle);margin-bottom:16px;">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">Total Value</div>
        <div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;">$${totalValue.toLocaleString()}</div>
        <div style="font-family:var(--font-mono);font-size:0.9rem;color:var(--green);margin-top:4px;">
          +$${totalGain.toLocaleString()} (+${totalGainPct}%) all time
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:12px;">
        <span style="color:var(--text-muted);">Positions</span>
        <span style="font-weight:600;">5 stocks</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:12px;">
        <span style="color:var(--text-muted);">Today's P&amp;L</span>
        <span style="color:var(--green);font-family:var(--font-mono);font-weight:600;">+$842.30 (+0.46%)</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;">
        <span style="color:var(--text-muted);">Risk Level</span>
        <span class="badge badge-amber">Moderate</span>
      </div>
    </div>
  `;
}

export function initDashboard(navigate) {
  // Init sparklines
  setTimeout(() => initSparklines(), 50);

  // Stock row clicks
  document.querySelectorAll('.stock-row[data-ticker]').forEach(row => {
    row.addEventListener('click', () => navigate('stock', row.dataset.ticker));
  });

  // Watchlist card clicks
  document.querySelectorAll('.watchlist-mini-card[data-ticker]').forEach(card => {
    card.addEventListener('click', () => navigate('stock', card.dataset.ticker));
  });
}

