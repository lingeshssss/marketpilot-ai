// ============================================================
// MarketPilot AI — Mock Data Service
// Generates realistic market data for demonstration
// Designed for easy replacement with real API endpoints
// ============================================================

// --- STOCK DATABASE ---
export const STOCKS = {
  AAPL: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', price: 218.27, pe: 34.2, eps: 6.38, marketCap: '3.42T', volume: 58432100, avgVolume: 62100000, high52: 237.49, low52: 164.08, beta: 1.24, dividendYield: 0.44, analystTarget: 235.00 },
  NVDA: { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', price: 142.65, pe: 62.8, eps: 2.27, marketCap: '3.51T', volume: 312540000, avgVolume: 285000000, high52: 153.13, low52: 75.61, beta: 1.68, dividendYield: 0.02, analystTarget: 160.00 },
  TSLA: { ticker: 'TSLA', name: 'Tesla, Inc.', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', price: 271.83, pe: 98.5, eps: 2.76, marketCap: '870B', volume: 95210000, avgVolume: 102000000, high52: 488.54, low52: 138.80, beta: 2.06, dividendYield: 0, analystTarget: 295.00 },
  MSFT: { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software', price: 428.50, pe: 35.8, eps: 11.97, marketCap: '3.18T', volume: 22180000, avgVolume: 25400000, high52: 468.35, low52: 362.90, beta: 0.92, dividendYield: 0.72, analystTarget: 475.00 },
  AMZN: { ticker: 'AMZN', name: 'Amazon.com, Inc.', sector: 'Consumer Cyclical', industry: 'Internet Retail', price: 198.42, pe: 42.1, eps: 4.71, marketCap: '2.07T', volume: 41250000, avgVolume: 45800000, high52: 242.52, low52: 151.61, beta: 1.16, dividendYield: 0, analystTarget: 230.00 },
  GOOGL: { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication Services', industry: 'Internet Content', price: 167.52, pe: 22.4, eps: 7.48, marketCap: '2.06T', volume: 28970000, avgVolume: 32100000, high52: 207.05, low52: 142.66, beta: 1.05, dividendYield: 0.45, analystTarget: 195.00 },
  META: { ticker: 'META', name: 'Meta Platforms, Inc.', sector: 'Communication Services', industry: 'Social Media', price: 612.30, pe: 26.3, eps: 23.28, marketCap: '1.55T', volume: 16420000, avgVolume: 18200000, high52: 736.67, low52: 414.50, beta: 1.22, dividendYield: 0.32, analystTarget: 665.00 },
  AMD: { ticker: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors', price: 114.82, pe: 48.2, eps: 2.38, marketCap: '186B', volume: 42830000, avgVolume: 48500000, high52: 227.30, low52: 106.24, beta: 1.72, dividendYield: 0, analystTarget: 145.00 },
  JPM: { ticker: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Banks', price: 252.40, pe: 12.8, eps: 19.72, marketCap: '725B', volume: 8240000, avgVolume: 9100000, high52: 280.25, low52: 182.15, beta: 1.08, dividendYield: 2.12, analystTarget: 270.00 },
  V: { ticker: 'V', name: 'Visa Inc.', sector: 'Financial Services', industry: 'Payments', price: 315.78, pe: 30.5, eps: 10.35, marketCap: '632B', volume: 6120000, avgVolume: 7200000, high52: 340.82, low52: 252.70, beta: 0.96, dividendYield: 0.72, analystTarget: 335.00 },
  UNH: { ticker: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', industry: 'Health Insurance', price: 478.90, pe: 18.2, eps: 26.31, marketCap: '440B', volume: 3820000, avgVolume: 4100000, high52: 630.73, low52: 436.38, beta: 0.68, dividendYield: 1.58, analystTarget: 540.00 },
  JNJ: { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Pharmaceuticals', price: 158.42, pe: 15.6, eps: 10.15, marketCap: '381B', volume: 7520000, avgVolume: 8400000, high52: 173.24, low52: 144.14, beta: 0.52, dividendYield: 3.18, analystTarget: 172.00 },
  WMT: { ticker: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Defensive', industry: 'Retail', price: 92.15, pe: 36.4, eps: 2.53, marketCap: '741B', volume: 12840000, avgVolume: 14200000, high52: 105.30, low52: 65.28, beta: 0.52, dividendYield: 0.92, analystTarget: 98.00 },
  XOM: { ticker: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy', industry: 'Oil & Gas', price: 108.62, pe: 13.8, eps: 7.87, marketCap: '458B', volume: 14520000, avgVolume: 16800000, high52: 126.34, low52: 95.77, beta: 0.82, dividendYield: 3.44, analystTarget: 122.00 },
  DIS: { ticker: 'DIS', name: 'The Walt Disney Company', sector: 'Communication Services', industry: 'Entertainment', price: 102.45, pe: 42.8, eps: 2.39, marketCap: '187B', volume: 9870000, avgVolume: 11200000, high52: 123.74, low52: 83.91, beta: 1.38, dividendYield: 0.88, analystTarget: 118.00 },
  NFLX: { ticker: 'NFLX', name: 'Netflix, Inc.', sector: 'Communication Services', industry: 'Streaming', price: 1028.30, pe: 54.2, eps: 18.97, marketCap: '442B', volume: 4120000, avgVolume: 5200000, high52: 1064.50, low52: 543.22, beta: 1.42, dividendYield: 0, analystTarget: 1050.00 },
  BA: { ticker: 'BA', name: 'The Boeing Company', sector: 'Industrials', industry: 'Aerospace', price: 172.38, pe: -18.5, eps: -9.32, marketCap: '128B', volume: 8940000, avgVolume: 10200000, high52: 199.33, low52: 137.03, beta: 1.52, dividendYield: 0, analystTarget: 195.00 },
  COIN: { ticker: 'COIN', name: 'Coinbase Global', sector: 'Financial Services', industry: 'Crypto Exchange', price: 235.80, pe: 28.4, eps: 8.30, marketCap: '58B', volume: 7620000, avgVolume: 9100000, high52: 349.75, low52: 142.02, beta: 2.85, dividendYield: 0, analystTarget: 275.00 },
  PLTR: { ticker: 'PLTR', name: 'Palantir Technologies', sector: 'Technology', industry: 'Software', price: 97.24, pe: 202.6, eps: 0.48, marketCap: '224B', volume: 68420000, avgVolume: 72000000, high52: 125.41, low52: 21.30, beta: 2.42, dividendYield: 0, analystTarget: 85.00 },
  SOFI: { ticker: 'SOFI', name: 'SoFi Technologies', sector: 'Financial Services', industry: 'Fintech', price: 14.82, pe: 74.1, eps: 0.20, marketCap: '16.2B', volume: 32150000, avgVolume: 38000000, high52: 18.42, low52: 6.38, beta: 1.68, dividendYield: 0, analystTarget: 12.50 },
};

// --- MARKET INDICES ---
export const INDICES = [
  { name: 'S&P 500', ticker: 'SPX', value: 5892.34, change: 0.42, changeAmt: 24.67 },
  { name: 'Nasdaq', ticker: 'IXIC', value: 18654.12, change: 0.68, changeAmt: 126.34 },
  { name: 'Dow Jones', ticker: 'DJI', value: 42180.56, change: 0.15, changeAmt: 63.28 },
  { name: 'Russell 2000', ticker: 'RUT', value: 2084.73, change: -0.34, changeAmt: -7.12 },
];

// --- SECTORS ---
export const SECTORS = [
  { name: 'Technology', change: 1.24, color: '#818cf8' },
  { name: 'Healthcare', change: 0.42, color: '#34d399' },
  { name: 'Financials', change: 0.68, color: '#60a5fa' },
  { name: 'Energy', change: -0.82, color: '#f87171' },
  { name: 'Consumer', change: 0.15, color: '#fbbf24' },
  { name: 'Communication', change: 0.94, color: '#a78bfa' },
  { name: 'Industrials', change: -0.28, color: '#fb923c' },
  { name: 'Real Estate', change: -0.56, color: '#f472b6' },
];

// --- GENERATE PRICE HISTORY ---
export function generatePriceHistory(basePrice, days, volatility = 0.015) {
  const data = [];
  let price = basePrice * (1 - (volatility * days * 0.1));
  const now = Date.now();
  const msPerDay = 86400000;

  for (let i = days; i >= 0; i--) {
    const change = (Math.random() - 0.48) * volatility * price;
    price = Math.max(price * 0.5, price + change);
    const open = price + (Math.random() - 0.5) * volatility * price * 0.5;
    const high = Math.max(price, open) + Math.random() * volatility * price * 0.3;
    const low = Math.min(price, open) - Math.random() * volatility * price * 0.3;
    const vol = Math.floor((0.7 + Math.random() * 0.6) * 50000000);

    data.push({
      date: new Date(now - i * msPerDay),
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +price.toFixed(2),
      volume: vol,
    });
  }

  // Ensure last close matches the basePrice
  if (data.length > 0) {
    data[data.length - 1].close = basePrice;
  }
  return data;
}

// --- GENERATE INTRADAY DATA ---
export function generateIntradayData(basePrice, volatility = 0.005) {
  const data = [];
  let price = basePrice * (1 - volatility * 5);
  const now = new Date();
  const marketOpen = new Date(now);
  marketOpen.setHours(9, 30, 0, 0);

  const minutesSinceOpen = Math.min(390, Math.max(0, (now - marketOpen) / 60000));
  const intervals = Math.floor(minutesSinceOpen / 5);

  for (let i = 0; i <= Math.max(intervals, 78); i++) {
    const change = (Math.random() - 0.48) * volatility * price;
    price = Math.max(price * 0.9, price + change);
    const time = new Date(marketOpen.getTime() + i * 5 * 60000);
    data.push({
      date: time,
      close: +price.toFixed(2),
      volume: Math.floor(Math.random() * 5000000),
    });
  }

  if (data.length > 0) data[data.length - 1].close = basePrice;
  return data;
}

// --- TECHNICAL INDICATORS ---
export function calculateSMA(prices, period) {
  const result = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    result.push(+(sum / period).toFixed(2));
  }
  return result;
}

export function calculateEMA(prices, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) { result.push(+ema.toFixed(2)); continue; }
    ema = (prices[i] - ema) * multiplier + ema;
    result.push(+ema.toFixed(2));
  }
  return result;
}

export function calculateRSI(prices, period = 14) {
  const result = [];
  let gains = 0, losses = 0;

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) { result.push(null); continue; }
    const change = prices[i] - prices[i - 1];
    if (i <= period) {
      if (change > 0) gains += change; else losses -= change;
      if (i < period) { result.push(null); continue; }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(+(100 - 100 / (1 + rs)).toFixed(2));
    } else {
      const avgGain = ((result[i - 1] !== null ? gains / period : 0) * (period - 1) + (change > 0 ? change : 0)) / period;
      const avgLoss = ((result[i - 1] !== null ? losses / period : 0) * (period - 1) + (change < 0 ? -change : 0)) / period;
      gains = avgGain * period;
      losses = avgLoss * period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(+(100 - 100 / (1 + rs)).toFixed(2));
    }
  }
  return result;
}

export function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null) ? +(v - ema26[i]).toFixed(4) : null);
  const validMacd = macdLine.filter(v => v !== null);
  const signalLine = calculateEMA(validMacd, 9);

  const result = { macd: macdLine, signal: [], histogram: [] };
  let si = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      result.signal.push(null);
      result.histogram.push(null);
    } else {
      const sig = signalLine[si] || null;
      result.signal.push(sig);
      result.histogram.push(sig !== null ? +(macdLine[i] - sig).toFixed(4) : null);
      si++;
    }
  }
  return result;
}

