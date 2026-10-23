// Scanner: computes one analysis row per universe symbol from stored daily
// bars (no provider calls), stores a timestamped snapshot with coverage.

import { query, many } from '../db.js';
import { buildAnalysis, ANALYSIS_VERSION, WARMUP } from '../../public/shared/analysis.js';
import { validateBars } from '../../public/shared/bars.js';
import { UNIVERSE, UNIVERSE_VERSION } from '../market/universe.js';
import { getQuotes } from '../market/service.js';

export async function scannerJob() {
  const latest = (await query('select max(date) d from grouped_days where result_count > 0')).rows[0].d;
  if (!latest) return { skipped: 'no market data stored yet' };
  const last = (await query('select as_of, computed_at, universe_version, analysis_version from scan_snapshots order by computed_at desc limit 1')).rows[0];
  const lastRun = (await query(`select max(finished_at) t from job_runs where job='market' and status='succeeded'`)).rows[0].t;
  if (last && last.as_of === latest && last.universe_version === UNIVERSE_VERSION && last.analysis_version === ANALYSIS_VERSION
    && (!lastRun || new Date(last.computed_at) > new Date(lastRun))) {
    return { skipped: 'snapshot already current', asOf: latest };
  }

  const symbols = UNIVERSE.map((u) => u.symbol);
  const bars = await many(`select symbol, date, o::float8 o, h::float8 h, l::float8 l, c::float8 c, v::float8 v from (
      select *, row_number() over (partition by symbol order by date desc) rn from daily_bars where symbol = any($1) and date <= $2) x
    where rn <= 300 order by symbol, date`, [symbols, latest]);
  const meta = new Map((await many('select symbol, name, type, exchange, market_cap from instruments where symbol = any($1)', [symbols])).map((m) => [m.symbol, m]));
  const bySym = new Map();
  for (const b of bars) { if (!bySym.has(b.symbol)) bySym.set(b.symbol, []); bySym.get(b.symbol).push(b); }

  // Quotes come from the same service the rest of the app uses.
  const quotes = await getQuotes(symbols);
  const rows = []; const missing = []; const partial = [];
  for (const u of UNIVERSE) {
    const b = bySym.get(u.symbol) || [];
    if (b.length < 2) { missing.push(u.symbol); continue; }
    let dq;
    try { dq = validateBars(b, { symbol: u.symbol }); } catch { missing.push(u.symbol); continue; }
    const an = buildAnalysis({ symbol: u.symbol, bars: b, dataQuality: dq, source: 'stored-daily-bars' });
    if (b.length < WARMUP.sma200) partial.push(u.symbol);
    const I = an.indicators;
    const q = quotes[u.symbol];
    const m = meta.get(u.symbol) || {};
    const res1 = an.levels.resistance?.[0]?.level ?? null;
    rows.push({
      symbol: u.symbol, name: m.name || null, sector: u.sector, type: m.type || (u.sector === 'ETF' ? 'ETF' : 'Common Stock'), exchange: m.exchange || null,
      price: q && q.status !== 'unavailable' ? q.price : an.close,
      changePct: q && q.status !== 'unavailable' ? q.changePct : null,
      quoteId: q?.quoteId ?? null, quoteSessionDate: q?.sessionDate ?? null,
      volume: I.volume.last, avgVolume20: I.volume.avg20, volumeRatio: I.volume.ratio,
      dollarVolume20: I.volume.avg20 !== null ? I.volume.avg20 * an.close : null,
      marketCap: m.market_cap ?? null,
      rsi14: I.rsi14.value, macdState: I.macd.state,
      trend: an.scores.trend.value, momentum: an.scores.momentum.value, risk: an.scores.risk.value,
      volatility20: I.volatility20 !== null ? I.volatility20 * 100 : null,
      return20: I.returns.d20,
      aboveSma50: I.sma[50] !== null ? an.close > I.sma[50] : null,
      aboveSma200: I.sma[200] !== null ? an.close > I.sma[200] : null,
      at52wHigh: I.range.high52w !== null ? an.close >= I.range.high52w * 0.995 : null,
      distToResistance: res1 !== null ? (res1 / an.close - 1) * 100 : null,
      cutoff: an.cutoff, barsUsed: an.barsUsed,
    });
  }
  const coverage = { universe: UNIVERSE.length, computed: rows.length, missing, partialHistory: partial };
  await query('insert into scan_snapshots(as_of, universe_version, analysis_version, coverage, rows) values ($1,$2,$3,$4,$5)',
    [latest, UNIVERSE_VERSION, ANALYSIS_VERSION, JSON.stringify(coverage), JSON.stringify(rows)]);
  await query(`delete from scan_snapshots where id not in (select id from scan_snapshots order by computed_at desc limit 10)`);
  return { asOf: latest, ...coverage, missing: missing.length, partialHistory: partial.length };
}
