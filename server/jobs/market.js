// Market data maintenance:
//  1. refresh provider holiday calendar
//  2. backfill grouped daily bars (newest first) up to TARGET_SESSIONS, within
//     the provider call budget
//  3. repair split-affected history (re-fetch adjusted bars per symbol)
//  4. refresh instrument metadata (name, type, market cap) for the universe

import { query, many } from '../db.js';
import { config } from '../config.js';
import {
  getProvider, loadCalendarOverrides, persistGrouped, getRecentSplits, now, providerErrorInfo,
} from '../market/service.js';
import { remainingBudget } from '../market/ratelimit.js';
import { lastCompletedSession, previousTradingDay, addDays } from '../../public/shared/calendar.js';
import { UNIVERSE, UNIVERSE_SYMBOLS } from '../market/universe.js';

export const TARGET_SESSIONS = 260;

function budgetFor(p) {
  return p.name === 'massive' ? remainingBudget('massive', config.market.massive.rateLimitPerMin) : Promise.resolve(Infinity);
}

export async function marketJob({ timeLeft }) {
  const p = getProvider();
  const stats = { fetchedDays: [], unpublished: null, splitsRepaired: [], metadataRefreshed: 0, errors: [] };
  await loadCalendarOverrides();

  // ---- backfill grouped days ----
  const end = lastCompletedSession(now());
  const wanted = [];
  for (let d = end, i = 0; i < TARGET_SESSIONS; i++, d = previousTradingDay(d)) wanted.push(d);
  const have = new Set((await many('select date from grouped_days where date >= $1', [wanted[wanted.length - 1]])).map((r) => r.date));
  for (const d of wanted) {
    if (have.has(d)) continue;
    if (timeLeft() < 8000 || (await budgetFor(p)) < 2) break;
    try {
      const map = await p.groupedDaily(d);
      if (map.size === 0) { if (d === end) { stats.unpublished = d; continue; } break; }
      await persistGrouped(d, map, p.name);
      stats.fetchedDays.push(d);
    } catch (e) { stats.errors.push({ step: 'grouped', date: d, ...providerErrorInfo(e) }); break; }
  }

  // ---- split repair ----
  try {
    if ((await budgetFor(p)) >= 2 && timeLeft() > 8000) {
      const splits = await getRecentSplits(addDays(end, -14));
      for (const sp of splits) {
        if (!UNIVERSE_SYMBOLS.includes(sp.symbol)) continue;
        const key = `split-repaired:${sp.symbol}:${sp.date}`;
        const done = (await query('select 1 from market_cache where key=$1', [key])).rowCount;
        if (done) continue;
        if (timeLeft() < 8000 || (await budgetFor(p)) < 1) break;
        const range = (await query('select min(date) a, max(date) b from daily_bars where symbol=$1', [sp.symbol])).rows[0];
        if (!range.a) continue;
        const { bars } = await p.dailyBars(sp.symbol, range.a, range.b);
        for (const b of bars) {
          await query(`insert into daily_bars(symbol,date,o,h,l,c,v,source) values ($1,$2,$3,$4,$5,$6,$7,$8)
            on conflict (symbol,date) do update set o=excluded.o,h=excluded.h,l=excluded.l,c=excluded.c,v=excluded.v,fetched_at=now()`, [sp.symbol, b.date, b.o, b.h, b.l, b.c, b.v, p.name]);
        }
        await query(`insert into market_cache(key, payload, expires_at) values ($1,'{}'::jsonb, now() + interval '400 days') on conflict do nothing`, [key]);
        stats.splitsRepaired.push(`${sp.symbol}@${sp.date}`);
      }
    }
  } catch (e) { stats.errors.push({ step: 'splits', ...providerErrorInfo(e) }); }

  // ---- instrument metadata ----
  const stale = await many(`select u.s as symbol from unnest($1::text[]) as u(s) left join instruments i on i.symbol = u.s
    where i.symbol is null or i.updated_at < now() - interval '7 days' limit 20`, [UNIVERSE_SYMBOLS]);
  for (const { symbol } of stale) {
    if (timeLeft() < 5000 || (await budgetFor(p)) < 1) break;
    try {
      const d = await p.instrument(symbol);
      const sector = UNIVERSE.find((u) => u.symbol === symbol)?.sector || null;
      await query(`insert into instruments(symbol, instrument_id, name, exchange, type, currency, market_cap, sector, payload, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict (symbol) do update set instrument_id=excluded.instrument_id, name=excluded.name, exchange=excluded.exchange,
        type=excluded.type, currency=excluded.currency, market_cap=excluded.market_cap, sector=excluded.sector, payload=excluded.payload, updated_at=now()`,
      [symbol, d.id, d.name, d.exchange, d.type, d.currency, d.marketCap, sector, JSON.stringify(d)]);
      stats.metadataRefreshed++;
    } catch (e) { stats.errors.push({ step: 'metadata', symbol, ...providerErrorInfo(e) }); if (e.kind === 'rate_limited') break; }
  }
  const coverage = (await query('select count(*)::int n from grouped_days')).rows[0].n;
  return { ...stats, storedSessions: coverage, targetSessions: TARGET_SESSIONS };
}