export function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  const sma = calculateSMA(prices, period);
  const upper = [], lower = [];

  for (let i = 0; i < prices.length; i++) {
    if (sma[i] === null) { upper.push(null); lower.push(null); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += Math.pow(prices[j] - sma[i], 2);
    }
    const std = Math.sqrt(sumSq / period);
    upper.push(+(sma[i] + stdDev * std).toFixed(2));
    lower.push(+(sma[i] - stdDev * std).toFixed(2));
  }
  return { upper, middle: sma, lower };
}

// --- SUPPORT / RESISTANCE ---
export function calculateSupportResistance(priceHistory) {
  const prices = priceHistory.map(d => d.close);
  const highs = priceHistory.map(d => d.high);
  const lows = priceHistory.map(d => d.low);
  const currentPrice = prices[prices.length - 1];

  // Find local extrema
  const resistanceLevels = [];
  const supportLevels = [];

  for (let i = 5; i < highs.length - 5; i++) {
    const isLocalHigh = highs[i] === Math.max(...highs.slice(i - 5, i + 6));
    const isLocalLow = lows[i] === Math.min(...lows.slice(i - 5, i + 6));
    if (isLocalHigh && highs[i] > currentPrice) resistanceLevels.push(+highs[i].toFixed(2));
    if (isLocalLow && lows[i] < currentPrice) supportLevels.push(+lows[i].toFixed(2));
  }

  // Cluster and pick key levels
  const clusterLevels = (levels) => {
    if (levels.length === 0) return [];
    levels.sort((a, b) => a - b);
    const clusters = [[levels[0]]];
    for (let i = 1; i < levels.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const avg = lastCluster.reduce((a, b) => a + b, 0) / lastCluster.length;
      if (Math.abs(levels[i] - avg) / avg < 0.02) {
        lastCluster.push(levels[i]);
      } else {
        clusters.push([levels[i]]);
      }
    }
    return clusters
      .map(c => +(c.reduce((a, b) => a + b, 0) / c.length).toFixed(2))
      .slice(-3);
  };

  return {
    support: clusterLevels(supportLevels).sort((a, b) => b - a).slice(0, 3),
    resistance: clusterLevels(resistanceLevels).sort((a, b) => a - b).slice(0, 3),
  };
}

