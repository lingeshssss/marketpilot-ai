// ============================================================
// Market data service — the ONE place quotes, bars and analysis are
// produced. Every screen (dashboard, ticker, scanner, watchlists, detail,
// alerts, portfolio) consumes these normalized objects.
//
// Caching: per-instance memory + shared Postgres cache, in-flight request
// de-duplication, and last-known-value fallback marked `stale` (never
// fabricated). Provider failures surface as explicit statuses.
// ============================================================

import { createHash } from 'node:crypto';
import { config, capabilities } from '../config.js';
import { query, hasDatabase } from '../db.js';
import { AppError } from '../errors.js';
import { log } from '../log.js';
import { ProviderError } from './errors.js';
import { createMassiveProvider } from './massive.js';
import { createDemoProvider } from './demo.js';
import {
  lastCompletedSession, previousTradingDay, sessionBounds, marketState, addDays, registerCalendarOverrides, exchangeParts,
} from '../../public/shared/calendar.js';
import { buildAnalysis, ANALYSIS_VERSION } from '../../public/shared/analysis.js';

let providerOverride = null;
let providerInstance = null;
let clock = () => new Date();

export function __setProviderForTests(p) { providerOverride = p; providerInstance = null; mem.clear(); inflight.clear(); }
export function __setClockForTests(fn) { clock = fn || (() => new Date()); }
export function now() { return clock(); }

export function getProvider() {
  if (providerOverride) return providerOverride;
  if (providerInstance) return providerInstance;
  const caps = capabilities();
  if (caps.marketData.status !== 'configured') {
    const msg = {
      unconfigured: 'Market data is unavailable: no provider is configured (set MARKET_DATA_PROVIDER).',
      missing_credentials: 'Market data is unavailable: the provider API key is missing.',
      demo_blocked_in_production: 'Demo data is disabled in production.',
    }[caps.marketData.status];
    throw new AppError(503, 'market_data_unavailable', msg);
  }
  providerInstance = config.market.provider === 'massive'
    ? createMassiveProvider(config.market.massive)
    : createDemoProvider({ now: () => clock() });
  return providerInstance;
}

export function providerInfo() {
  const p = getProvider();
  return { name: p.name, label: p.label, timeliness: p.caps.quotes, demo: p.name === 'demo' };
}

// ---------------- caching ----------------

const mem = new Map();      // key -> { value, fetchedAt, expiresAt }
const inflight = new Map(); // key -> Promise

async function dbGet(key) {
  if (!hasDatabase()) return null;
  try {
    const r = await query('select payload, fetched_at, expires_at from market_cache where key=$1', [key]);
    const row = r.rows[0];
    return row ? { value: row.payload, fetchedAt: row.fetched_at.toISOString(), expiresAt: row.expires_at.getTime() } : null;
  } catch { return null; }
}
async function dbPut(key, value, fetchedAt, expiresAt) {
  if (!hasDatabase()) return;
  try {
    await query(`insert into market_cache(key, payload, fetched_at, expires_at) values ($1,$2,$3,to_timestamp($4/1000.0))
      on conflict (key) do update set payload=excluded.payload, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at`,
    [key, JSON.stringify(value), fetchedAt, expiresAt]);
  } catch (e) { log.warn('market_cache_write_failed', { key, error: e }); }
}

/**
 * Returns { value, fetchedAt, stale, error }. On loader failure, serves the
 * last known value marked stale; with no prior value, rethrows.
 */
export async function cached(key, ttlMs, loader) {
  const t = Date.now();
  const m = mem.get(key);
  if (m && m.expiresAt > t) return { value: m.value, fetchedAt: m.fetchedAt, stale: false };
  const d = await dbGet(key);
  if (d && d.expiresAt > t) { mem.set(key, d); return { value: d.value, fetchedAt: d.fetchedAt, stale: false }; }
  const last = m || d;

  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      try {
        const value = await loader();
        const fetchedAt = new Date().toISOString();
        const expiresAt = Date.now() + ttlMs;
        mem.set(key, { value, fetchedAt, expiresAt });
        if (mem.size > 2000) mem.delete(mem.keys().next().value);
        await dbPut(key, value, fetchedAt, expiresAt);
        return { value, fetchedAt, stale: false };
      } finally { inflight.delete(key); }
    })());
  }
  try {
    return await inflight.get(key);
  } catch (e) {
    if (last && !(e instanceof ProviderError && e.kind === 'not_found')) {
      return { value: last.value, fetchedAt: last.fetchedAt, stale: true, error: providerErrorInfo(e) };
    }
    throw e;
  }
}

