// ============================================================
// Massive (formerly Polygon.io) REST adapter.
// Docs: https://massive.com/docs/rest/stocks  (verified 2026-10-18)
// Normalises responses to provider-neutral shapes and validates them.
// ============================================================

import { exchangeParts } from '../../public/shared/calendar.js';
import { validateBars, DataQualityError } from '../../public/shared/bars.js';
import { z } from 'zod';
import { ProviderError } from './errors.js';
import { acquireProviderSlot } from './ratelimit.js';

const TYPES = {
  CS: 'Common Stock', ETF: 'ETF', ETN: 'ETN', ETV: 'Exchange-Traded Vehicle', ADRC: 'ADR', PFD: 'Preferred',
  FUND: 'Fund', OS: 'Ordinary Shares', GDR: 'GDR', NYRS: 'NY Registry Shares', UNIT: 'Unit', WARRANT: 'Warrant', RIGHT: 'Right', SP: 'Structured Product',
};
const EXCHANGES = { XNAS: 'Nasdaq', XNYS: 'NYSE', ARCX: 'NYSE Arca', BATS: 'Cboe BZX', XASE: 'NYSE American', IEXG: 'IEX' };

// ---- response contracts (validated at runtime; unknown fields pass through) ----
const num = z.number().finite();
const optStr = z.string().nullish();
const S = {
  tickers: z.object({ results: z.array(z.object({ ticker: z.string().min(1), name: optStr, type: optStr, primary_exchange: optStr, composite_figi: optStr, share_class_figi: optStr, active: z.boolean().nullish(), currency_name: optStr }).passthrough()).nullish() }).passthrough(),
  overview: z.object({ results: z.object({ ticker: z.string().min(1), name: optStr, market_cap: num.nullish(), weighted_shares_outstanding: num.nullish() }).passthrough().nullish() }).passthrough(),
  aggs: z.object({ adjusted: z.boolean().nullish(), results: z.array(z.object({ t: num, o: num, h: num, l: num, c: num, v: num.nullish(), vw: num.nullish() }).passthrough()).nullish() }).passthrough(),
  grouped: z.object({ results: z.array(z.object({ T: z.string() }).passthrough()).nullish() }).passthrough(),
  snapshot: z.object({ tickers: z.array(z.object({ ticker: z.string() }).passthrough()).nullish() }).passthrough(),
  news: z.object({ results: z.array(z.object({ id: z.union([z.string(), z.number()]), title: optStr, article_url: optStr, published_utc: z.string() }).passthrough()).nullish() }).passthrough(),
  dividends: z.object({ results: z.array(z.object({ ex_dividend_date: z.string(), cash_amount: num }).passthrough()).nullish() }).passthrough(),
  splits: z.object({ results: z.array(z.object({ ticker: z.string(), execution_date: z.string(), split_from: num, split_to: num }).passthrough()).nullish() }).passthrough(),
  holidays: z.array(z.object({ date: z.string(), exchange: z.string(), status: z.string(), name: optStr }).passthrough()),
  statements: z.object({ results: z.array(z.object({ period_end: z.string() }).passthrough()).nullish() }).passthrough(),
};

/** Validates a provider payload against its contract or throws invalid_data. */
function parse(schema, body, label) {
  const r = schema.safeParse(body);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ProviderError('invalid_data', `Unexpected ${label} response from provider (${i?.path?.join('.') || 'root'}: ${i?.message})`);
  }
  return r.data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dateOfMs = (ms) => exchangeParts(new Date(ms)).date;

