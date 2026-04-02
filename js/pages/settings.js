// ============================================================
// MarketPilot AI — Settings Page
// ============================================================

import { renderDisclaimer, ICONS } from '../components/index.js';
import { getSettings, updateSettings } from '../data/mockData.js';

export function renderSettings(navigate) {
  const s = getSettings();
  return `
    <div class="page-content animate-fade-in">
      ${renderDisclaimer()}
      <div class="page-heading">
        <div>
          <h1 class="page-title">Settings</h1>
          <p style="color:var(--text-muted);font-size:0.875rem;margin-top:2px;">Customize your MarketPilot AI experience</p>
        </div>
      </div>

      <div style="max-width:720px;">
        <!-- Analysis Preferences -->
        <div class="card settings-group" style="margin-bottom:20px;">
          <div class="settings-group-title">Analysis Preferences</div>

          <div class="settings-row">
            <div>
              <div class="settings-label">Risk Tolerance</div>
              <div class="settings-desc">Affects signal thresholds and alert sensitivity</div>
            </div>
            <div class="radio-group" id="risk-tolerance">
              ${['conservative','moderate','aggressive'].map(opt => `
                <div class="radio-option ${s.riskTolerance === opt ? 'active' : ''}" data-risk="${opt}" style="text-transform:capitalize;">${opt}</div>
              `).join('')}
            </div>
          </div>

          <div class="settings-row">
            <div>
              <div class="settings-label">Time Horizon</div>
              <div class="settings-desc">Influences which signals are prioritized in AI analysis</div>
            </div>
            <div class="radio-group" id="time-horizon">
              ${[{ val: 'intraday', label: 'Intraday' }, { val: 'swing', label: 'Swing' }, { val: 'longterm', label: 'Long-Term' }].map(opt => `
                <div class="radio-option ${s.timeHorizon === opt.val ? 'active' : ''}" data-horizon="${opt.val}">${opt.label}</div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Alert Settings -->
        <div class="card settings-group" style="margin-bottom:20px;">
          <div class="settings-group-title">Alert Preferences</div>

          ${[
            { key: 'alertsEnabled', label: 'Enable Alerts', desc: 'Master toggle for all alerts' },
            { key: 'rsiAlerts', label: 'RSI Alerts', desc: 'Notify when RSI enters overbought/oversold zones' },
            { key: 'priceAlerts', label: 'Price Alerts', desc: 'Alert when price crosses support or resistance' },
            { key: 'macdAlerts', label: 'MACD Crossover Alerts', desc: 'Alert on bullish or bearish MACD crossovers' },
            { key: 'volumeAlerts', label: 'Volume Spike Alerts', desc: 'Alert when volume significantly exceeds average' },
          ].map(item => `
            <div class="settings-row">
              <div>
                <div class="settings-label">${item.label}</div>
                <div class="settings-desc">${item.desc}</div>
              </div>
              <div class="toggle-switch ${s[item.key] ? 'active' : ''}" data-toggle="${item.key}"></div>
            </div>
          `).join('')}
        </div>

        <!-- Display Settings -->
        <div class="card settings-group" style="margin-bottom:20px;">
          <div class="settings-group-title">Display</div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Theme</div>
              <div class="settings-desc">Color theme for the interface</div>
            </div>
            <div class="radio-group">
              <div class="radio-option active">Dark</div>
              <div class="radio-option" style="opacity:0.4;cursor:not-allowed;" title="Coming soon">Light</div>
            </div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Default Chart Type</div>
              <div class="settings-desc">Preferred chart visualization</div>
            </div>
            <div class="radio-group">
              <div class="radio-option active">Line</div>
              <div class="radio-option" style="opacity:0.4;cursor:not-allowed;" title="Coming soon">Candle</div>
            </div>
          </div>
        </div>

        <!-- Compliance & Disclaimers -->
        <div class="card settings-group" style="margin-bottom:20px;">
          <div class="settings-group-title">Compliance & Disclaimers</div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Show Disclaimer Bar</div>
              <div class="settings-desc">Display "Not financial advice" bar on all pages</div>
            </div>
            <div class="toggle-switch active" style="cursor:not-allowed;opacity:0.7;" title="Cannot disable — required for compliance"></div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Show "Why This Insight?" Sections</div>
              <div class="settings-desc">Show explainability panels in AI analysis</div>
            </div>
            <div class="toggle-switch active" data-toggle="showWhy"></div>
          </div>
        </div>

        <!-- About -->
        <div class="card">
          <div class="settings-group-title">About MarketPilot AI</div>
          <div style="font-size:0.875rem;color:var(--text-secondary);line-height:1.8;">
            <p>MarketPilot AI v1.0.0</p>
            <p style="margin-top:8px;">Built for educational and informational purposes. All analysis is powered by probabilistic scoring models using technical indicators, mock market data, and simulated sentiment signals.</p>
            <p style="margin-top:8px;padding:12px;background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--radius-md);font-size:0.8rem;">
              ⚠️ <strong style="color:var(--red);">Disclaimer:</strong> MarketPilot AI does not provide investment advice, personalized recommendations, or guaranteed outcomes. All signals are probabilistic. Past model performance does not indicate future results. Always consult a licensed financial advisor before making investment decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initSettings(navigate) {
  // Risk tolerance
  document.querySelectorAll('#risk-tolerance .radio-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#risk-tolerance .radio-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      updateSettings({ riskTolerance: opt.dataset.risk });
    });
  });

  // Time horizon
  document.querySelectorAll('#time-horizon .radio-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('#time-horizon .radio-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      updateSettings({ timeHorizon: opt.dataset.horizon });
    });
  });

  // Toggle switches
  document.querySelectorAll('.toggle-switch[data-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      const key = toggle.dataset.toggle;
      const current = getSettings()[key];
      updateSettings({ [key]: !current });
    });
  });
}