// --- NEWS HEADLINES ---
export function getNewsForStock(ticker) {
  const stock = STOCKS[ticker];
  if (!stock) return [];
  const templates = [
    { title: `${stock.name} Reports Strong Q4 Earnings, Beats Estimates`, sentiment: 'positive', source: 'Reuters', time: '2h ago' },
    { title: `Analysts Raise Price Targets for ${ticker} After Guidance Update`, sentiment: 'positive', source: 'Bloomberg', time: '4h ago' },
    { title: `${stock.sector} Sector Faces Headwinds From Rising Interest Rates`, sentiment: 'negative', source: 'CNBC', time: '6h ago' },
    { title: `${stock.name} Announces New Partnership in AI Space`, sentiment: 'positive', source: 'TechCrunch', time: '8h ago' },
    { title: `Regulatory Concerns Mount for ${stock.industry} Companies`, sentiment: 'negative', source: 'WSJ', time: '12h ago' },
    { title: `Institutional Investors Increase Holdings in ${ticker}`, sentiment: 'positive', source: 'Barron\'s', time: '1d ago' },
    { title: `${stock.name} Stock Approaches Key Technical Level`, sentiment: 'neutral', source: 'MarketWatch', time: '1d ago' },
    { title: `Market Outlook: What ${ticker} Investors Should Watch This Week`, sentiment: 'neutral', source: 'Seeking Alpha', time: '2d ago' },
  ];

  // Shuffle and return a subset
  const shuffled = templates.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5 + Math.floor(Math.random() * 3));
}