export function providerErrorInfo(e) {
  if (e instanceof ProviderError) return { kind: e.kind, message: e.message, retryAfter: e.retryAfter ?? null };
  if (e instanceof AppError) return { kind: e.code, message: e.message };
  return { kind: 'unavailable', message: 'Market data request failed' };
}

export function toAppError(e) {
  if (e instanceof AppError) return e;
  if (e instanceof ProviderError) {
    const status = { not_found: 404, rate_limited: 429, not_entitled: 403, unauthorized: 502, invalid_data: 502, timeout: 504 }[e.kind] || 503;
    const err = new AppError(status, `provider_${e.kind}`, e.message, e.retryAfter ? { retryAfter: e.retryAfter } : undefined);
    return err;
  }
  return e;
}

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
export function normSymbol(s) {
  const v = String(s || '').trim().toUpperCase();
  if (!SYMBOL_RE.test(v)) throw new AppError(400, 'invalid_symbol', `"${String(s).slice(0, 12)}" is not a valid symbol`);
  return v;
}

// ---------------- calendar overrides from provider ----------------

export async function loadCalendarOverrides() {
  try {
    const p = getProvider();
    const r = await cached(`holidays:${p.name}`, 12 * 3600_000, () => p.holidays());
    registerCalendarOverrides(r.value);
  } catch { /* rules-based calendar remains authoritative */ }
}

// ---------------- daily bars (grouped, persisted) ----------------

const GROUPED_EMPTY_TTL = 30 * 60_000;

/** Map(symbol -> bar) for a session date; persisted to daily_bars when a DB exists. */
export async function getGroupedDay(date) {
  const p = getProvider();
  if (hasDatabase()) {
    const g = await query('select result_count, fetched_at from grouped_days where date=$1', [date]);
    if (g.rows[0] && g.rows[0].result_count > 0) {
      const rows = await query('select symbol, o, h, l, c, v from daily_bars where date=$1', [date]);
      return new Map(rows.rows.map((r) => [r.symbol, { date, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }]));
    }
  }
  const res = await cached(`grouped:${p.name}:${date}`, GROUPED_EMPTY_TTL, async () => {
    const map = await p.groupedDaily(date);
    return [...map.entries()];
  });
  const map = new Map(res.value);
  if (hasDatabase() && map.size > 0) await persistGrouped(date, map, p.name);
  return map;
}

export async function persistGrouped(date, map, source) {
  const entries = [...map.entries()];
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    const vals = []; const params = [];
    chunk.forEach(([sym, b], j) => {
      const k = j * 8;
      vals.push(`($${k + 1},$${k + 2},$${k + 3},$${k + 4},$${k + 5},$${k + 6},$${k + 7},$${k + 8})`);
      params.push(sym, date, b.o, b.h, b.l, b.c, b.v, source);
    });
    await query(`insert into daily_bars(symbol,date,o,h,l,c,v,source) values ${vals.join(',')}
      on conflict (symbol,date) do update set o=excluded.o,h=excluded.h,l=excluded.l,c=excluded.c,v=excluded.v,source=excluded.source,fetched_at=now()`, params);
  }
  await query(`insert into grouped_days(date, source, result_count) values ($1,$2,$3)
    on conflict (date) do update set result_count=excluded.result_count, fetched_at=now()`, [date, source, map.size]);
}

// ---------------- quotes ----------------

function quoteFromBars(symbol, last, prev, { source, timeliness, expected, retrievedAt, stale, error }) {
  const change = last.c - prev.c;
  const fresh = last.date === expected && !stale;
  return {
    symbol,
    price: last.c,
    prevClose: prev.c,
    change,
    changePct: (change / prev.c) * 100,
    changeBasis: 'Regular-session close vs previous regular-session close',
    sessionDate: last.date,
    prevSessionDate: prev.date,
    session: 'regular-close',
    marketTime: sessionBounds(last.date).close.toISOString(),
    retrievedAt,
    source, timeliness,
    dayOpen: last.o, dayHigh: last.h, dayLow: last.l, dayVolume: last.v,
    status: fresh ? 'fresh' : 'stale',
    reason: fresh ? null : (error?.message || `Latest published close is ${last.date}; expected ${expected}.`),
    quoteId: `${source}:${symbol}:${last.date}:${last.c}`,
  };
}

