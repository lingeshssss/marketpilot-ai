// ============================================================
// MarketPilot AI — Landing Page
// ============================================================

import { ICONS } from '../components/index.js';

export function renderLandingPage(navigate) {
  return `
    <div class="landing-page">
      <nav class="landing-nav">
        <div class="landing-nav-brand">
          <div class="sidebar-logo">M</div>
          <div class="sidebar-brand">
            <span class="sidebar-brand-name">MarketPilot</span>
            <span class="sidebar-brand-tag">AI Insights</span>
          </div>
        </div>
        <div class="landing-nav-links">
          <a href="#features" class="landing-nav-link">Features</a>
          <a href="#how-it-works" class="landing-nav-link">How It Works</a>
          <a href="#disclaimer" class="landing-nav-link">Disclaimer</a>
          <button class="btn btn-primary btn-sm" data-page="dashboard">Open Dashboard</button>
        </div>
      </nav>

      <section class="landing-hero">
        <div class="hero-content">
          <div class="hero-badge">
            <span class="pulse-dot"></span>
            AI-Powered Analysis Engine
          </div>
          <h1 class="hero-title">
            <span class="text-gradient">AI-Powered</span> Stock Insight,<br/>
            Risk Signals & Sell Timing Intelligence
          </h1>
          <p class="hero-subtitle">
            Analyze market conditions in near real time with probabilistic insights, technical signals,
            and data-driven sell timing intelligence. No guesswork — just actionable scenarios.
          </p>
          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" data-page="dashboard">
              ${ICONS.dashboard} Open Dashboard
            </button>
            <button class="btn btn-secondary btn-lg" data-page="scanner">
              ${ICONS.scanner} Scan Opportunities
            </button>
          </div>
          <div class="hero-disclaimer">
            ⚠️ <strong>Important:</strong> MarketPilot AI provides probabilistic market insights for educational
            and informational purposes only. It does not provide financial advice or guarantee outcomes.
            All analysis is scenario-based and should not be the sole basis for investment decisions.
          </div>
        </div>
      </section>

      <section class="landing-features" id="features">
        <div class="landing-section-title">
          <h2><span class="text-gradient">Intelligent</span> Analysis Features</h2>
          <p>Comprehensive tools for smarter market decisions</p>
        </div>
        <div class="feature-grid stagger">
          <div class="feature-card">
            <div class="feature-card-icon" style="background:var(--accent-glow);">${ICONS.brain}</div>
            <h3>AI Insight Engine</h3>
            <p>Natural-language analysis combining technical indicators, sentiment, and market data to generate clear, probabilistic outlooks for any stock.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card-icon" style="background:var(--green-bg);">${ICONS.chart}</div>
            <h3>Technical Analysis</h3>
            <p>RSI, MACD, Bollinger Bands, SMA/EMA overlays, support/resistance levels, and trend detection — all automated and explained.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card-icon" style="background:var(--amber-bg);">${ICONS.target}</div>
            <h3>Sell Timing Intelligence</h3>
            <p>Know when to consider taking profits. Resistance targets, momentum exhaustion detection, and trailing stop suggestions.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card-icon" style="background:var(--blue-bg);">${ICONS.scanner}</div>
            <h3>Opportunity Scanner</h3>
            <p>Filter and rank stocks by RSI extremes, volume spikes, breakouts, momentum, and more. Find setups that match your criteria.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card-icon" style="background:var(--red-bg);">${ICONS.shield}</div>
            <h3>Risk Scoring</h3>
            <p>Every insight includes a risk score (1–10), confidence level, and explainability. Understand exactly why each signal appears.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card-icon" style="background:rgba(34,211,238,0.1);">${ICONS.zap}</div>
            <h3>Real-Time Signals</h3>
            <p>Trend, momentum, sentiment, and sell pressure scores update dynamically. Signal states range from "Buy Watch" to "Sell Risk Elevated."</p>
          </div>
        </div>
      </section>

      <section class="landing-features" id="how-it-works" style="background:var(--bg-secondary);">
        <div class="landing-section-title">
          <h2>How It <span class="text-gradient">Works</span></h2>
          <p>A systematic approach to market analysis</p>
        </div>
        <div style="max-width:800px;margin:0 auto;display:flex;flex-direction:column;gap:32px;">
          ${[
            { step: '01', title: 'Search Any Stock', desc: 'Enter a ticker symbol to instantly load price data, technicals, fundamentals, and recent news.' },
            { step: '02', title: 'Review AI Analysis', desc: 'Our AI engine processes technical indicators, sentiment, and market context to generate probabilistic insights.' },
            { step: '03', title: 'Understand the Signals', desc: 'Each insight explains WHY it appears. RSI elevated? Volume spike? Approaching resistance? Everything is transparent.' },
            { step: '04', title: 'Make Informed Decisions', desc: 'Use the sell timing module, risk scores, and scenario analysis to support your investment research — never as the sole factor.' },
          ].map(item => `
            <div style="display:flex;align-items:flex-start;gap:24px;" class="animate-fade-in-up">
              <div style="width:48px;height:48px;border-radius:var(--radius-lg);background:var(--accent-gradient);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;color:white;flex-shrink:0;">${item.step}</div>
              <div>
                <h3 style="margin-bottom:4px;">${item.title}</h3>
                <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6;">${item.desc}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="landing-features" id="disclaimer" style="max-width:700px;margin:0 auto;padding:80px 48px;">
        <div class="landing-section-title">
          <h2>Risk <span class="text-gradient">Disclaimer</span></h2>
        </div>
        <div style="background:rgba(248,113,113,0.06);border:1px solid var(--red-border);border-radius:var(--radius-lg);padding:32px;line-height:1.8;color:var(--text-secondary);font-size:0.9rem;">
          <p><strong style="color:var(--red);">⚠️ Important Notice:</strong></p>
          <p style="margin-top:12px;">MarketPilot AI is an educational and informational tool designed to assist with market analysis. It does NOT provide personalized investment advice, recommendations, or guarantees of any kind.</p>
          <p style="margin-top:12px;">All insights, signals, and scores are generated using probabilistic models and should be considered as one of many inputs in your investment research process. Past performance does not indicate future results.</p>
          <p style="margin-top:12px;">Always consult with a qualified financial advisor before making investment decisions. Never invest more than you can afford to lose. Trading stocks involves risk, including the possible loss of principal.</p>
          <p style="margin-top:12px;">The phrases "Buy Watch," "Sell Risk," "Opportunity Score," and similar labels reflect probabilistic model outputs — not buy/sell recommendations.</p>
        </div>
      </section>

      <footer class="landing-footer">
        <p>MarketPilot AI © 2026 · Probabilistic insights for educational purposes only · Not financial advice</p>
      </footer>
    </div>
  `;
}
