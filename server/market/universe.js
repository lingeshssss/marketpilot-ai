// Scanner universe — explicit, versioned. Large-cap US stocks across sectors
// plus widely held ETFs. Coverage is reported per scan.

export const UNIVERSE_VERSION = 'mp-us-largecap-etf-2026.10';

export const UNIVERSE = [
  // Technology
  ['AAPL', 'Technology'], ['MSFT', 'Technology'], ['NVDA', 'Technology'], ['AVGO', 'Technology'], ['ORCL', 'Technology'],
  ['CRM', 'Technology'], ['ADBE', 'Technology'], ['AMD', 'Technology'], ['CSCO', 'Technology'], ['INTC', 'Technology'],
  ['QCOM', 'Technology'], ['TXN', 'Technology'], ['IBM', 'Technology'], ['NOW', 'Technology'], ['INTU', 'Technology'],
  ['AMAT', 'Technology'], ['MU', 'Technology'], ['PLTR', 'Technology'],
  // Communication
  ['GOOGL', 'Communication Services'], ['META', 'Communication Services'], ['NFLX', 'Communication Services'],
  ['DIS', 'Communication Services'], ['T', 'Communication Services'], ['VZ', 'Communication Services'], ['CMCSA', 'Communication Services'],
  // Consumer
  ['AMZN', 'Consumer Discretionary'], ['TSLA', 'Consumer Discretionary'], ['HD', 'Consumer Discretionary'], ['MCD', 'Consumer Discretionary'],
  ['NKE', 'Consumer Discretionary'], ['SBUX', 'Consumer Discretionary'], ['LOW', 'Consumer Discretionary'], ['BKNG', 'Consumer Discretionary'],
  ['WMT', 'Consumer Staples'], ['COST', 'Consumer Staples'], ['PG', 'Consumer Staples'], ['KO', 'Consumer Staples'], ['PEP', 'Consumer Staples'],
  ['PM', 'Consumer Staples'],
  // Financials
  ['JPM', 'Financials'], ['BAC', 'Financials'], ['WFC', 'Financials'], ['GS', 'Financials'], ['MS', 'Financials'],
  ['V', 'Financials'], ['MA', 'Financials'], ['AXP', 'Financials'], ['BRK.B', 'Financials'], ['SCHW', 'Financials'], ['COIN', 'Financials'],
  // Healthcare
  ['UNH', 'Health Care'], ['JNJ', 'Health Care'], ['LLY', 'Health Care'], ['ABBV', 'Health Care'], ['MRK', 'Health Care'],
  ['PFE', 'Health Care'], ['TMO', 'Health Care'], ['ABT', 'Health Care'], ['AMGN', 'Health Care'],
  // Industrials
  ['CAT', 'Industrials'], ['BA', 'Industrials'], ['GE', 'Industrials'], ['HON', 'Industrials'], ['UPS', 'Industrials'],
  ['RTX', 'Industrials'], ['DE', 'Industrials'], ['LMT', 'Industrials'],
  // Energy, materials, utilities, real estate
  ['XOM', 'Energy'], ['CVX', 'Energy'], ['COP', 'Energy'], ['LIN', 'Materials'], ['NEE', 'Utilities'], ['DUK', 'Utilities'],
  ['PLD', 'Real Estate'], ['AMT', 'Real Estate'],
  // ETFs
  ['SPY', 'ETF'], ['QQQ', 'ETF'], ['DIA', 'ETF'], ['IWM', 'ETF'], ['VTI', 'ETF'], ['VOO', 'ETF'], ['EFA', 'ETF'],
  ['EEM', 'ETF'], ['TLT', 'ETF'], ['GLD', 'ETF'], ['XLK', 'ETF'], ['XLF', 'ETF'], ['XLE', 'ETF'], ['XLV', 'ETF'], ['SMH', 'ETF'],
].map(([symbol, sector]) => ({ symbol, sector }));

export const UNIVERSE_SYMBOLS = UNIVERSE.map((u) => u.symbol);
export const SECTOR_OF = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.sector]));

// Benchmarks shown on the dashboard (ETF proxies — index levels need a separate entitlement).
export const MARKET_PROXIES = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)' },
  { symbol: 'QQQ', label: 'Nasdaq-100 (QQQ)' },
  { symbol: 'DIA', label: 'Dow 30 (DIA)' },
  { symbol: 'IWM', label: 'Russell 2000 (IWM)' },
];
