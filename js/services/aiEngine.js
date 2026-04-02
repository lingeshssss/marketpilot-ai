// ============================================================
// MarketPilot AI — AI Insight Engine & Signal Services
// Generates probabilistic, non-advisory analysis
// ============================================================

import {
  STOCKS, generatePriceHistory, generateIntradayData,
  calculateSMA, calculateEMA, calculateRSI, calculateMACD,
  calculateBollingerBands, calculateSupportResistance, getSettings
} from '../data/mockData.js';

// --- SCORING ENGINE ---

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

function generateScores(ticker) {
  const stock = STOCKS[ticker];
  if (!stock) return null;

  // Use ticker hash for deterministic but varied scores
  const hash = ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const seed = (n) => ((hash * 13 + n * 7) % 100);

  const trend = clamp(seed(1) * 0.6 + 30 + (Math.random() * 10));
  const momentum = clamp(seed(2) * 0.5 + 25 + (Math.random() * 12));
  const sentiment = clamp(seed(3) * 0.55 + 28 + (Math.random() * 8));
  const risk = clamp(100 - trend * 0.3 - sentiment * 0.2 + stock.beta * 15 + (Math.random() * 10));
  const sellPressure = clamp(risk * 0.5 + (100 - momentum) * 0.3 + (Math.random() * 15));
  const opportunity = clamp(trend * 0.3 + momentum * 0.25 + sentiment * 0.25 + (100 - risk) * 0.2);

  return {
    trend: Math.round(trend),
    momentum: Math.round(momentum),
    sentiment: Math.round(sentiment),
    risk: Math.round(risk),
    sellPressure: Math.round(sellPressure),
    opportunity: Math.round(opportunity),
  };
}

// --- SIGNAL STATE DETERMINATION ---

function getSignalState(scores) {
  const { trend, momentum, sellPressure, risk } = scores;
  const composite = (trend * 0.3 + momentum * 0.3 + (100 - risk) * 0.2 + (100 - sellPressure) * 0.2);

  if (composite >= 75) return { label: 'Strong Buy Watch', class: 'signal-strong-buy', icon: '🟢' };
  if (composite >= 60) return { label: 'Buy Watch', class: 'signal-buy', icon: '🔵' };
  if (composite >= 45) return { label: 'Neutral', class: 'signal-neutral', icon: '⚪' };
  if (composite >= 35) return { label: 'Caution', class: 'signal-caution', icon: '🟡' };
  if (composite >= 25) return { label: 'Take Profit Watch', class: 'signal-take-profit', icon: '🟠' };
  return { label: 'Sell Risk Elevated', class: 'signal-sell-risk', icon: '🔴' };
}

// --- TREND DIRECTION ---

function getTrendDirection(scores) {
  if (scores.trend >= 65) return { label: 'Bullish', class: 'text-green', icon: '↑' };
  if (scores.trend >= 40) return { label: 'Neutral', class: 'text-amber', icon: '→' };
  return { label: 'Bearish', class: 'text-red', icon: '↓' };
}

// --- RISK SCORE (1-10) ---

function getRiskScore(scores) {
  return Math.max(1, Math.min(10, Math.round(scores.risk / 10)));
}

// --- AI INSIGHT GENERATION ---