export function createMassiveProvider(cfg, { fetchImpl = globalThis.fetch } = {}) {
  const { apiKey, baseUrl, caps, rateLimitPerMin, timeoutMs } = cfg;

  async function call(pathname, params = {}, { signal = undefined } = {}) {
    const url = new URL(baseUrl + pathname);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    let attempt = 0;
    // Bounded retries: network errors / 5xx only, max 2 retries with jittered backoff.
    for (;;) {
      await acquireProviderSlot('massive', rateLimitPerMin);
      let res;
      try {
        const timeout = AbortSignal.timeout(timeoutMs);
        res = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        if (attempt++ < 2) { await sleep(250 * 2 ** attempt + Math.random() * 200); continue; }
        throw new ProviderError(e.name === 'TimeoutError' ? 'timeout' : 'unavailable', `Market data provider unreachable: ${e.message}`);
      }
      if (res.status === 429) {
        throw new ProviderError('rate_limited', 'Market data provider rate limit reached', { retryAfter: Number(res.headers.get('retry-after')) || 60, status: 429 });
      }
      if (res.status === 401) throw new ProviderError('unauthorized', 'Market data API key was rejected', { status: 401 });
      if (res.status === 403) throw new ProviderError('not_entitled', 'This data is not included in the configured market data plan', { status: 403 });
      if (res.status === 404) throw new ProviderError('not_found', 'Not found at provider', { status: 404 });
      if (res.status >= 500) {
        if (attempt++ < 2) { await sleep(250 * 2 ** attempt + Math.random() * 200); continue; }
        throw new ProviderError('unavailable', `Market data provider error ${res.status}`, { status: res.status });
      }
      if (!res.ok) throw new ProviderError('unavailable', `Market data provider returned ${res.status}`, { status: res.status });
      let body;
      try { body = await res.json(); } catch { throw new ProviderError('invalid_data', 'Provider returned malformed JSON'); }
      if (body && (body.status === 'ERROR' || body.status === 'NOT_AUTHORIZED')) {
        throw new ProviderError(body.status === 'NOT_AUTHORIZED' ? 'not_entitled' : 'unavailable', body.error || body.message || 'Provider error');
      }
      return body;
    }
  }

  function normInstrument(r) {
    return {
      id: r.composite_figi || r.share_class_figi || `massive:${r.ticker}`,
      symbol: r.ticker,
      name: r.name || r.ticker,
      exchange: EXCHANGES[r.primary_exchange] || r.primary_exchange || null,
      exchangeMic: r.primary_exchange || null,
      type: TYPES[r.type] || r.type || null,
      typeCode: r.type || null,
      currency: (r.currency_name || r.currency_symbol || 'usd').toUpperCase(),
      active: r.active !== false,
      figi: { composite: r.composite_figi || null, shareClass: r.share_class_figi || null },
      cik: r.cik || null,
    };
  }

  function normBars(results, symbol) {
    if (!Array.isArray(results)) return [];
    const bars = results.map((r) => ({ date: dateOfMs(r.t), t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0, vw: r.vw ?? null }));
    try { validateBars(bars, { symbol }); } catch (e) {
      if (e instanceof DataQualityError) throw new ProviderError('invalid_data', e.message);
      throw e;
    }
    return bars;
  }

  return {
    name: 'massive',
    label: 'Massive (formerly Polygon.io)',
    caps,

    async search(q, { limit = 20, signal = undefined } = {}) {
      const body = parse(S.tickers, await call('/v3/reference/tickers', { search: q, market: 'stocks', active: 'true', limit: Math.min(limit, 50) }, { signal }), 'search');
      return (body.results || []).map(normInstrument);
    },

    async instrument(symbol, { signal = undefined } = {}) {
      const body = parse(S.overview, await call(`/v3/reference/tickers/${encodeURIComponent(symbol)}`, {}, { signal }), 'ticker overview');
      const r = body.results;
      if (!r) throw new ProviderError('not_found', `${symbol} not found`);
      return {
        ...normInstrument(r),
        description: r.description || null,
        homepage: /^https?:\/\//.test(r.homepage_url || '') ? r.homepage_url : null,
        listDate: r.list_date || null,
        marketCap: Number.isFinite(r.market_cap) ? r.market_cap : null,
        sharesOutstanding: Number.isFinite(r.weighted_shares_outstanding) ? r.weighted_shares_outstanding : (Number.isFinite(r.share_class_shares_outstanding) ? r.share_class_shares_outstanding : null),
        sic: r.sic_description || null,
        employees: Number.isFinite(r.total_employees) ? r.total_employees : null,
      };
    },

    async dailyBars(symbol, from, to, { signal = undefined } = {}) {
      const body = parse(S.aggs, await call(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: 50000 }, { signal }), 'daily bars');
      return { bars: normBars(body.results, symbol), adjusted: body.adjusted !== false };
    },

    async intradayBars(symbol, from, to, minutes = 5, { signal = undefined } = {}) {
      const body = parse(S.aggs, await call(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${minutes}/minute/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: 50000 }, { signal }), 'intraday bars');
      const results = Array.isArray(body.results) ? body.results : [];
      const bars = results.map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0 }));
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        if (![b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) || b.l <= 0) throw new ProviderError('invalid_data', `${symbol}: malformed intraday bar`);
        if (i && b.t <= bars[i - 1].t) throw new ProviderError('invalid_data', `${symbol}: intraday bars out of order`);
      }
      return { bars };
    },

    /** One call returns the daily bar for every US stock on a date. */
    async groupedDaily(date, { signal = undefined } = {}) {
      const body = parse(S.grouped, await call(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: 'true' }, { signal }), 'grouped daily');
      const map = new Map();
      for (const r of body.results || []) {
        if (!r.T || ![r.o, r.h, r.l, r.c].every(Number.isFinite) || r.c <= 0) continue;
        if (r.h < Math.max(r.o, r.c, r.l) || r.l > Math.min(r.o, r.c)) continue; // drop inconsistent rows
        map.set(r.T, { date, t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0 });
      }
      return map;
    },

    async snapshots(symbols, { signal = undefined } = {}) {
      if (!caps.snapshot) throw new ProviderError('not_entitled', 'Snapshots require a Starter plan or higher');
      const body = parse(S.snapshot, await call('/v2/snapshot/locale/us/markets/stocks/tickers', { tickers: symbols.join(',') }, { signal }), 'snapshot');
      const out = new Map();
      for (const t of body.tickers || []) {
        const lastPrice = t.lastTrade?.p ?? t.min?.c ?? t.day?.c;
        const prevClose = t.prevDay?.c;
        if (!Number.isFinite(lastPrice) || !Number.isFinite(prevClose) || lastPrice <= 0 || prevClose <= 0) continue;
        const tsNs = t.lastTrade?.t ?? t.updated;
        out.set(t.ticker, {
          price: lastPrice, prevClose,
          dayOpen: t.day?.o ?? null, dayHigh: t.day?.h ?? null, dayLow: t.day?.l ?? null, dayVolume: t.day?.v ?? null,
          marketTime: Number.isFinite(tsNs) ? new Date(Math.floor(tsNs / 1e6)).toISOString() : null,
        });
      }
      return out;
    },

    /** @param {string|null} symbol null = market-wide news */
    async news(symbol, { limit = 20, signal = undefined } = {}) {
      const body = parse(S.news, await call('/v2/reference/news', { ticker: symbol || undefined, limit, order: 'desc', sort: 'published_utc' }, { signal }), 'news');
      return (body.results || []).filter((a) => a && a.title && /^https?:\/\//.test(a.article_url || '')).map((a) => {
        const sentiment = {}; const reasoning = {};
        for (const i of a.insights || []) {
          if (i && i.ticker && ['positive', 'negative', 'neutral'].includes(i.sentiment)) {
            sentiment[i.ticker] = i.sentiment;
            if (i.sentiment_reasoning) reasoning[i.ticker] = String(i.sentiment_reasoning).slice(0, 400);
          }
        }
        return {
          id: String(a.id),
          title: String(a.title).slice(0, 300),
          description: a.description ? String(a.description).slice(0, 1200) : null,
          url: a.article_url,
          publisher: a.publisher?.name || 'Unknown publisher',
          publisherUrl: /^https?:\/\//.test(a.publisher?.homepage_url || '') ? a.publisher.homepage_url : null,
          author: a.author || null,
          publishedAt: a.published_utc,
          tickers: Array.isArray(a.tickers) ? a.tickers.slice(0, 20) : [],
          sentiment, sentimentReasoning: reasoning,
          sentimentSource: 'Massive news insights',
        };
      });
    },

    async dividends(symbol, { signal = undefined } = {}) {
      const body = parse(S.dividends, await call('/stocks/v1/dividends', { ticker: symbol, limit: 24, sort: 'ex_dividend_date.desc' }, { signal }), 'dividends');
      return (body.results || []).map((d) => ({
        exDate: d.ex_dividend_date, payDate: d.pay_date || null, recordDate: d.record_date || null, declaredDate: d.declaration_date || null,
        amount: d.cash_amount, splitAdjustedAmount: d.split_adjusted_cash_amount ?? null, currency: d.currency || 'USD',
        frequency: d.frequency ?? null, type: d.distribution_type || null,
      }));
    },

    async splits({ symbol = undefined, since = undefined } = {}, { signal = undefined } = {}) {
      const body = parse(S.splits, await call('/stocks/v1/splits', { ticker: symbol, 'execution_date.gte': since, limit: 1000, sort: 'execution_date.desc' }, { signal }), 'splits');
      return (body.results || []).map((s) => ({ symbol: s.ticker, date: s.execution_date, from: s.split_from, to: s.split_to, type: s.adjustment_type || null }));
    },

    async holidays({ signal = undefined } = {}) {
      const arr = parse(S.holidays, await call('/v1/marketstatus/upcoming', {}, { signal }), 'market holidays');
      return arr.filter((h) => h.exchange === 'NYSE').map((h) => ({ date: h.date, status: h.status, name: h.name }));
    },

    async incomeStatements(symbol, { signal = undefined } = {}) {
      if (!caps.statements) throw new ProviderError('not_entitled', 'Financial statements require the Advanced plan or the Financials add-on');
      const body = parse(S.statements, await call('/stocks/financials/v1/income-statements', { tickers: symbol, timeframe: 'quarterly', limit: 8, sort: 'period_end.desc' }, { signal }), 'income statements');
      return (body.results || []).map((r) => ({
        periodEnd: r.period_end, filingDate: r.filing_date, fiscalYear: r.fiscal_year, fiscalQuarter: r.fiscal_quarter, timeframe: r.timeframe,
        revenue: r.revenue ?? null, netIncome: r.net_income_loss_attributable_common_shareholders ?? null,
        epsDiluted: r.diluted_earnings_per_share ?? null, epsBasic: r.basic_earnings_per_share ?? null,
      }));
    },
  };
}