function unavailableQuote(symbol, reason, source) {
  return { symbol, price: null, prevClose: null, change: null, changePct: null, status: 'unavailable', reason, source, retrievedAt: new Date().toISOString(), quoteId: null };
}

/** End-of-day quotes from grouped daily bars (2 provider calls per session for all symbols). */
async function eodQuotes(symbols) {
  const p = getProvider();
  const expected = lastCompletedSession(clock());
  let lastDate = expected;
  let lastMap = await getGroupedDay(expected);
  let note = null;
  if (lastMap.size === 0) {
    lastDate = previousTradingDay(expected);
    lastMap = await getGroupedDay(lastDate);
    note = `The provider has not published the ${expected} close yet.`;
  }
  const prevDate = previousTradingDay(lastDate);
  const prevMap = await getGroupedDay(prevDate);
  // Stored previous-session bars predate any split executed on `lastDate`;
  // restate them on the post-split share basis so the change is not distorted.
  const splitFactor = new Map();
  try {
    for (const sp of await getRecentSplits(addDays(prevDate, 1))) {
      if (sp.date > prevDate && sp.date <= lastDate && sp.from > 0 && sp.to > 0) splitFactor.set(sp.symbol, (splitFactor.get(sp.symbol) || 1) * (sp.from / sp.to));
    }
  } catch { /* if the splits feed fails, affected symbols resolve through per-symbol adjusted history below */
    for (const s of symbols) if (lastMap.get(s) && prevMap.get(s) && Math.abs(lastMap.get(s).c / prevMap.get(s).c - 1) > 0.4) prevMap.delete(s);
  }
  const retrievedAt = new Date().toISOString();
  const out = {};
  for (const s of symbols) {
    const last = lastMap.get(s);
    let prev = prevMap.get(s);
    if (prev && splitFactor.has(s)) {
      const f = splitFactor.get(s);
      prev = { ...prev, o: prev.o * f, h: prev.h * f, l: prev.l * f, c: prev.c * f, v: prev.v / f };
    }
    if (last && prev) {
      out[s] = quoteFromBars(s, last, prev, { source: p.name, timeliness: p.caps.quotes, expected, retrievedAt, stale: !!note, error: note ? { message: note } : null });
    } else {
      out[s] = null; // resolved below via per-symbol history
    }
  }
  // Symbols missing from grouped data: per-symbol history (bounded).
  const missing = symbols.filter((s) => !out[s]).slice(0, 10);
  for (const s of missing) {
    try {
      const h = await getDailyHistory(s);
      const b = h.bars;
      if (b.length >= 2) out[s] = quoteFromBars(s, b[b.length - 1], b[b.length - 2], { source: p.name, timeliness: p.caps.quotes, expected, retrievedAt: h.retrievedAt, stale: h.stale, error: h.error });
      else out[s] = unavailableQuote(s, 'Not enough price history', p.name);
    } catch (e) { out[s] = unavailableQuote(s, providerErrorInfo(e).message, p.name); }
  }
  for (const s of symbols) if (!out[s]) out[s] = unavailableQuote(s, 'Quote not available (request budget reached — try again shortly)', p.name);
  return out;
}

async function snapshotQuotes(symbols) {
  const p = getProvider();
  const out = {};
  const state = marketState(clock());
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50);
    let res;
    try {
      res = await cached(`snap:${p.name}:${batch.join(',')}`, 60_000, async () => [...(await p.snapshots(batch)).entries()]);
    } catch (e) { for (const s of batch) out[s] = unavailableQuote(s, providerErrorInfo(e).message, p.name); continue; }
    const map = new Map(res.value);
    for (const s of batch) {
      const q = map.get(s);
      if (!q) { out[s] = unavailableQuote(s, 'No snapshot returned', p.name); continue; }
      const mt = q.marketTime ? new Date(q.marketTime) : null;
      const session = mt ? marketState(mt).phase : 'closed';
      const ageMin = mt ? (clock().getTime() - mt.getTime()) / 60000 : Infinity;
      const freshLimit = p.caps.quotes === 'realtime' ? 2 : 20;
      const fresh = !res.stale && mt && (state.phase === 'closed' ? mt.getTime() >= sessionBounds(state.lastSessionDate).close.getTime() - 3600_000 * 4 : ageMin <= freshLimit);
      const change = q.price - q.prevClose;
      out[s] = {
        symbol: s, price: q.price, prevClose: q.prevClose, change, changePct: (change / q.prevClose) * 100,
        changeBasis: 'Last trade vs previous regular-session close',
        sessionDate: mt ? exchangeParts(mt).date : null,
        session: session === 'closed' ? 'regular-close' : session,
        marketTime: q.marketTime, retrievedAt: res.fetchedAt, source: p.name, timeliness: p.caps.quotes,
        dayOpen: q.dayOpen, dayHigh: q.dayHigh, dayLow: q.dayLow, dayVolume: q.dayVolume,
        status: fresh ? 'fresh' : 'stale',
        reason: fresh ? null : (res.error?.message || 'Quote is older than the freshness window'),
        quoteId: `${p.name}:${s}:${q.marketTime}:${q.price}`,
      };
    }
  }
  return out;
}

