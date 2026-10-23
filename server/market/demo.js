// ============================================================
// DEMO PROVIDER — synthetic, deterministic data for development and
// explicitly labelled demonstrations. Enabled ONLY by
// MARKET_DATA_PROVIDER=demo; refused in production unless
// ALLOW_DEMO_DATA_IN_PRODUCTION=true. Every response is tagged source:'demo'.
// It never fabricates news, dividends, fundamentals, or splits.
// ============================================================

import { lastCompletedSession, nextTradingDay, sessionBounds, isTradingDay } from '../../public/shared/calendar.js';
import { ProviderError } from './errors.js';
import { UNIVERSE } from './universe.js';

const NAMES = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', NVDA: 'NVIDIA Corp.', AVGO: 'Broadcom Inc.', ORCL: 'Oracle Corp.', CRM: 'Salesforce Inc.',
  ADBE: 'Adobe Inc.', AMD: 'Advanced Micro Devices', CSCO: 'Cisco Systems', INTC: 'Intel Corp.', QCOM: 'Qualcomm Inc.', TXN: 'Texas Instruments',
  IBM: 'IBM', NOW: 'ServiceNow Inc.', INTU: 'Intuit Inc.', AMAT: 'Applied Materials', MU: 'Micron Technology', PLTR: 'Palantir Technologies',
  GOOGL: 'Alphabet Inc. Class A', META: 'Meta Platforms', NFLX: 'Netflix Inc.', DIS: 'Walt Disney Co.', T: 'AT&T Inc.', VZ: 'Verizon Communications',
  CMCSA: 'Comcast Corp.', AMZN: 'Amazon.com Inc.', TSLA: 'Tesla Inc.', HD: 'Home Depot', MCD: "McDonald's Corp.", NKE: 'Nike Inc.',
  SBUX: 'Starbucks Corp.', LOW: "Lowe's Companies", BKNG: 'Booking Holdings', WMT: 'Walmart Inc.', COST: 'Costco Wholesale', PG: 'Procter & Gamble',
  KO: 'Coca-Cola Co.', PEP: 'PepsiCo Inc.', PM: 'Philip Morris International', JPM: 'JPMorgan Chase & Co.', BAC: 'Bank of America', WFC: 'Wells Fargo',
  GS: 'Goldman Sachs', MS: 'Morgan Stanley', V: 'Visa Inc.', MA: 'Mastercard Inc.', AXP: 'American Express', 'BRK.B': 'Berkshire Hathaway Class B',
  SCHW: 'Charles Schwab', COIN: 'Coinbase Global', UNH: 'UnitedHealth Group', JNJ: 'Johnson & Johnson', LLY: 'Eli Lilly', ABBV: 'AbbVie Inc.',
  MRK: 'Merck & Co.', PFE: 'Pfizer Inc.', TMO: 'Thermo Fisher Scientific', ABT: 'Abbott Laboratories', AMGN: 'Amgen Inc.', CAT: 'Caterpillar Inc.',
  BA: 'Boeing Co.', GE: 'GE Aerospace', HON: 'Honeywell International', UPS: 'United Parcel Service', RTX: 'RTX Corp.', DE: 'Deere & Co.',
  LMT: 'Lockheed Martin', XOM: 'Exxon Mobil', CVX: 'Chevron Corp.', COP: 'ConocoPhillips', LIN: 'Linde plc', NEE: 'NextEra Energy',
  DUK: 'Duke Energy', PLD: 'Prologis Inc.', AMT: 'American Tower', SPY: 'SPDR S&P 500 ETF Trust', QQQ: 'Invesco QQQ Trust',
  DIA: 'SPDR Dow Jones Industrial Average ETF', IWM: 'iShares Russell 2000 ETF', VTI: 'Vanguard Total Stock Market ETF',
  VOO: 'Vanguard S&P 500 ETF', EFA: 'iShares MSCI EAFE ETF', EEM: 'iShares MSCI Emerging Markets ETF', TLT: 'iShares 20+ Year Treasury Bond ETF',
  GLD: 'SPDR Gold Shares', XLK: 'Technology Select Sector SPDR', XLF: 'Financial Select Sector SPDR', XLE: 'Energy Select Sector SPDR',
  XLV: 'Health Care Select Sector SPDR', SMH: 'VanEck Semiconductor ETF',
};