// --- GENERAL NEWS ---
export function getMarketNews() {
  return [
    { title: 'Federal Reserve Signals Potential Rate Cut in Q3', sentiment: 'positive', source: 'Reuters', time: '1h ago', category: 'Macro' },
    { title: 'Tech Stocks Rally on Strong Earnings Season', sentiment: 'positive', source: 'Bloomberg', time: '2h ago', category: 'Tech' },
    { title: 'Oil Prices Drop Amid Demand Concerns', sentiment: 'negative', source: 'CNBC', time: '3h ago', category: 'Energy' },
    { title: 'AI Chip Demand Continues to Surge, Benefiting Semiconductor Sector', sentiment: 'positive', source: 'TechCrunch', time: '4h ago', category: 'Tech' },
    { title: 'US Jobs Report Comes in Above Expectations', sentiment: 'positive', source: 'WSJ', time: '5h ago', category: 'Macro' },
    { title: 'China Trade Tensions Resurface, Markets React Cautiously', sentiment: 'negative', source: 'Financial Times', time: '6h ago', category: 'Geopolitical' },
    { title: 'Banking Sector Shows Resilience Despite Yield Curve Concerns', sentiment: 'neutral', source: 'Barron\'s', time: '8h ago', category: 'Financials' },
    { title: 'Crypto Markets See Renewed Interest as Bitcoin Approaches $90K', sentiment: 'positive', source: 'CoinDesk', time: '10h ago', category: 'Crypto' },
  ];
}