export async function getQuotes(symbols) {
  const uniq = [...new Set(symbols.map(normSymbol))].slice(0, 100);
  const p = getProvider();
  try {
    return p.caps.snapshot ? await snapshotQuotes(uniq) : await eodQuotes(uniq);
  } catch (e) {
    const info = providerErrorInfo(e);
    return Object.fromEntries(uniq.map((s) => [s, unavailableQuote(s, info.message, p.name)]));
  }
}

// ---------------- history & analysis ----------------

export async function getDailyHistory(symbol) {
  const sym = normSymbol(symbol);
  const p = getProvider();
  const cutoff = lastCompletedSession(clock());
  const years = Math.min(2, p.caps.historyYears || 2);
  const from = addDays(cutoff, -Math.floor(365.25 * years) + 2);
  const r = await cached(`bars:${p.name}:${sym}:${cutoff}`, 6 * 3600_000, async () => {
    const { bars, adjusted } = await p.dailyBars(sym, from, cutoff);
    return { bars: bars.filter((b) => b.date <= cutoff), adjusted };
  });
  return {
    symbol: sym, bars: r.value.bars, adjustment: r.value.adjusted ? 'split-adjusted (not dividend-adjusted)' : 'unadjusted',
    source: p.name, retrievedAt: r.fetchedAt, stale: r.stale, error: r.error || null, expectedCutoff: cutoff,
  };
}

export async function getIntraday(symbol, days = 1) {
  const sym = normSymbol(symbol);
  const p = getProvider();
  const state = marketState(clock());
  const end = p.caps.snapshot && state.isTradingDay && state.phase !== 'closed' ? state.exchangeDate : lastCompletedSession(clock());
  let start = end;
  for (let i = 1; i < days; i++) start = previousTradingDay(start);
  const minutes = days > 1 ? 30 : 5;
  const ttl = p.caps.snapshot ? 5 * 60_000 : 6 * 3600_000;
  const r = await cached(`intraday:${p.name}:${sym}:${start}:${end}:${minutes}`, ttl, () => p.intradayBars(sym, start, end, minutes));
  return { symbol: sym, bars: r.value.bars, minutes, from: start, to: end, source: p.name, retrievedAt: r.fetchedAt, stale: r.stale, error: r.error || null };
}

function analysisId(symbol, timeframe, bars) {
  const h = createHash('sha256');
  h.update(`${ANALYSIS_VERSION}|${symbol}|${timeframe}|${bars.length}|`);
  for (const b of bars.slice(-260)) h.update(`${b.date}:${b.o}:${b.h}:${b.l}:${b.c}:${b.v};`);
  return h.digest('hex').slice(0, 24);
}

const analysisMemo = new Map();
export async function getAnalysis(symbol) {
  const hist = await getDailyHistory(symbol);
  const id = analysisId(hist.symbol, '1D', hist.bars);
  if (analysisMemo.has(id)) return { ...analysisMemo.get(id), retrievedAt: hist.retrievedAt, stale: hist.stale, dataError: hist.error };
  const an = buildAnalysis({ symbol: hist.symbol, timeframe: '1D', bars: hist.bars, adjustment: hist.adjustment, source: hist.source });
  const out = { id, ...an, expectedCutoff: hist.expectedCutoff };
  analysisMemo.set(id, out);
  if (analysisMemo.size > 500) analysisMemo.delete(analysisMemo.keys().next().value);
  return { ...out, retrievedAt: hist.retrievedAt, stale: hist.stale, dataError: hist.error };
}