const START = '2024-01-02';

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed) { let s = seed || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const seriesCache = new Map();
function series(symbol, now) {
  const end = lastCompletedSession(now);
  const key = `${symbol}|${end}`;
  if (seriesCache.has(key)) return seriesCache.get(key);
  const r = prng(hash(symbol));
  const base = 20 + (hash(symbol + 'p') % 480);
  const drift = ((hash(symbol + 'd') % 100) - 40) / 100000;
  const vol = 0.008 + (hash(symbol + 'v') % 20) / 1000;
  const avgVol = 2e6 + (hash(symbol + 'q') % 60) * 1e6;
  const bars = [];
  let d = START, p = base;
  while (d <= end) {
    const ret = drift + vol * gauss(r);
    const o = p * (1 + vol * 0.3 * gauss(r));
    const c = Math.max(1, p * (1 + ret));
    const h = Math.max(o, c) * (1 + Math.abs(vol * 0.5 * gauss(r)));
    const l = Math.min(o, c) * (1 - Math.abs(vol * 0.5 * gauss(r)));
    const v = Math.round(avgVol * (0.6 + r() * 0.8));
    bars.push({ date: d, t: sessionBounds(d).open.getTime(), o: +o.toFixed(4), h: +h.toFixed(4), l: +l.toFixed(4), c: +c.toFixed(4), v });
    p = c;
    d = nextTradingDay(d);
  }
  seriesCache.set(key, bars);
  if (seriesCache.size > 500) seriesCache.delete(seriesCache.keys().next().value);
  return bars;
}

function instrument(symbol) {
  const u = UNIVERSE.find((x) => x.symbol === symbol);
  if (!u) return null;
  return {
    id: `demo:${symbol}`, symbol, name: NAMES[symbol] || symbol,
    exchange: 'Demo exchange', exchangeMic: null, type: u.sector === 'ETF' ? 'ETF' : 'Common Stock', typeCode: u.sector === 'ETF' ? 'ETF' : 'CS',
    currency: 'USD', active: true, figi: { composite: null, shareClass: null }, cik: null,
  };
}

export function createDemoProvider({ now = () => new Date() } = {}) {
  return {
    name: 'demo',
    label: 'Demo data (synthetic)',
    caps: { quotes: 'demo', snapshot: false, statements: false, historyYears: 3 },

    async search(q) {
      const s = q.trim().toUpperCase();
      return UNIVERSE.map((u) => instrument(u.symbol))
        .filter((i) => i.symbol.startsWith(s) || i.name.toUpperCase().includes(s))
        .slice(0, 20);
    },
    async instrument(symbol) {
      const i = instrument(symbol);
      if (!i) throw new ProviderError('not_found', `${symbol} is not in the demo universe`);
      return { ...i, description: null, homepage: null, listDate: null, marketCap: null, sharesOutstanding: null, sic: null, employees: null };
    },
    async dailyBars(symbol, from, to) {
      if (!instrument(symbol)) throw new ProviderError('not_found', `${symbol} is not in the demo universe`);
      return { bars: series(symbol, now()).filter((b) => b.date >= from && b.date <= to), adjusted: true };
    },
    async intradayBars(symbol, from, to, minutes = 5) {
      const daily = series(symbol, now()).filter((b) => b.date >= from && b.date <= to);
      const bars = [];
      for (const day of daily) {
        const b = sessionBounds(day.date);
        const n = Math.round((b.close.getTime() - b.open.getTime()) / (minutes * 60000));
        const r = prng(hash(symbol + day.date));
        let p = day.o;
        for (let i = 0; i < n; i++) {
          const remaining = n - i;
          const target = p + (day.c - p) / remaining;
          const c = i === n - 1 ? day.c : Math.min(day.h, Math.max(day.l, target + (day.h - day.l) * 0.08 * gauss(r)));
          bars.push({ t: b.open.getTime() + i * minutes * 60000, o: p, h: Math.max(p, c), l: Math.min(p, c), c, v: Math.round(day.v / n) });
          p = c;
        }
      }
      return { bars };
    },
    async groupedDaily(date) {
      if (!isTradingDay(date)) return new Map();
      const m = new Map();
      for (const u of UNIVERSE) { const b = series(u.symbol, now()).find((x) => x.date === date); if (b) m.set(u.symbol, b); }
      return m;
    },
    async snapshots() { throw new ProviderError('not_entitled', 'Demo provider has no intraday snapshots'); },
    async news() { return []; },
    async dividends() { return []; },
    async splits() { return []; },
    async holidays() { return []; },
    async incomeStatements() { throw new ProviderError('not_entitled', 'Demo provider has no financial statements'); },
  };
}
