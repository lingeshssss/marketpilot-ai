// ============================================================
// MarketPilot AI — Portfolio Page
// ============================================================

import { renderDisclaimer, ICONS } from '../components/index.js';
import { getPortfolio, STOCKS } from '../data/mockData.js';
import { generateScores, getSignalState } from '../services/aiEngine.js';

export function renderPortfolio(navigate) {
  const positions = getPortfolio();
  const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);
  const totalCost = positions.reduce((a, p) => a + p.costBasis, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = ((totalGain / totalCost) * 100).toFixed(2);
  const isUp = totalGain >= 0;

  // Sector breakdown
  const sectors = {};
  positions.forEach(p => {
    sectors[p.sector] = (sectors[p.sector] || 0) + p.currentValue;
  });
  const sectorPcts = Object.entries(sectors).map(([name, val]) => ({
    name, pct: +((val / totalValue) * 100).toFixed(1)
  })).sort((a, b) => b.pct - a.pct);

  return `
    <div class="page-content animate-fade-in">
      ${renderDisclaimer()}
      <div class="page-heading">
        <div>
          <h1 class="page-title">Portfolio</h1>
          <p style="color:var(--text-muted);font-size:0.875rem;margin-top:2px;">Mock positions · Track simulated performance</p>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid-4 stagger" style="margin-bottom:24px;">
        <div class="card">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">TOTAL VALUE</div>
          <div style="font-family:var(--font-mono);font-size:1.6rem;font-weight:700;">$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div class="card">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">TOTAL GAIN/LOSS</div>
          <div style="font-family:var(--font-mono);font-size:1.6rem;font-weight:700;color:${isUp ? 'var(--green)' : 'var(--red)'};">
            ${isUp ? '+' : ''}$${Math.abs(totalGain).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style="font-size:0.8rem;font-family:var(--font-mono);color:${isUp ? 'var(--green)' : 'var(--red)'};">${isUp ? '+' : ''}${totalGainPct}%</div>
        </div>
        <div class="card">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">POSITIONS</div>
          <div style="font-family:var(--font-mono);font-size:1.6rem;font-weight:700;">${positions.length}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">Active holdings</div>
        </div>
        <div class="card">
          <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">TODAY'S P&L</div>
          <div style="font-family:var(--font-mono);font-size:1.6rem;font-weight:700;color:var(--green);">+$842.30</div>
          <div style="font-size:0.8rem;font-family:var(--font-mono);color:var(--green);">+0.46%</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-main">
          <!-- Positions Table -->
          <div class="card" style="padding:0;overflow:hidden;">
            <div style="padding:20px 24px;border-bottom:1px solid var(--border-subtle);">
              <span class="card-title">Holdings</span>
            </div>
            <div style="overflow-x:auto;">
              <table class="scanner-table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Shares</th>
                    <th>Avg Cost</th>
                    <th>Current Price</th>
                    <th>Current Value</th>
                    <th>Gain/Loss</th>
                    <th>%</th>
                    <th>Signal</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${positions.map(p => {
                    const isPositive = p.gain >= 0;
                    const scores = generateScores(p.ticker);
                    const signal = getSignalState(scores);
                    return `
                      <tr data-ticker="${p.ticker}" class="scanner-row" style="cursor:pointer;">
                        <td>
                          <div style="font-weight:700;">${p.ticker}</div>
                          <div style="font-size:0.72rem;color:var(--text-muted);">${p.sector}</div>
                        </td>
                        <td style="font-family:var(--font-mono);">${p.shares}</td>
                        <td style="font-family:var(--font-mono);">$${p.avgCost.toFixed(2)}</td>
                        <td style="font-family:var(--font-mono);">$${p.currentPrice.toFixed(2)}</td>
                        <td style="font-family:var(--font-mono);font-weight:600;">$${p.currentValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td style="font-family:var(--font-mono);color:${isPositive ? 'var(--green)' : 'var(--red)'};">
                          ${isPositive ? '+' : ''}$${Math.abs(p.gain).toFixed(2)}
                        </td>
                        <td style="font-family:var(--font-mono);font-weight:600;color:${isPositive ? 'var(--green)' : 'var(--red)'};">
                          ${isPositive ? '+' : ''}${p.gainPct}%
                        </td>
                        <td>
                          <div class="signal-badge ${signal.class}" style="font-size:0.65rem;padding:3px 10px;white-space:nowrap;">
                            <span class="signal-dot" style="width:6px;height:6px;"></span>
                            ${signal.label}
                          </div>
                        </td>
                        <td>
                          <button class="btn btn-primary btn-sm" data-ticker="${p.ticker}" style="font-size:0.75rem;padding:5px 12px;">
                            Analyze
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- AI Risk Assessment -->
          <div class="insight-card">
            <div class="insight-card-header">
              <div class="insight-icon" style="background:var(--accent-glow);">${ICONS.brain}</div>
              <div class="insight-card-title">AI Portfolio Risk Assessment</div>
              <span class="badge badge-amber">Mock Analysis</span>
            </div>
            <div class="insight-card-body">
              <p>Your mock portfolio shows <strong>moderate concentration risk</strong> in the Technology sector (${sectorPcts.find(s => s.name === 'Technology')?.pct || 'N/A'}% of holdings). While tech exposure has historically driven growth, elevated volatility in this sector could amplify drawdowns during sector rotations.</p>
              <p style="margin-top:10px;">Probability suggests that diversifying into defensive sectors (Healthcare, Consumer Staples) could reduce overall portfolio volatility. Consider monitoring positions where sell pressure scores exceed 60.</p>
            </div>
            <div class="insight-why">
              <div class="insight-why-title">${ICONS.info} Why This Insight</div>
              <div class="insight-why-text">Concentration risk assessment is based on sector allocation percentages. Heavy weighting in one sector amplifies both gains and losses relative to a diversified benchmark. This is educational information — not personalized advice.</div>
            </div>
          </div>
        </div>

        <div class="dashboard-aside">
          <!-- Sector Breakdown -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Sector Allocation</span>
            </div>
            ${sectorPcts.map(s => `
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:6px;">
                  <span>${s.name}</span>
                  <span style="font-family:var(--font-mono);font-weight:600;">${s.pct}%</span>
                </div>
                <div class="confidence-meter">
                  <div class="confidence-meter-fill" style="width:${s.pct}%;background:var(--accent-gradient);"></div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Risk Alerts -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Risk Alerts</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${positions.filter((_, i) => i < 3).map(p => {
                const scores = generateScores(p.ticker);
                const isRisky = scores.sellPressure > 55;
                return `
                  <div style="padding:10px;background:${isRisky ? 'var(--amber-bg)' : 'var(--green-bg)'};border:1px solid ${isRisky ? 'var(--amber-border)' : 'var(--green-border)'};border-radius:var(--radius-md);">
                    <div style="font-weight:600;font-size:0.85rem;color:${isRisky ? 'var(--amber)' : 'var(--green)'};">${p.ticker} ${isRisky ? '⚠ Watch' : '✓ OK'}</div>
                    <div style="font-size:0.77rem;color:var(--text-muted);margin-top:3px;">
                      ${isRisky ? `Sell pressure elevated (${scores.sellPressure}/100). Consider monitoring for exit signals.` : `Position appears stable. No immediate risk signals detected.`}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initPortfolio(navigate) {
  document.querySelectorAll('.scanner-row[data-ticker]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (!e.target.closest('button')) navigate('stock', row.dataset.ticker);
    });
  });
  document.querySelectorAll('button[data-ticker]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigate('stock', btn.dataset.ticker);
    });
  });
}