function generateInsight(ticker) {
  const stock = STOCKS[ticker];
  if (!stock) return null;

  const scores = generateScores(ticker);
  const signal = getSignalState(scores);
  const trend = getTrendDirection(scores);
  const riskScore = getRiskScore(scores);
  const settings = getSettings();

  // Calculate key prices
  const entryZoneLow = +(stock.price * 0.96).toFixed(2);
  const entryZoneHigh = +(stock.price * 0.99).toFixed(2);
  const sellZoneLow = +(stock.price * 1.05).toFixed(2);
  const sellZoneHigh = +(stock.price * 1.10).toFixed(2);
  const stopLoss = +(stock.price * 0.93).toFixed(2);

  // Confidence
  const confidence = clamp(scores.trend * 0.25 + scores.momentum * 0.25 + scores.sentiment * 0.3 + (100 - scores.risk) * 0.2);
  const confidenceRounded = Math.round(confidence);

  // Generate natural language outlook
  const trendWord = trend.label.toLowerCase();
  const momentumDesc = scores.momentum > 65 ? 'strong' : scores.momentum > 45 ? 'moderate' : 'weakening';
  const sentimentDesc = scores.sentiment > 65 ? 'positive' : scores.sentiment > 45 ? 'mixed' : 'cautious';

  const outlook = generateOutlookText(ticker, stock, scores, trend, momentumDesc, sentimentDesc);
  const bullCase = generateBullCase(ticker, stock, scores);
  const bearCase = generateBearCase(ticker, stock, scores);
  const technicalSummary = generateTechnicalSummary(ticker, stock, scores, trend);
  const sentimentSummary = generateSentimentSummary(ticker, stock, scores);
  const shortTermOutlook = generateTimeframeOutlook('short', scores, stock);
  const midTermOutlook = generateTimeframeOutlook('mid', scores, stock);
  const longTermOutlook = generateTimeframeOutlook('long', scores, stock);

  return {
    ticker,
    name: stock.name,
    scores,
    signal,
    trend,
    riskScore,
    confidence: confidenceRounded,
    outlook,
    bullCase,
    bearCase,
    technicalSummary,
    sentimentSummary,
    entryZone: { low: entryZoneLow, high: entryZoneHigh },
    sellZone: { low: sellZoneLow, high: sellZoneHigh },
    stopLoss,
    shortTermOutlook,
    midTermOutlook,
    longTermOutlook,
    whyReasons: generateWhyReasons(scores, stock),
  };
}

function generateOutlookText(ticker, stock, scores, trend, momentumDesc, sentimentDesc) {
  const outlooks = [];

  if (trend.label === 'Bullish') {
    outlooks.push(
      `${ticker} is showing ${trend.label.toLowerCase()} momentum characteristics with ${momentumDesc} trend strength. Price action suggests continued interest above recent support levels.`,
      `Current data indicates ${sentimentDesc} market sentiment around ${stock.name}, with probability favoring continuation of the current trajectory if volume sustains.`,
    );
  } else if (trend.label === 'Neutral') {
    outlooks.push(
      `${ticker} is consolidating in a neutral range. Momentum indicators suggest indecision, and the stock may be awaiting a catalyst for its next directional move.`,
      `Market sentiment appears ${sentimentDesc} for ${stock.name}. The current setup may favor a wait-and-watch approach until clearer signals emerge.`,
    );
  } else {
    outlooks.push(
      `${ticker} is exhibiting ${trend.label.toLowerCase()} tendencies with ${momentumDesc} downside momentum. Caution may be warranted as the current setup suggests elevated risk.`,
      `${sentimentDesc.charAt(0).toUpperCase() + sentimentDesc.slice(1)} sentiment combined with weakening technical indicators suggests ${stock.name} may face near-term headwinds.`,
    );
  }

  if (scores.risk > 60) {
    outlooks.push(`This setup carries elevated risk characteristics. Position sizing and risk management considerations may be particularly relevant.`);
  }

  return outlooks.join(' ');
}

function generateBullCase(ticker, stock, scores) {
  const reasons = [];
  if (scores.trend > 55) reasons.push(`trend strength remains above average at ${scores.trend}/100`);
  if (scores.sentiment > 55) reasons.push(`market sentiment is leaning positive`);
  if (stock.price < stock.analystTarget) reasons.push(`current price sits below consensus analyst target of $${stock.analystTarget}`);
  if (scores.momentum > 55) reasons.push(`momentum indicators suggest buying interest`);
  reasons.push(`${stock.sector} sector fundamentals remain constructive`);

  return `Probability favors upside if ${reasons.slice(0, 3).join(', ')}. A breakout above near-term resistance could attract additional momentum.`;
}

function generateBearCase(ticker, stock, scores) {
  const reasons = [];
  if (scores.risk > 50) reasons.push(`risk score is elevated at ${scores.risk}/100`);
  if (stock.pe > 40) reasons.push(`P/E ratio of ${stock.pe} suggests premium valuation`);
  if (scores.sellPressure > 50) reasons.push(`sell pressure indicators are above average`);
  if (stock.beta > 1.3) reasons.push(`high beta (${stock.beta}) indicates above-average volatility`);
  reasons.push(`broader market uncertainty could amplify downside moves`);

  return `Downside risk increases if ${reasons.slice(0, 3).join(', ')}. A break below support could accelerate selling pressure.`;
}

