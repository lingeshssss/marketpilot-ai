// ============================================================
// MarketPilot AI — Scanner Page
// ============================================================

import { renderDisclaimer, renderSignalBadge, ICONS } from '../components/index.js';
import { scanOpportunities } from '../services/aiEngine.js';

const FILTERS = [
  'RSI Oversold Zone', 'RSI Overbought', 'Strong Trend',
  'High Opportunity', 'High Volatility', 'Positive Sentiment',
  'Sell Pressure', 'Large Cap', 'Mid Cap', 'Small Cap'
];

let activeFilters = [];

export function renderScanner(navigate) {
  const results = scanOpportunities({ activeFilters });
  return `
    <div class="page-content animate-fade-in">
      ${renderDisclaimer()}
      <div class="page-heading">
        <div>
          <h1 class="page-title">Opportunity Scanner</h1>
          <p style="color:var(--text-muted);font-size:0.875rem;margin-top:2px;">Filter and rank stocks by signal strength, momentum, and risk profile</p>
        </div>
        <div class="badge badge-blue" style="font-size:0.8rem;padding:6px 14px;">
          ${results.length} opportunities found
        </div>
      </div>

      <!-- Filters -->
      <div class="card" style="margin-bottom:24px;">
        <div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:12px;">FILTER BY SIGNAL</div>
        <div class="filter-chips" id="filter-chips">
          ${FILTERS.map(f => `
            <div class="filter-chip ${activeFilters.includes(f) ? 'active' : ''}" data-filter="${f}">${f}</div>
          `).join('')}
          ${activeFilters.length > 0 ? `<div class="filter-chip" id="clear-filters" style="color:var(--red);border-color:var(--red-border);">✕ Clear All</div>` : ''}
        </div>
      </div>

      <!-- Scanner Table -->
      <div class="card" style="overflow-x:auto;padding:0;">
        <table class="scanner-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticker</th>
              <th>Company</th>
              <th>Price</th>
              <th>Change</th>
              <th>Signal</th>
              <th>Trend</th>
              <th>Opportunity</th>
              <th>Risk</th>
              <th>Momentum</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="scanner-tbody">
            ${results.map((r, i) => {
              const isUp = r.change >= 0;
              const oppColor = r.scores.opportunity > 65 ? 'var(--green)' : r.scores.opportunity > 45 ? 'var(--amber)' : 'var(--text-muted)';
              const riskColor = r.scores.risk > 65 ? 'var(--red)' : r.scores.risk > 45 ? 'var(--amber)' : 'var(--green)';
              const momColor = r.scores.momentum > 65 ? 'var(--green)' : r.scores.momentum > 45 ? 'var(--amber)' : 'var(--red)';
              return `
                <tr data-ticker="${r.ticker}" class="scanner-row">
                  <td style="color:var(--text-muted);font-size:0.8rem;">${i + 1}</td>
                  <td class="col-ticker">${r.ticker}</td>
                  <td style="color:var(--text-secondary);font-size:0.8rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.name}</td>
                  <td class="col-price">$${r.price.toFixed(2)}</td>
                  <td class="col-change ${isUp ? 'text-green' : 'text-red'}">${isUp ? '+' : ''}${r.change.toFixed(2)}%</td>
                  <td>
                    <div class="signal-badge ${r.signal.class}" style="font-size:0.65rem;padding:3px 10px;white-space:nowrap;">
                      <span class="signal-dot" style="width:6px;height:6px;"></span>
                      ${r.signal.label}
                    </div>
                  </td>
                  <td>
                    <span class="${r.trend.label === 'Bullish' ? 'text-green' : r.trend.label === 'Bearish' ? 'text-red' : 'text-amber'}" style="font-size:0.8rem;font-weight:600;">
                      ${r.trend.icon} ${r.trend.label}
                    </span>
                  </td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="width:50px;height:5px;background:var(--bg-surface);border-radius:var(--radius-full);">
                        <div style="width:${r.scores.opportunity}%;height:100%;background:${oppColor};border-radius:var(--radius-full);"></div>
                      </div>
                      <span style="font-family:var(--font-mono);font-size:0.8rem;color:${oppColor};">${r.scores.opportunity}</span>
                    </div>
                  </td>
                  <td>
                    <span style="font-family:var(--font-mono);font-size:0.8rem;color:${riskColor};">${r.scores.risk}</span>
                  </td>
                  <td>
                    <span style="font-family:var(--font-mono);font-size:0.8rem;color:${momColor};">${r.scores.momentum}</span>
                  </td>
                  <td style="max-width:200px;font-size:0.78rem;color:var(--text-muted);line-height:1.4;">${r.reason.slice(0, 80)}${r.reason.length > 80 ? '...' : ''}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" data-ticker="${r.ticker}" style="white-space:nowrap;">
                      Analyze ${ICONS.arrowUp.replace('M18 15l-6-6-6 6','M12 5l7 7-7 7').replace('18','14')}
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${results.length === 0 ? `
          <div class="empty-state" style="padding:60px;">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">No results</div>
            <div class="empty-state-desc">No stocks matched all selected filters. Try clearing some filters.</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function initScanner(navigate) {
  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.id === 'clear-filters') {
        activeFilters = [];
      } else {
        const filter = chip.dataset.filter;
        if (activeFilters.includes(filter)) {
          activeFilters = activeFilters.filter(f => f !== filter);
        } else {
          activeFilters.push(filter);
        }
      }
      navigate('scanner');
    });
  });

  // Row clicks
  document.querySelectorAll('.scanner-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        navigate('stock', row.dataset.ticker);
      }
    });
  });

  // Analyze buttons
  document.querySelectorAll('.scanner-tbody button[data-ticker]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate('stock', btn.dataset.ticker);
    });
  });
}
