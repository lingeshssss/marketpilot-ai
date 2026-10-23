import { sendJson } from '../http.js';
import { AppError } from '../errors.js';
import { hasDatabase, query } from '../db.js';
import {
  getQuotes, getMarketNews, getDailyHistory, getIntraday, getAnalysis, getNews, getFundamentals, search,
  normSymbol, toAppError, providerInfo, loadCalendarOverrides, now,
} from '../market/service.js';
import { marketState } from '../../public/shared/calendar.js';
import { explainAnalysis, exitScenarios } from '../../public/shared/analysis.js';
import { sentimentScore } from '../../public/shared/analysis.js';
import { applyScreen, validateScreen } from '../../public/shared/screen.js';
import { MARKET_PROXIES, UNIVERSE, UNIVERSE_VERSION } from '../market/universe.js';
import { TARGET_SESSIONS } from '../jobs/market.js';

const wrap = (fn) => async (ctx) => { try { return await fn(ctx); } catch (e) { throw toAppError(e); } };

export function registerMarketRoutes(r) {
  r.get('/api/market/status', wrap(async ({ res }) => {
    await loadCalendarOverrides();
    let provider = null;
    try { provider = providerInfo(); } catch { /* unavailable */ }
    sendJson(res, 200, { state: marketState(now()), provider });
  }), { public: true });

  r.get('/api/search', wrap(async ({ res, url }) => {
    sendJson(res, 200, await search(url.searchParams.get('q')));
  }), { public: true });

  r.get('/api/quotes', wrap(async ({ res, url }) => {
    const symbols = String(url.searchParams.get('symbols') || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!symbols.length) throw new AppError(400, 'invalid_request', 'symbols is required');
    if (symbols.length > 100) throw new AppError(400, 'invalid_request', 'At most 100 symbols per request');
    sendJson(res, 200, { quotes: await getQuotes(symbols), provider: providerInfo(), generatedAt: new Date().toISOString() });
  }), { public: true });

  r.get('/api/instruments/:symbol/history', wrap(async ({ res, params, url }) => {
    const days = Number(url.searchParams.get('intradayDays') || 0);
    if (days === 1 || days === 5) return sendJson(res, 200, await getIntraday(params.symbol, days));
    const h = await getDailyHistory(params.symbol);
    sendJson(res, 200, h);
  }), { public: true });

  r.get('/api/instruments/:symbol/analysis', wrap(async ({ res, params }) => {
    const an = await getAnalysis(params.symbol);
    sendJson(res, 200, { analysis: an, explanations: explainAnalysis(an), scenarios: exitScenarios(an) });
  }), { public: true });

  r.get('/api/instruments/:symbol/news', wrap(async ({ res, params }) => {
    const n = await getNews(params.symbol);
    sendJson(res, 200, { ...n, sentiment: sentimentScore(n.articles, n.symbol) });
  }), { public: true });

  r.get('/api/market/news', wrap(async ({ res }) => {
    sendJson(res, 200, await getMarketNews());
  }), { public: true });

  r.get('/api/instruments/:symbol/fundamentals', wrap(async ({ res, params }) => {
    sendJson(res, 200, await getFundamentals(params.symbol));
  }), { public: true });

  r.get('/api/market/overview', wrap(async ({ res }) => {
    const quotes = await getQuotes(MARKET_PROXIES.map((p) => p.symbol));
    let movers = null;
    if (hasDatabase()) {
      const snap = (await query('select as_of, computed_at, rows from scan_snapshots order by computed_at desc limit 1')).rows[0];
      if (snap) {
        // Movers come from the same snapshot quotes so values match the ticker & watchlist.
        const syms = snap.rows.map((x) => x.symbol);
        const q = await getQuotes(syms);
        const withQ = syms.map((s) => q[s]).filter((x) => x && x.status !== 'unavailable');
        const sorted = [...withQ].sort((a, b) => b.changePct - a.changePct);
        movers = { asOf: snap.as_of, gainers: sorted.filter((x) => x.changePct > 0).slice(0, 5), losers: sorted.filter((x) => x.changePct < 0).reverse().slice(0, 5), universe: UNIVERSE_VERSION, universeSize: UNIVERSE.length };
      }
    }
    sendJson(res, 200, { proxies: MARKET_PROXIES.map((p) => ({ ...p, quote: quotes[p.symbol] })), movers, state: marketState(now()), provider: providerInfo() });
  }), { public: true });

  r.get('/api/scanner', wrap(async ({ res, url }) => {
    if (!hasDatabase()) throw new AppError(503, 'scanner_unavailable', 'The scanner needs the database to store precomputed scans.');
    const snap = (await query('select id, as_of, computed_at, universe_version, analysis_version, coverage, rows from scan_snapshots order by computed_at desc limit 1')).rows[0];
    if (!snap) return sendJson(res, 200, { snapshot: null, result: { total: 0, rows: [], page: 1, pages: 1 }, message: 'No scan has completed yet. Scans run in the background after market data is backfilled.' });
    let def = {};
    const raw = url.searchParams.get('screen');
    if (raw) {
      try { def = JSON.parse(raw); } catch { throw new AppError(400, 'invalid_screen', 'screen must be JSON'); }
      const errs = validateScreen(def);
      if (errs.length) throw new AppError(400, 'invalid_screen', errs.join('; '));
    }
    const sectors = [...new Set(snap.rows.map((x) => x.sector))].sort();
    const stored = (await query('select count(*)::int n from grouped_days where result_count > 0')).rows[0].n;
    sendJson(res, 200, {
      snapshot: { id: snap.id, asOf: snap.as_of, computedAt: snap.computed_at, universeVersion: snap.universe_version, analysisVersion: snap.analysis_version, coverage: snap.coverage, sectors,
        backfill: { storedSessions: stored, targetSessions: TARGET_SESSIONS, complete: stored >= TARGET_SESSIONS } },
      result: applyScreen(snap.rows, def),
    });
  }), { public: true });
}