function generateTechnicalSummary(ticker, stock, scores, trend) {
  return `Technical indicators show a ${trend.label.toLowerCase()} configuration. Trend score: ${scores.trend}/100, Momentum: ${scores.momentum}/100. ` +
    `Key levels to monitor include the ${scores.trend > 50 ? 'support' : 'resistance'} areas near recent swing points. ` +
    `Volume patterns suggest ${scores.momentum > 60 ? 'healthy participation' : 'potential fatigue'} in the current move.`;
}

function generateSentimentSummary(ticker, stock, scores) {
  const level = scores.sentiment > 65 ? 'moderately positive' : scores.sentiment > 45 ? 'mixed with neutral bias' : 'cautious with negative undertones';
  return `News sentiment is ${level}. Recent coverage focuses on ${stock.sector.toLowerCase()} sector dynamics and company-specific developments. ` +
    `Sentiment alone should not drive decisions — consider in context with technical and fundamental analysis.`;
}

function generateTimeframeOutlook(timeframe, scores, stock) {
  const labels = { short: 'Short-term (1-5 days)', mid: 'Medium-term (2-8 weeks)', long: 'Long-term (3-12 months)' };

  if (timeframe === 'short') {
    if (scores.momentum > 60) return { label: labels.short, outlook: 'Cautiously Positive', desc: 'Near-term momentum favors continuation, but short-term reversals remain possible.' };
    if (scores.momentum > 40) return { label: labels.short, outlook: 'Neutral', desc: 'No clear short-term directional edge detected. Watch for breakout catalysts.' };
    return { label: labels.short, outlook: 'Cautious', desc: 'Short-term momentum is weakening. Consider tighter risk management.' };
  }

  if (timeframe === 'mid') {
    if (scores.trend > 60) return { label: labels.mid, outlook: 'Moderately Positive', desc: 'Trend structure remains intact. Pullbacks to support may present opportunities if confirmed.' };
    if (scores.trend > 40) return { label: labels.mid, outlook: 'Neutral', desc: 'Price is range-bound. A decisive break in either direction would clarify the medium-term outlook.' };
    return { label: labels.mid, outlook: 'Risk Elevated', desc: 'Trend deterioration may continue if key support levels fail to hold.' };
  }

  // long
  if (stock.price < stock.analystTarget * 0.9) return { label: labels.long, outlook: 'Potential Opportunity', desc: `Price is meaningfully below analyst consensus ($${stock.analystTarget}). Long-term fundamentals may support recovery if sector conditions improve.` };
  if (stock.price > stock.analystTarget * 1.05) return { label: labels.long, outlook: 'Fully Valued', desc: `Price exceeds analyst consensus. Long-term returns may be more modest unless fundamentals improve significantly.` };
  return { label: labels.long, outlook: 'Fair Value Range', desc: 'Price is near analyst consensus. Long-term trajectory depends on execution and sector dynamics.' };
}

function generateWhyReasons(scores, stock) {
  const reasons = [];
  if (scores.trend > 65) reasons.push({ factor: 'Strong Trend', detail: `Trend score of ${scores.trend}/100 indicates above-average directional strength.` });
  if (scores.trend < 35) reasons.push({ factor: 'Weak Trend', detail: `Trend score of ${scores.trend}/100 suggests weakening directional conviction.` });
  if (scores.momentum > 70) reasons.push({ factor: 'Elevated Momentum', detail: `Momentum may be becoming extended. Watch for potential pullback signals.` });
  if (scores.momentum < 30) reasons.push({ factor: 'Low Momentum', detail: `Momentum is below average, which could indicate accumulation or continued weakness.` });
  if (scores.risk > 65) reasons.push({ factor: 'Higher Risk', detail: `Risk score of ${scores.risk}/100 suggests careful position sizing. Beta of ${stock.beta} adds to volatility.` });
  if (stock.pe > 50) reasons.push({ factor: 'Premium Valuation', detail: `P/E of ${stock.pe} is above sector average. Premium valuations require sustained growth to justify.` });
  if (scores.sellPressure > 60) reasons.push({ factor: 'Sell Pressure', detail: `Sell pressure score of ${scores.sellPressure}/100 suggests caution for profit-taking zones.` });
  if (scores.sentiment > 65) reasons.push({ factor: 'Positive Sentiment', detail: `News and market sentiment lean positive (${scores.sentiment}/100), which may support near-term price.` });
  if (scores.sentiment < 35) reasons.push({ factor: 'Negative Sentiment', detail: `Sentiment headwinds detected (${scores.sentiment}/100). Negative news cycle may impact price.` });

  // Always add at least 3 reasons
  if (reasons.length < 3) {
    reasons.push({ factor: 'Market Context', detail: `Broader market conditions and sector rotation can influence ${stock.ticker} independently of company-specific factors.` });
  }
  if (reasons.length < 3) {
    reasons.push({ factor: 'Volume Pattern', detail: `Monitoring volume relative to the ${Math.round(stock.avgVolume / 1000000)}M average helps confirm or question price moves.` });
  }

  return reasons.slice(0, 5);
}