/** All splits executed on/after `since` (one provider call, cached). */
export async function getRecentSplits(since) {
  const p = getProvider();
  const r = await cached(`splits-since:${p.name}:${since}`, 12 * 3600_000, () => p.splits({ since }));
  return r.value;
}

export async function getNews(symbol) {
  const sym = normSymbol(symbol);
  const p = getProvider();
  const r = await cached(`news:${p.name}:${sym}`, 30 * 60_000, () => p.news(sym, { limit: 20 }));
  return { symbol: sym, articles: r.value, retrievedAt: r.fetchedAt, stale: r.stale, error: r.error || null, source: p.name };
}

/** Market-wide headlines (no ticker filter), cached. */
export async function getMarketNews() {
  const p = getProvider();
  const r = await cached(`news:${p.name}:__market__`, 30 * 60_000, () => p.news(null, { limit: 12 }));
  return { articles: r.value, retrievedAt: r.fetchedAt, stale: r.stale, error: r.error || null, source: p.name };
}

export async function getFundamentals(symbol) {
  const sym = normSymbol(symbol);
  const p = getProvider();
  const settle = async (key, ttl, fn) => {
    try { const r = await cached(key, ttl, fn); return { status: r.stale ? 'stale' : 'ok', data: r.value, retrievedAt: r.fetchedAt, error: r.error || null }; } catch (e) {
      const info = providerErrorInfo(e);
      return { status: info.kind === 'not_entitled' ? 'not_entitled' : 'unavailable', data: null, error: info };
    }
  };
  const [profile, dividends, splits, statements] = [
    await settle(`profile:${p.name}:${sym}`, 24 * 3600_000, () => p.instrument(sym)),
    await settle(`div:${p.name}:${sym}`, 24 * 3600_000, () => p.dividends(sym)),
    await settle(`splits:${p.name}:${sym}`, 24 * 3600_000, () => p.splits({ symbol: sym })),
    p.caps.statements ? await settle(`is:${p.name}:${sym}`, 24 * 3600_000, () => p.incomeStatements(sym))
      : { status: 'not_entitled', data: null, error: { kind: 'not_entitled', message: 'Financial statements are not included in the configured data plan.' } },
  ];
  if (profile.data && hasDatabase()) {
    query(`insert into instruments(symbol, instrument_id, name, exchange, type, currency, market_cap, payload, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict (symbol) do update set instrument_id=excluded.instrument_id, name=excluded.name,
      exchange=excluded.exchange, type=excluded.type, currency=excluded.currency, market_cap=excluded.market_cap, payload=excluded.payload, updated_at=now()`,
    [sym, profile.data.id, profile.data.name, profile.data.exchange, profile.data.type, profile.data.currency, profile.data.marketCap, JSON.stringify(profile.data)]).catch(() => {});
  }
  return {
    symbol: sym, source: p.name, profile, dividends, splits, statements,
    earnings: { status: 'not_entitled', data: null, error: { kind: 'not_entitled', message: 'Earnings calendar is not available from the configured provider plan.' } },
  };
}

export async function search(q) {
  const term = String(q || '').trim();
  if (term.length < 1 || term.length > 40) throw new AppError(400, 'invalid_query', 'Search term must be 1–40 characters');
  const p = getProvider();
  try {
    const r = await cached(`search:${p.name}:${term.toUpperCase()}`, 24 * 3600_000, () => p.search(term, { limit: 25 }));
    const up = term.toUpperCase();
    const rank = (i) => (i.symbol === up ? 0 : i.symbol.startsWith(up) ? 1 : i.name.toUpperCase().startsWith(up) ? 2 : 3)
      + (['Common Stock', 'ETF'].includes(i.type) ? 0 : 0.5);
    const results = [...r.value].sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
    return { results, partial: false, stale: r.stale, source: p.name };
  } catch (e) {
    if (hasDatabase()) {
      const rows = await query(`select symbol, instrument_id, name, exchange, type, currency from instruments
        where symbol ilike $1 or name ilike $2 order by (symbol = $3) desc, symbol limit 20`, [`${term}%`, `%${term}%`, term.toUpperCase()]);
      if (rows.rows.length) {
        return { results: rows.rows.map((r) => ({ id: r.instrument_id, symbol: r.symbol, name: r.name, exchange: r.exchange, type: r.type, currency: r.currency })), partial: true, reason: providerErrorInfo(e).message, source: 'cache' };
      }
    }
    throw toAppError(e);
  }
}
