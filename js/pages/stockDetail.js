const chartColor = token => getComputedStyle(document.documentElement).getPropertyValue(token).trim();
// ============================================================
// MarketPilot AI — Stock Detail Page
// ============================================================

import {
  renderDisclaimer, renderSignalBadge, renderScoreBar,
  renderWatchlistBtn, initWatchlistToggle, ICONS
} from '../components/index.js';
import {
  STOCKS, generatePriceHistory, generateIntradayData,
  calculateSMA, calculateEMA, calculateRSI, calculateMACD,
  calculateBollingerBands, calculateSupportResistance,
  getNewsForStock, isInWatchlist
} from '../data/mockData.js';
import {
  generateInsight, generateSellTiming, generateScores,
  getSignalState, getTrendDirection, getRiskScore
} from '../services/aiEngine.js';

// Active chart instance
let activeChart = null;
let priceHistoryCache = {};

export function renderStockDetail(ticker, navigate) {
  const stock = STOCKS[ticker];
  if (!stock) {
    return `
      <div class="page-content">
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-title">Stock not found</div>
          <div class="empty-state-desc">Could not find data for "${ticker}". Try searching for a different symbol.</div>
          <button class="btn btn-primary" style="margin-top:20px;" data-page="dashboard">Back to Dashboard</button>
        </div>
      </div>
    `;
  }

  const scores = generateScores(ticker);
  const signal = getSignalState(scores);
  const trend = getTrendDirection(scores);
  const riskScore = getRiskScore(scores);
  const insight = generateInsight(ticker);
  const sellTiming = generateSellTiming(ticker);

  // Simulated price change
  const changePct = +((Math.random() - 0.42) * 4).toFixed(2);
  const changeDollar = +(stock.price * changePct / 100).toFixed(2);
  const isUp = changePct >= 0;

  return `
    <div class="page-content animate-fade-in" id="stock-detail-page">
      ${renderDisclaimer()}

      <!-- Stock Header -->
      <div class="stock-header">
        <div class="stock-title-group">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
            <button class="btn btn-ghost btn-sm" data-page="dashboard" style="padding:4px 8px;gap:4px;font-size:0.75rem;">
              ${ICONS.arrowUp.replace('m18 15-6-6-6 6','m15 18-6-6 6-6').replace('18','16')} Back
            </button>
            <span class="stock-ticker">${ticker}</span>
            <span class="badge badge-neutral">${stock.sector}</span>
            ${renderSignalBadge(signal)}
          </div>
          <h1 class="stock-company-name">${stock.name}</h1>
          <div class="stock-price-group" style="margin-top:8px;">
            <span class="stock-price">$${stock.price.toFixed(2)}</span>
            <span class="stock-change ${isUp ? 'text-green' : 'text-red'}">
              ${isUp ? '+' : ''}$${changeDollar} (${isUp ? '+' : ''}${changePct}%)
            </span>
            <span style="font-size:0.75rem;color:var(--text-muted);">Today</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${renderWatchlistBtn(ticker)}
          <button class="btn btn-primary btn-sm" id="analyze-btn">
            ${ICONS.brain} AI Analysis
          </button>
        </div>
      </div>

      <!-- Stats Row -->
      <div class="card" style="margin-bottom:24px;">
        <div class="stock-stats-grid">
          ${[
            { label: 'Market Cap', value: stock.marketCap },
            { label: 'Volume', value: (stock.volume / 1000000).toFixed(1) + 'M' },
            { label: 'Avg Volume', value: (stock.avgVolume / 1000000).toFixed(1) + 'M' },
            { label: 'P/E Ratio', value: stock.pe > 0 ? stock.pe.toFixed(1) : 'N/A' },
            { label: 'EPS', value: stock.eps > 0 ? '$' + stock.eps.toFixed(2) : '$('+Math.abs(stock.eps).toFixed(2)+')' },
            { label: '52W High', value: '$' + stock.high52.toFixed(2) },
            { label: '52W Low', value: '$' + stock.low52.toFixed(2) },
            { label: 'Analyst Target', value: '$' + stock.analystTarget.toFixed(2) },
            { label: 'Beta', value: stock.beta.toFixed(2) },
            { label: 'Dividend Yield', value: stock.dividendYield ? stock.dividendYield + '%' : '—' },
            { label: 'Risk Score', value: `${riskScore}/10`, highlight: riskScore > 6 ? 'red' : riskScore > 4 ? 'amber' : 'green' },
            { label: 'Trend', value: trend.label, highlight: trend.label === 'Bullish' ? 'green' : trend.label === 'Bearish' ? 'red' : 'amber' },
          ].map(stat => `
            <div class="stock-stat">
              <span class="stock-stat-label">${stat.label}</span>
              <span class="stock-stat-value ${stat.highlight ? 'text-' + stat.highlight : ''}">${stat.value}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Main Detail Grid -->
      <div class="stock-detail-grid">
        <div class="stock-detail-main">

          <!-- Price Chart Card -->
          <div class="card" id="chart-card">
            <div class="card-header">
              <span class="card-title">Price Chart</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <div id="indicator-toggles" style="display:flex;gap:4px;">
                  <button class="btn btn-sm btn-ghost indicator-toggle active" data-indicator="sma" style="font-size:0.72rem;padding:4px 10px;">SMA</button>
                  <button class="btn btn-sm btn-ghost indicator-toggle" data-indicator="ema" style="font-size:0.72rem;padding:4px 10px;">EMA</button>
                  <button class="btn btn-sm btn-ghost indicator-toggle" data-indicator="bb" style="font-size:0.72rem;padding:4px 10px;">BB</button>
                </div>
              </div>
            </div>
            <div class="chart-timefilter" id="time-filter">
              ${['1D','1W','1M','3M','6M','1Y','5Y'].map((t, i) =>
                `<button class="chart-timefilter-btn ${i === 0 ? 'active' : ''}" data-period="${t}">${t}</button>`
              ).join('')}
            </div>
            <div class="chart-container">
              <canvas id="price-chart" style="max-height:320px;"></canvas>
            </div>
          </div>

          <!-- RSI + MACD Row -->
          <div class="grid-2" style="gap:16px;">
            <div class="card">
              <div class="card-header">
                <span class="card-title">RSI (14)</span>
                <span id="rsi-badge" class="badge badge-neutral">Loading...</span>
              </div>
              <canvas id="rsi-chart" style="max-height:120px;"></canvas>
            </div>
            <div class="card">
              <div class="card-header">
                <span class="card-title">MACD</span>
                <span id="macd-badge" class="badge badge-neutral">Loading...</span>
              </div>
              <canvas id="macd-chart" style="max-height:120px;"></canvas>
            </div>
          </div>

          <!-- Support / Resistance -->
          <div class="card" id="sr-card">
            <div class="card-header">
              <span class="card-title">${ICONS.target} Support & Resistance</span>
            </div>
            <div id="sr-content" style="display:flex;flex-direction:column;gap:10px;">
              <div class="skeleton" style="height:40px;"></div>
              <div class="skeleton" style="height:40px;"></div>
            </div>
          </div>

          <!-- AI Insight Engine -->
          ${renderAIInsightSection(insight)}

          <!-- Sell Timing Intelligence -->
          ${renderSellTimingSection(sellTiming)}
        </div>

        <div class="stock-detail-aside">
          <!-- Signal Panel -->
          ${renderSignalPanel(scores, signal, trend)}

          <!-- Confidence Score -->
          ${renderConfidenceCard(insight)}

          <!-- Timeframe Outlooks -->
          ${renderTimeframeCard(insight)}

          <!-- News -->
          ${renderStockNews(ticker)}
        </div>
      </div>
    </div>
  `;
}

function renderAIInsightSection(insight) {
  if (!insight) return '';
  const { bullCase, bearCase, outlook, technicalSummary, sentimentSummary,
    entryZone, sellZone, stopLoss, whyReasons } = insight;

  return `
    <div class="insight-card" id="ai-insight">
      <div class="insight-card-header">
        <div class="insight-icon" style="background:var(--accent-glow);">${ICONS.brain}</div>
        <div class="insight-card-title">AI Insight Engine</div>
        <span class="badge badge-blue">AI</span>
      </div>

      <!-- Tabs -->
      <div class="tabs" id="insight-tabs">
        <div class="tab active" data-tab="overview">Overview</div>
        <div class="tab" data-tab="cases">Bull / Bear</div>
        <div class="tab" data-tab="zones">Price Zones</div>
        <div class="tab" data-tab="why">Why</div>
      </div>

      <div id="insight-tab-content">
        <!-- Overview -->
        <div class="tab-panel active" data-panel="overview">
          <div class="insight-card-body">
            <p><strong>Overall Outlook</strong></p>
            <p style="margin-top:6px;">${insight.outlook}</p>
            <p style="margin-top:14px;"><strong>Technical Summary</strong></p>
            <p style="margin-top:6px;">${insight.technicalSummary}</p>
            <p style="margin-top:14px;"><strong>Sentiment Summary</strong></p>
            <p style="margin-top:6px;">${insight.sentimentSummary}</p>
          </div>
          <div class="insight-why">
            <div class="insight-why-title">${ICONS.info} Confidence Note</div>
            <div class="insight-why-text">This analysis is based on probabilistic scoring models. Confidence score: ${insight.confidence}/100. Higher confidence does not guarantee accuracy.</div>
          </div>
        </div>

        <!-- Bull / Bear -->
        <div class="tab-panel" data-panel="cases" style="display:none;">
          <div style="display:flex;flex-direction:column;gap:16px;" class="insight-card-body">
            <div style="background:var(--green-bg);border:1px solid var(--green-border);border-radius:var(--radius-md);padding:16px;">
              <div style="font-weight:600;color:var(--green);margin-bottom:8px;">🐂 Potential Bull Case</div>
              <p>${bullCase}</p>
            </div>
            <div style="background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--radius-md);padding:16px;">
              <div style="font-weight:600;color:var(--red);margin-bottom:8px;">🐻 Potential Bear Case</div>
              <p>${bearCase}</p>
            </div>
          </div>
          <div class="insight-why" style="margin-top:16px;">
            <div class="insight-why-title">${ICONS.info} Important</div>
            <div class="insight-why-text">Bull and bear cases are probabilistic scenarios — not predictions. Either outcome remains possible, and real-world results depend on many factors beyond this model.</div>
          </div>
        </div>

        <!-- Price Zones -->
        <div class="tab-panel" data-panel="zones" style="display:none;">
          <div class="insight-card-body">
            <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:14px;">Price zones are estimated based on technical analysis. They are possible areas of interest — not buy/sell targets.</p>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="background:var(--green-bg);border:1px solid var(--green-border);border-radius:var(--radius-md);padding:14px;">
                <div style="font-size:0.7rem;color:var(--green);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Possible Entry Zone</div>
                <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--green);">$${insight.entryZone.low} – $${insight.entryZone.high}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">Potential area of interest if trend remains intact. Not a guaranteed support zone.</div>
              </div>
              <div style="background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--radius-md);padding:14px;">
                <div style="font-size:0.7rem;color:var(--amber);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Possible Profit-Taking Zone</div>
                <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--amber);">$${insight.sellZone.low} – $${insight.sellZone.high}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">Area where momentum may face resistance. Probability of supply increasing in this range.</div>
              </div>
              <div style="background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--radius-md);padding:14px;">
                <div style="font-size:0.7rem;color:var(--red);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Possible Stop-Loss Zone</div>
                <div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:var(--red);">$${insight.stopLoss}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">Suggested risk management level. A close below this may signal trend deterioration.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Why -->
        <div class="tab-panel" data-panel="why" style="display:none;">
          <div class="insight-card-body">
            <p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:14px;">Transparent explanations for each signal factor:</p>
            <div style="display:flex;flex-direction:column;gap:12px;">
              ${whyReasons.map(r => `
                <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:14px;">
                  <div style="font-weight:600;font-size:0.85rem;margin-bottom:4px;color:var(--accent-primary);">${r.factor}</div>
                  <div style="font-size:0.8rem;color:var(--text-secondary);">${r.detail}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSellTimingSection(sellTiming) {
  if (!sellTiming) return '';
  const warningColor = sellTiming.overallWarningLevel === 'elevated' ? 'var(--red)' : sellTiming.overallWarningLevel === 'moderate' ? 'var(--amber)' : 'var(--green)';

  return `
    <div class="sell-timing-card" id="sell-timing">
      <div class="insight-card-header" style="margin-bottom:16px;">
        <div class="insight-icon" style="background:var(--amber-bg);">🎯</div>
        <div class="insight-card-title">Sell Timing Intelligence</div>
        <span class="badge" style="background:${sellTiming.overallWarningLevel === 'elevated' ? 'var(--red-bg)' : sellTiming.overallWarningLevel === 'moderate' ? 'var(--amber-bg)' : 'var(--green-bg)'};color:${warningColor};border-color:${warningColor}40;">
          ${sellTiming.overallWarningLevel.charAt(0).toUpperCase() + sellTiming.overallWarningLevel.slice(1)} Risk
        </span>
      </div>
      <div style="background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;font-size:0.75rem;color:var(--text-muted);">
        ⚠️ Sell timing signals are based on probabilistic models. They indicate potential exit zones — not instructions to sell. Always consider your own risk tolerance and investment goals.
      </div>
      ${sellTiming.items.map(item => {
        const isWarning = item.severity === 'warning';
        const bgColor = isWarning ? 'var(--amber-bg)' : item.severity === 'info' ? 'var(--blue-bg)' : 'var(--green-bg)';
        const borderColor = isWarning ? 'var(--amber-border)' : item.severity === 'info' ? 'var(--blue-border)' : 'var(--green-border)';
        const textColor = isWarning ? 'var(--amber)' : item.severity === 'info' ? 'var(--blue)' : 'var(--green)';
        return `
          <div class="sell-timing-item">
            <div class="sell-timing-icon" style="background:${item.iconBg};">${item.icon}</div>
            <div class="sell-timing-content">
              <div class="sell-timing-label" style="color:${textColor};">${item.label}</div>
              <div class="sell-timing-value">${item.value}</div>
            </div>
            ${isWarning ? `<span class="badge badge-amber" style="flex-shrink:0;">Watch</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSignalPanel(scores, signal, trend) {
  const scoreItems = [
    { label: 'Trend', value: scores.trend, color: scores.trend > 60 ? 'var(--green)' : scores.trend > 40 ? 'var(--amber)' : 'var(--red)' },
    { label: 'Momentum', value: scores.momentum, color: scores.momentum > 60 ? 'var(--green)' : scores.momentum > 40 ? 'var(--amber)' : 'var(--red)' },
    { label: 'Sentiment', value: scores.sentiment, color: scores.sentiment > 60 ? 'var(--green)' : scores.sentiment > 40 ? 'var(--amber)' : 'var(--red)' },
    { label: 'Sell Pressure', value: scores.sellPressure, color: scores.sellPressure > 60 ? 'var(--red)' : scores.sellPressure > 40 ? 'var(--amber)' : 'var(--green)' },
    { label: 'Opportunity', value: scores.opportunity, color: scores.opportunity > 60 ? 'var(--green)' : scores.opportunity > 40 ? 'var(--amber)' : 'var(--red)' },
    { label: 'Risk', value: scores.risk, color: scores.risk > 60 ? 'var(--red)' : scores.risk > 40 ? 'var(--amber)' : 'var(--green)' },
  ];

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${ICONS.zap} Signal Panel</span>
      </div>
      <div style="text-align:center;margin-bottom:16px;padding:16px;background:var(--bg-surface);border-radius:var(--radius-md);">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">CURRENT SIGNAL</div>
        <div class="signal-badge ${signal.class}" style="font-size:0.875rem;padding:10px 20px;display:inline-flex;">
          <span class="signal-dot"></span>
          ${signal.label}
        </div>
        <div style="margin-top:10px;font-size:0.75rem;color:var(--text-muted);">
          Trend Direction: <span class="${trend.label === 'Bullish' ? 'text-green' : trend.label === 'Bearish' ? 'text-red' : 'text-amber'}">${trend.icon} ${trend.label}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${scoreItems.map(item => `
          <div class="score-bar">
            <span class="score-bar-label" style="font-size:0.75rem;min-width:90px;">${item.label}</span>
            <div class="score-bar-track">
              <div class="score-bar-fill" style="width:${item.value}%;background:${item.color};"></div>
            </div>
            <span class="score-bar-value" style="color:${item.color};">${item.value}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderConfidenceCard(insight) {
  if (!insight) return '';
  const conf = insight.confidence;
  const color = conf > 65 ? 'var(--green)' : conf > 45 ? 'var(--amber)' : 'var(--red)';

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Confidence Score</span>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0;">
        <div style="position:relative;width:120px;height:120px;">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bg-surface)" stroke-width="10" />
            <circle cx="60" cy="60" r="50" fill="none" stroke="${color}" stroke-width="10"
              stroke-dasharray="${2 * Math.PI * 50}"
              stroke-dashoffset="${2 * Math.PI * 50 * (1 - conf / 100)}"
              stroke-linecap="round"
              transform="rotate(-90 60 60)"
              style="transition:stroke-dashoffset 1s ease;" />
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <span style="font-family:var(--font-mono);font-size:1.6rem;font-weight:700;color:${color};">${conf}</span>
            <span style="font-size:0.65rem;color:var(--text-muted);">/ 100</span>
          </div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);text-align:center;max-width:200px;">
          ${conf > 65 ? 'Moderately high model confidence. Still scenario-based.' : conf > 45 ? 'Moderate confidence. Multiple outcomes remain plausible.' : 'Lower confidence. Elevated uncertainty in this setup.'}
        </div>
      </div>
    </div>
  `;
}

function renderTimeframeCard(insight) {
  if (!insight) return '';
  const { shortTermOutlook, midTermOutlook, longTermOutlook } = insight;
  const getColor = (o) => o.includes('Positive') || o.includes('Opportunity') ? 'var(--green)' : o.includes('Risk') || o.includes('Bear') ? 'var(--red)' : 'var(--amber)';

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Timeframe Outlook</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${[shortTermOutlook, midTermOutlook, longTermOutlook].map(item => `
          <div style="background:var(--bg-surface);border-radius:var(--radius-md);padding:12px;">
            <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">${item.label}</div>
            <div style="font-weight:600;font-size:0.85rem;color:${getColor(item.outlook)};margin-bottom:4px;">${item.outlook}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.5;">${item.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderStockNews(ticker) {
  const news = getNewsForStock(ticker);
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${ICONS.newspaper} Recent News</span>
      </div>
      ${news.slice(0, 4).map(n => {
        const dotColor = n.sentiment === 'positive' ? 'var(--green)' : n.sentiment === 'negative' ? 'var(--red)' : 'var(--text-muted)';
        return `
          <div class="news-item">
            <div class="news-sentiment-dot" style="background:${dotColor};margin-top:5px;flex-shrink:0;"></div>
            <div class="news-content">
              <div class="news-title">${n.title}</div>
              <div class="news-meta">${n.source} · ${n.time}</div>
            </div>
          </div>
        `;
      }).join('')}
      <div style="margin-top:12px;padding:10px;background:var(--bg-surface);border-radius:var(--radius-md);">
        <div style="font-size:0.7rem;font-weight:600;color:var(--accent-primary);margin-bottom:4px;">AI SENTIMENT SUMMARY</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);">
          ${news.filter(n => n.sentiment === 'positive').length > news.filter(n => n.sentiment === 'negative').length
            ? 'News sentiment leans moderately positive. However, valuation concerns and sector headwinds remain factors to monitor.'
            : 'News sentiment is mixed to cautious. Watch for any guidance updates or macro developments that could shift the outlook.'}
        </div>
      </div>
    </div>
  `;
}

// ---- CHART INITIALIZATION ----

export function initStockDetail(ticker, navigate) {
  // Wiring nav

  // Watchlist toggle
  initWatchlistToggle();

  // Tab switching
  document.querySelectorAll('#insight-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#insight-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = tab.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.style.display = p.dataset.panel === panel ? 'block' : 'none';
      });
    });
  });

  // Time filter
  document.querySelectorAll('.chart-timefilter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-timefilter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPriceChart(ticker, btn.dataset.period);
    });
  });

  // Indicator toggles
  document.querySelectorAll('.indicator-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      loadPriceChart(ticker, getActivePeriod());
    });
  });

  // Analyze button
  const analyzeBtn = document.getElementById('analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      document.getElementById('ai-insight')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Initial chart load
  setTimeout(() => {
    loadPriceChart(ticker, '1D');
    loadRSIChart(ticker);
    loadMACDChart(ticker);
    loadSupportResistance(ticker);
  }, 100);
}