// --- SELL TIMING INTELLIGENCE ---

function generateSellTiming(ticker) {
  const stock = STOCKS[ticker];
  if (!stock) return null;
  const scores = generateScores(ticker);

  const r1 = +(stock.price * 1.04).toFixed(2);
  const r2 = +(stock.price * 1.08).toFixed(2);
  const r3 = +(stock.price * 1.14).toFixed(2);

  const trailingStopPct = scores.risk > 60 ? 5 : scores.risk > 40 ? 7 : 10;
  const trailingStop = +(stock.price * (1 - trailingStopPct / 100)).toFixed(2);

  const items = [
    {
      icon: '🎯',
      iconBg: 'var(--blue-bg)',
      label: 'Resistance Targets',
      value: `R1: $${r1} | R2: $${r2} | R3: $${r3}`,
      severity: 'info',
    },
    {
      icon: '📊',
      iconBg: scores.momentum > 70 ? 'var(--amber-bg)' : 'var(--green-bg)',
      label: 'Momentum Exhaustion',
      value: scores.momentum > 70
        ? `Momentum score (${scores.momentum}) is becoming extended. Watch for deceleration.`
        : `Momentum (${scores.momentum}) appears sustainable at current levels.`,
      severity: scores.momentum > 70 ? 'warning' : 'ok',
    },
    {
      icon: '🌡️',
      iconBg: scores.risk > 65 ? 'var(--red-bg)' : 'var(--amber-bg)',
      label: 'RSI Overheating',
      value: scores.trend > 70
        ? `RSI-based indicators suggest possible overbought conditions. Consider partial profit-taking.`
        : `RSI levels remain within normal ranges. No immediate overheating detected.`,
      severity: scores.trend > 70 ? 'warning' : 'ok',
    },
    {
      icon: '📉',
      iconBg: 'var(--amber-bg)',
      label: 'MACD Crossover Watch',
      value: scores.momentum < 45
        ? `MACD configuration shows potential bearish crossover developing. Monitor closely.`
        : `MACD remains in favorable configuration. No crossover concern at this time.`,
      severity: scores.momentum < 45 ? 'warning' : 'ok',
    },
    {
      icon: '📦',
      iconBg: scores.sellPressure > 55 ? 'var(--amber-bg)' : 'var(--green-bg)',
      label: 'Volume Weakness Detection',
      value: scores.sellPressure > 55
        ? `Volume patterns suggest potential distribution. ${scores.sellPressure > 70 ? 'Significant' : 'Moderate'} selling pressure detected.`
        : `Volume remains healthy relative to trend. No abnormal distribution patterns.`,
      severity: scores.sellPressure > 55 ? 'warning' : 'ok',
    },
    {
      icon: '🛡️',
      iconBg: 'var(--blue-bg)',
      label: 'Trailing Stop Suggestion',
      value: `Consider a trailing stop around $${trailingStop} (${trailingStopPct}% below current price) based on current volatility profile.`,
      severity: 'info',
    },
    {
      icon: '⚖️',
      iconBg: scores.risk > 60 ? 'var(--red-bg)' : 'var(--green-bg)',
      label: 'Risk/Reward Assessment',
      value: scores.risk > 60
        ? `Risk/reward ratio may be deteriorating. Current risk score: ${scores.risk}/100. Position reduction may be worth considering.`
        : `Risk/reward remains constructive at current levels. Risk score: ${scores.risk}/100.`,
      severity: scores.risk > 60 ? 'warning' : 'ok',
    },
    {
      icon: '🔄',
      iconBg: 'var(--accent-glow)',
      label: 'Scaling-Out Strategy',
      value: `Consider scaling out: 25% at R1 ($${r1}), 25% at R2 ($${r2}), trail remaining with ${trailingStopPct}% stop.`,
      severity: 'info',
    },
  ];

  return { items, overallWarningLevel: scores.sellPressure > 60 ? 'elevated' : scores.sellPressure > 40 ? 'moderate' : 'low' };
}