// --- WATCHLIST STATE ---
let watchlist = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL'];

export function getWatchlist() { return [...watchlist]; }
export function addToWatchlist(ticker) {
  if (!watchlist.includes(ticker) && STOCKS[ticker]) {
    watchlist.push(ticker);
    return true;
  }
  return false;
}
export function removeFromWatchlist(ticker) {
  watchlist = watchlist.filter(t => t !== ticker);
}
export function isInWatchlist(ticker) { return watchlist.includes(ticker); }

// --- PORTFOLIO STATE ---
let portfolio = [
  { ticker: 'AAPL', shares: 25, avgCost: 185.40 },
  { ticker: 'NVDA', shares: 40, avgCost: 108.20 },
  { ticker: 'MSFT', shares: 15, avgCost: 390.50 },
  { ticker: 'GOOGL', shares: 30, avgCost: 142.80 },
  { ticker: 'JPM', shares: 20, avgCost: 215.60 },
];

export function getPortfolio() {
  return portfolio.map(p => {
    const stock = STOCKS[p.ticker];
    const currentValue = stock.price * p.shares;
    const costBasis = p.avgCost * p.shares;
    const gain = currentValue - costBasis;
    const gainPct = ((gain / costBasis) * 100);
    return {
      ...p,
      name: stock.name,
      currentPrice: stock.price,
      currentValue: +currentValue.toFixed(2),
      costBasis: +costBasis.toFixed(2),
      gain: +gain.toFixed(2),
      gainPct: +gainPct.toFixed(2),
      sector: stock.sector,
    };
  });
}

// --- TOP MOVERS ---
export function getTopMovers() {
  const all = Object.values(STOCKS).map(s => ({
    ...s,
    change: +((Math.random() - 0.45) * 8).toFixed(2),
  }));
  all.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    gainers: all.filter(s => s.change > 0).slice(0, 5).map(s => ({
      ticker: s.ticker,
      name: s.name,
      price: s.price,
      change: s.change,
    })),
    losers: all.filter(s => s.change < 0).slice(0, 5).map(s => ({
      ticker: s.ticker,
      name: s.name,
      price: s.price,
      change: s.change,
    })),
  };
}

// Stable movers (don't regenerate on each call)
let _cachedMovers = null;
export function getStableMovers() {
  if (!_cachedMovers) _cachedMovers = getTopMovers();
  return _cachedMovers;
}

// --- SETTINGS STATE ---
let settings = {
  riskTolerance: 'moderate',
  timeHorizon: 'swing',
  alertsEnabled: true,
  rsiAlerts: true,
  priceAlerts: true,
  macdAlerts: true,
  volumeAlerts: true,
};

export function getSettings() { return { ...settings }; }
export function updateSettings(updates) { settings = { ...settings, ...updates }; }

// --- ALERTS ---
export function getAlerts(ticker) {
  const stock = STOCKS[ticker];
  if (!stock) return [];
  return [
    { type: 'info', icon: '📊', message: `${ticker} RSI approaching 70 — monitor for overbought conditions`, time: '15m ago' },
    { type: 'warning', icon: '⚠️', message: `${ticker} price within 2% of resistance at $${(stock.price * 1.04).toFixed(2)}`, time: '30m ago' },
    { type: 'info', icon: '📈', message: `${ticker} volume 15% above average — possible breakout developing`, time: '1h ago' },
    { type: 'success', icon: '✅', message: `${ticker} MACD signal line crossover detected`, time: '2h ago' },
  ];
}