function getActivePeriod() {
  return document.querySelector('.chart-timefilter-btn.active')?.dataset.period || '1D';
}

function getActiveIndicators() {
  const active = [];
  document.querySelectorAll('.indicator-toggle.active').forEach(btn => active.push(btn.dataset.indicator));
  return active;
}

function getPriceHistory(ticker, period) {
  const key = `${ticker}_${period}`;
  if (priceHistoryCache[key]) return priceHistoryCache[key];

  const stock = STOCKS[ticker];
  let data;
  switch (period) {
    case '1D': data = generateIntradayData(stock.price); break;
    case '1W': data = generatePriceHistory(stock.price, 7, 0.012); break;
    case '1M': data = generatePriceHistory(stock.price, 30, 0.015); break;
    case '3M': data = generatePriceHistory(stock.price, 90, 0.014); break;
    case '6M': data = generatePriceHistory(stock.price, 180, 0.013); break;
    case '1Y': data = generatePriceHistory(stock.price, 365, 0.016); break;
    case '5Y': data = generatePriceHistory(stock.price, 1825, 0.018); break;
    default:   data = generateIntradayData(stock.price);
  }
  priceHistoryCache[key] = data;
  return data;
}

function loadPriceChart(ticker, period) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('price-chart');
  if (!canvas) return;

  if (activeChart) { activeChart.destroy(); activeChart = null; }

  const data = getPriceHistory(ticker, period);
  const prices = data.map(d => d.close);
  const labels = data.map(d => {
    const date = new Date(d.date);
    if (period === '1D') return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (period === '1W' || period === '1M') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  });

  const isUp = prices[prices.length - 1] >= prices[0];
  const mainColor = isUp ? chartColor('--green') : chartColor('--red');

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, mainColor + '30');
  gradient.addColorStop(1, mainColor + '00');

  const datasets = [{
    label: 'Price',
    data: prices,
    borderColor: mainColor,
    backgroundColor: gradient,
    fill: true,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderWidth: 2,
    tension: 0.3,
  }];

  const indicators = getActiveIndicators();
  if (indicators.includes('sma') && prices.length >= 20) {
    const sma = calculateSMA(prices, 20);
    datasets.push({ label: 'SMA 20', data: sma, borderColor: chartColor('--accent-primary'), borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 });
  }
  if (indicators.includes('ema') && prices.length >= 20) {
    const ema = calculateEMA(prices, 20);
    datasets.push({ label: 'EMA 20', data: ema, borderColor: chartColor('--amber'), borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 });
  }
  if (indicators.includes('bb') && prices.length >= 20) {
    const bb = calculateBollingerBands(prices, 20);
    datasets.push(
      { label: 'BB Upper', data: bb.upper, borderColor: 'rgba(96,165,250,0.5)', borderWidth: 1, borderDash: [4,4], pointRadius: 0, fill: false },
      { label: 'BB Lower', data: bb.lower, borderColor: 'rgba(96,165,250,0.5)', borderWidth: 1, borderDash: [4,4], pointRadius: 0, fill: false }
    );
  }

  activeChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: chartColor('--text-secondary'), font: { size: 11, family: 'Inter' }, boxWidth: 12, boxHeight: 2 }
        },
        tooltip: {
          backgroundColor: chartColor('--bg-card-solid'),
          borderColor: chartColor('--border-default'),
          borderWidth: 1,
          titleColor: chartColor('--text-secondary'),
          bodyColor: chartColor('--text-primary'),
          callbacks: {
            label: ctx => ` $${ctx.parsed.y?.toFixed(2) || ''}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: chartColor('--text-muted'), font: { size: 10 }, maxTicksLimit: 8 },
          grid: { color: chartColor('--border-subtle') },
          border: { color: chartColor('--border-subtle') }
        },
        y: {
          position: 'right',
          ticks: { color: chartColor('--text-muted'), font: { size: 10, family: 'JetBrains Mono' }, callback: v => '$' + v.toFixed(0) },
          grid: { color: chartColor('--border-subtle') },
          border: { color: chartColor('--border-subtle') }
        }
      }
    }
  });
}

function loadRSIChart(ticker) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('rsi-chart');
  const badge = document.getElementById('rsi-badge');
  if (!canvas) return;

  const data = getPriceHistory(ticker, '3M');
  const prices = data.map(d => d.close);
  const rsi = calculateRSI(prices, 14);
  const validRsi = rsi.slice(-60);
  const currentRSI = validRsi.filter(v => v !== null).pop() || 50;
  const labels = Array.from({ length: validRsi.length }, (_, i) => i + 1);

  if (badge) {
    const rsiBadgeClass = currentRSI > 70 ? 'badge-red' : currentRSI < 30 ? 'badge-green' : 'badge-neutral';
    const rsiLabel = currentRSI > 70 ? 'Overbought' : currentRSI < 30 ? 'Oversold' : 'Neutral';
    badge.className = `badge ${rsiBadgeClass}`;
    badge.textContent = `${currentRSI.toFixed(1)} · ${rsiLabel}`;
  }

  const rsiColor = currentRSI > 70 ? chartColor('--red') : currentRSI < 30 ? chartColor('--green') : chartColor('--accent-primary');
  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'RSI',
          data: validRsi,
          borderColor: rsiColor,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartColor('--bg-card-solid'),
          borderColor: chartColor('--border-default'),
          borderWidth: 1,
          titleColor: chartColor('--text-secondary'),
          bodyColor: chartColor('--text-primary'),
          callbacks: { label: c => ` RSI: ${c.parsed.y?.toFixed(1)}` }
        },
        annotation: {}
      },
      scales: {
        x: { display: false },
        y: {
          min: 0, max: 100,
          ticks: { color: chartColor('--text-muted'), font: { size: 9 }, stepSize: 30 },
          grid: { color: chartColor('--border-subtle') },
          border: { display: false }
        }
      }
    }
  });
}

function loadMACDChart(ticker) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('macd-chart');
  const badge = document.getElementById('macd-badge');
  if (!canvas) return;

  const data = getPriceHistory(ticker, '3M');
  const prices = data.map(d => d.close);
  const macd = calculateMACD(prices);
  const hist = macd.histogram.slice(-60);
  const macdLine = macd.macd.slice(-60);
  const sigLine = macd.signal.slice(-60);
  const labels = Array.from({ length: hist.length }, (_, i) => i + 1);

  const lastHist = hist.filter(v => v !== null).pop() || 0;
  const lastMACD = macdLine.filter(v => v !== null).pop() || 0;
  const lastSig = sigLine.filter(v => v !== null).pop() || 0;
  const isBullish = lastHist > 0;

  if (badge) {
    badge.className = `badge ${isBullish ? 'badge-green' : 'badge-red'}`;
    badge.textContent = isBullish ? 'Bullish Cross' : 'Bearish Cross';
  }

  const histColors = hist.map(v => v === null ? 'transparent' : v > 0 ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)');

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Histogram', data: hist, backgroundColor: histColors, borderRadius: 2 },
        { type: 'line', label: 'MACD', data: macdLine, borderColor: chartColor('--accent-primary'), backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { type: 'line', label: 'Signal', data: sigLine, borderColor: chartColor('--amber'), backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: chartColor('--text-secondary'), font: { size: 9 }, boxWidth: 8, boxHeight: 2 }
        },
        tooltip: {
          backgroundColor: chartColor('--bg-card-solid'),
          borderColor: chartColor('--border-default'),
          borderWidth: 1,
          titleColor: chartColor('--text-secondary'),
          bodyColor: chartColor('--text-primary'),
        }
      },
      scales: {
        x: { display: false },
        y: {
          ticks: { color: chartColor('--text-muted'), font: { size: 9 } },
          grid: { color: chartColor('--border-subtle') },
          border: { display: false }
        }
      }
    }
  });
}

function loadSupportResistance(ticker) {
  const container = document.getElementById('sr-content');
  if (!container) return;

  const data = getPriceHistory(ticker, '3M');
  const stock = STOCKS[ticker];
  const sr = calculateSupportResistance(data);
  const currentPrice = stock.price;

  container.innerHTML = `
    <div style="position:relative;height:80px;background:var(--bg-surface);border-radius:var(--radius-md);padding:8px 16px;overflow:hidden;">
      ${sr.resistance.slice(0, 2).map((r, i) => {
        const pct = Math.max(10, Math.min(90, 75 - i * 20));
        return `
          <div style="position:absolute;left:0;right:0;top:${100 - pct}%;transform:translateY(-50%);">
            <div style="border-top:1px dashed var(--red-dim);opacity:0.7;position:relative;">
              <span style="position:absolute;right:8px;top:-9px;font-size:0.7rem;font-family:var(--font-mono);color:var(--red);">R${i+1}: $${r}</span>
            </div>
          </div>
        `;
      }).join('')}
      <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);">
        <div style="border-top:2px solid var(--accent-primary);position:relative;">
          <span style="position:absolute;right:8px;top:-10px;font-size:0.75rem;font-family:var(--font-mono);color:var(--accent-primary);font-weight:700;">$${currentPrice.toFixed(2)}</span>
        </div>
      </div>
      ${sr.support.slice(0, 2).map((s, i) => {
        const pct = Math.max(10, Math.min(40, 30 - i * 15));
        return `
          <div style="position:absolute;left:0;right:0;top:${100 - pct}%;transform:translateY(-50%);">
            <div style="border-top:1px dashed var(--green-dim);opacity:0.7;position:relative;">
              <span style="position:absolute;right:8px;top:-9px;font-size:0.7rem;font-family:var(--font-mono);color:var(--green);">S${i+1}: $${s}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);">
      <span>
        Supports: ${sr.support.slice(0, 3).map(s => '<span style="color:var(--green);font-family:var(--font-mono);">$' + s + '</span>').join(', ') || 'N/A'}
      </span>
      <span>
        Resistance: ${sr.resistance.slice(0, 3).map(r => '<span style="color:var(--red);font-family:var(--font-mono);">$' + r + '</span>').join(', ') || 'N/A'}
      </span>
    </div>
  `;
}