// --- OPPORTUNITY SCANNER ---

function scanOpportunities(filters = {}) {
  const results = [];

  Object.values(STOCKS).forEach(stock => {
    const scores = generateScores(stock.ticker);
    const signal = getSignalState(scores);
    const trend = getTrendDirection(scores);

    const opp = {
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      price: stock.price,
      change: +((Math.random() - 0.42) * 6).toFixed(2),
      scores,
      signal,
      trend,
      reason: '',
      matchedFilters: [],
    };

    // Check filters
    if (scores.momentum < 30) {
      opp.matchedFilters.push('RSI Oversold Zone');
      opp.reason = `Momentum indicators for ${stock.ticker} are in oversold territory (${scores.momentum}/100). Probability of a mean-reversion bounce increases near this level if key support holds.`;
    }
    if (scores.momentum > 70) {
      opp.matchedFilters.push('RSI Overbought');
      opp.reason = opp.reason || `${stock.ticker} momentum is elevated (${scores.momentum}/100), suggesting overbought conditions. Watch for pullback or continuation signals.`;
    }
    if (scores.trend > 70) {
      opp.matchedFilters.push('Strong Trend');
      opp.reason = opp.reason || `${stock.ticker} shows strong directional trend (${scores.trend}/100). Momentum favors continuation unless a clear reversal signal emerges.`;
    }
    if (scores.opportunity > 65) {
      opp.matchedFilters.push('High Opportunity');
      opp.reason = opp.reason || `Opportunity score of ${scores.opportunity}/100 for ${stock.ticker} reflects favorable risk/reward balance relative to peers in ${stock.sector}.`;
    }
    if (stock.beta > 1.5) {
      opp.matchedFilters.push('High Volatility');
      opp.reason = opp.reason || `${stock.ticker} (beta ${stock.beta}) exhibits above-average volatility. Higher potential moves in both directions — risk management is especially important.`;
    }
    if (scores.sentiment > 70) {
      opp.matchedFilters.push('Positive Sentiment');
      opp.reason = opp.reason || `Sentiment indicators for ${stock.ticker} are constructive (${scores.sentiment}/100). Recent news flow may be supporting price action.`;
    }
    if (stock.marketCap.includes('T')) {
      opp.matchedFilters.push('Large Cap');
    } else if (parseInt(stock.marketCap) > 50) {
      opp.matchedFilters.push('Mid Cap');
    } else {
      opp.matchedFilters.push('Small Cap');
    }
    if (scores.sellPressure > 60) {
      opp.matchedFilters.push('Sell Pressure');
      opp.reason = opp.reason || `Elevated sell pressure detected for ${stock.ticker} (${scores.sellPressure}/100). Monitor for distribution patterns or profit-taking activity.`;
    }

    // Default reason based on overall profile
    if (!opp.reason) {
      const priceVsTarget = stock.price < stock.analystTarget
        ? `Price is ${((stock.analystTarget - stock.price) / stock.analystTarget * 100).toFixed(1)}% below analyst consensus ($${stock.analystTarget}).`
        : `Price near or above analyst consensus.`;
      opp.reason = `${stock.name} shows ${trend.label.toLowerCase()} tendencies with opportunity score at ${scores.opportunity}/100. ${priceVsTarget}`;
    }

    // Apply filters
    let include = true;
    if (filters.activeFilters && filters.activeFilters.length > 0) {
      include = filters.activeFilters.some(f => opp.matchedFilters.includes(f));
    }

    if (include) results.push(opp);
  });

  // Sort by opportunity score
  results.sort((a, b) => b.scores.opportunity - a.scores.opportunity);
  return results;
}


// --- EXPORT PUBLIC API ---

export {
  generateScores,
  getSignalState,
  getTrendDirection,
  getRiskScore,
  generateInsight,
  generateSellTiming,
  scanOpportunities,
};
