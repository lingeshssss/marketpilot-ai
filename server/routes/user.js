// Private routes: preferences, watchlists, saved screens, account export.
// Every statement is scoped by the authenticated user id from the server-side
// session; ids in URLs/bodies are only ever used together with that user id.

import { sendJson, readBody } from '../http.js';
import { AppError, notFound, badRequest } from '../errors.js';
import { query, tx, many, one } from '../db.js';
import { config } from '../config.js';
import { normSymbol } from '../market/service.js';
import { getSession } from '../auth.js';
import { validateScreen } from '../../public/shared/screen.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuid = (v, what = 'id') => { if (!UUID.test(String(v))) throw notFound(what); return v; };
const name = (v) => { const s = String(v ?? '').trim(); if (s.length < 1 || s.length > 60) throw badRequest('Name must be 1–60 characters'); return s; };

async function ownedWatchlist(userId, id, client = { query }) {
  const r = await client.query('select id, name from watchlists where id=$1 and user_id=$2', [uuid(id, 'Watchlist'), userId]);
  if (!r.rows[0]) throw notFound('Watchlist');
  return r.rows[0];
}

async function watchlistsFor(userId) {
  const lists = await many('select id, name, position, created_at, updated_at from watchlists where user_id=$1 order by position, created_at', [userId]);
  const items = await many('select id, watchlist_id, symbol, note, position, added_at from watchlist_items where user_id=$1 order by position, added_at', [userId]);
  return lists.map((l) => ({ ...l, items: items.filter((i) => i.watchlist_id === l.id).map(({ watchlist_id, ...i }) => i) }));
}

export function registerUserRoutes(r) {
  // ---------- preferences ----------
  r.get('/api/me', async ({ res, req }) => {
    const sess = await getSession(req).catch(() => null);
    if (!sess) return sendJson(res, 200, { user: null, preferences: null });
    const user = sess.user;
    const prefs = await one('select theme, ticker_motion, default_chart, notify_inapp, notify_email, demo_opt_in from user_preferences where user_id=$1', [user.id]);
    sendJson(res, 200, { user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified }, preferencesStored: !!prefs, preferences: prefs || { theme: 'system', ticker_motion: true, default_chart: 'line', notify_inapp: true, notify_email: false, demo_opt_in: false } });
  }, { public: true });

  r.put('/api/me/preferences', async ({ req, res, user }) => {
    const b = await readBody(req);
    const p = {
      theme: ['system', 'light', 'dark'].includes(b.theme) ? b.theme : 'system',
      ticker_motion: b.ticker_motion !== false,
      default_chart: b.default_chart === 'candle' ? 'candle' : 'line',
      notify_inapp: b.notify_inapp !== false,
      notify_email: b.notify_email === true,
    };
    await query(`insert into user_preferences(user_id, theme, ticker_motion, default_chart, notify_inapp, notify_email, updated_at)
      values ($1,$2,$3,$4,$5,$6,now()) on conflict (user_id) do update set theme=excluded.theme, ticker_motion=excluded.ticker_motion,
      default_chart=excluded.default_chart, notify_inapp=excluded.notify_inapp, notify_email=excluded.notify_email, updated_at=now()`,
    [user.id, p.theme, p.ticker_motion, p.default_chart, p.notify_inapp, p.notify_email]);
    sendJson(res, 200, { preferences: p });
  });

  // ---------- watchlists ----------
  r.get('/api/watchlists', async ({ res, user }) => sendJson(res, 200, { watchlists: await watchlistsFor(user.id) }));

  r.post('/api/watchlists', async ({ req, res, user }) => {
    const b = await readBody(req);
    const n = name(b.name);
    const count = (await one('select count(*)::int c from watchlists where user_id=$1', [user.id])).c;
    if (count >= config.limits.watchlistsPerUser) throw new AppError(409, 'limit_reached', `You can have up to ${config.limits.watchlistsPerUser} watchlists`);
    try {
      const row = await one('insert into watchlists(user_id, name, position) values ($1,$2,$3) returning id, name, position, created_at, updated_at', [user.id, n, count]);
      sendJson(res, 201, { watchlist: { ...row, items: [] } });
    } catch (e) {
      if (e.code === '23505') throw new AppError(409, 'duplicate', 'A watchlist with that name already exists');
      throw e;
    }
  });

  r.patch('/api/watchlists/:id', async ({ req, res, user, params }) => {
    const b = await readBody(req);
    await ownedWatchlist(user.id, params.id);
    try {
      await query('update watchlists set name=$3, updated_at=now() where id=$1 and user_id=$2', [params.id, user.id, name(b.name)]);
    } catch (e) { if (e.code === '23505') throw new AppError(409, 'duplicate', 'A watchlist with that name already exists'); throw e; }
    sendJson(res, 200, { ok: true });
  });

  r.delete('/api/watchlists/:id', async ({ res, user, params }) => {
    const r1 = await query('delete from watchlists where id=$1 and user_id=$2', [uuid(params.id, 'Watchlist'), user.id]);
    if (!r1.rowCount) throw notFound('Watchlist');
    sendJson(res, 200, { ok: true });
  });

  r.post('/api/watchlists/:id/items', async ({ req, res, user, params }) => {
    const b = await readBody(req);
    const list = await ownedWatchlist(user.id, params.id);
    const symbols = (Array.isArray(b.symbols) ? b.symbols : [b.symbol]).filter(Boolean).slice(0, 200).map(normSymbol);
    if (!symbols.length) throw badRequest('symbol is required');
    const note = String(b.note ?? '').slice(0, 500);
    const added = []; const duplicates = [];
    await tx(async (c) => {
      const count = (await c.query('select count(*)::int c, coalesce(max(position),-1)::int m from watchlist_items where watchlist_id=$1', [list.id])).rows[0];
      if (count.c + symbols.length > config.limits.itemsPerWatchlist) throw new AppError(409, 'limit_reached', `A watchlist can hold up to ${config.limits.itemsPerWatchlist} symbols`);
      let pos = Number.isInteger(b.position) ? b.position : count.m + 1;
      if (Number.isInteger(b.position)) await c.query('update watchlist_items set position = position + 1 where watchlist_id=$1 and position >= $2', [list.id, b.position]);
      for (const s of symbols) {
        const ins = await c.query(`insert into watchlist_items(watchlist_id, user_id, symbol, note, position) values ($1,$2,$3,$4,$5)
          on conflict (watchlist_id, symbol) do nothing returning id, symbol, note, position, added_at`, [list.id, user.id, s, note, pos]);
        if (ins.rows[0]) { added.push(ins.rows[0]); pos++; } else duplicates.push(s);
      }
      await c.query('update watchlists set updated_at=now() where id=$1', [list.id]);
    });
    sendJson(res, 200, { added, duplicates });
  });

  r.patch('/api/watchlists/:id/items/:itemId', async ({ req, res, user, params }) => {
    const b = await readBody(req);
    await ownedWatchlist(user.id, params.id);
    const r1 = await query('update watchlist_items set note=$4 where id=$1 and watchlist_id=$2 and user_id=$3', [uuid(params.itemId, 'Item'), params.id, user.id, String(b.note ?? '').slice(0, 500)]);
    if (!r1.rowCount) throw notFound('Item');
    sendJson(res, 200, { ok: true });
  });

  r.delete('/api/watchlists/:id/items/:itemId', async ({ res, user, params }) => {
    await ownedWatchlist(user.id, params.id);
    const r1 = await query('delete from watchlist_items where id=$1 and watchlist_id=$2 and user_id=$3 returning symbol, note, position', [uuid(params.itemId, 'Item'), params.id, user.id]);
    if (!r1.rows[0]) throw notFound('Item');
    sendJson(res, 200, { removed: r1.rows[0] }); // client offers undo by re-adding with same note/position
  });

  r.put('/api/watchlists/:id/order', async ({ req, res, user, params }) => {
    const b = await readBody(req);
    await ownedWatchlist(user.id, params.id);
    const ids = Array.isArray(b.itemIds) ? b.itemIds.map((x) => uuid(x, 'Item')) : [];
    await tx(async (c) => {
      const existing = (await c.query('select id from watchlist_items where watchlist_id=$1 and user_id=$2', [params.id, user.id])).rows.map((x) => x.id);
      if (existing.length !== ids.length || !existing.every((id) => ids.includes(id))) throw badRequest('itemIds must list every item exactly once');
      for (let i = 0; i < ids.length; i++) await c.query('update watchlist_items set position=$1 where id=$2 and user_id=$3', [i, ids[i], user.id]);
    });
    sendJson(res, 200, { ok: true });
  });

  r.get('/api/watchlists/:id/export', async ({ res, user, params }) => {
    const list = await ownedWatchlist(user.id, params.id);
    const items = await many('select symbol, note, added_at from watchlist_items where watchlist_id=$1 and user_id=$2 order by position', [list.id, user.id]);
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = ['symbol,note,added_at', ...items.map((i) => [i.symbol, esc(i.note), i.added_at.toISOString()].join(','))].join('\n');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${list.name.replace(/[^\w-]+/g, '_')}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(csv);
  });

  // ---------- saved screens ----------
  r.get('/api/screens', async ({ res, user }) => sendJson(res, 200, { screens: await many('select id, name, definition, updated_at from saved_screens where user_id=$1 order by name', [user.id]) }));
  r.post('/api/screens', async ({ req, res, user }) => {
    const b = await readBody(req);
    const def = b.definition || {};
    const errs = validateScreen(def);
    if (errs.length) throw badRequest(errs.join('; '));
    const row = await one(`insert into saved_screens(user_id, name, definition) values ($1,$2,$3)
      on conflict (user_id, name) do update set definition=excluded.definition, updated_at=now() returning id, name, definition, updated_at`, [user.id, name(b.name), JSON.stringify({ ...def, page: 1 })]);
    sendJson(res, 200, { screen: row });
  });
  r.delete('/api/screens/:id', async ({ res, user, params }) => {
    const r1 = await query('delete from saved_screens where id=$1 and user_id=$2', [uuid(params.id, 'Screen'), user.id]);
    if (!r1.rowCount) throw notFound('Screen');
    sendJson(res, 200, { ok: true });
  });

  // ---------- account export ----------
  r.get('/api/account/export', async ({ res, user }) => {
    const data = {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      preferences: await one('select * from user_preferences where user_id=$1', [user.id]),
      watchlists: await watchlistsFor(user.id),
      portfolios: await many('select id, name, kind, base_currency, created_at from portfolios where user_id=$1', [user.id]),
      transactions: await many('select portfolio_id, type, symbol, trade_date, quantity, price, fees, amount, split_from, split_to, note, source, created_at from transactions where user_id=$1 order by trade_date, seq', [user.id]),
      alertRules: await many('select id, symbol, timeframe, kind, threshold, channels, enabled, cooldown_minutes, created_at from alert_rules where user_id=$1', [user.id]),
      alertEvents: await many('select rule_id, symbol, observed_value, threshold, kind, data_as_of, message, created_at from alert_events where user_id=$1 order by created_at', [user.id]),
      savedScreens: await many('select name, definition from saved_screens where user_id=$1', [user.id]),
      analysisHistory: await many('select symbol, timeframe, analysis_id, model, prompt_version, status, output, created_at from analysis_history where user_id=$1 order by created_at', [user.id]),
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="marketpilot-export.json"');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data, null, 2));
  });

  // Explicit demo opt-in: creates clearly labelled SIMULATED sample data.
  r.post('/api/account/sample-data', async ({ res, user }) => {
    await tx(async (c) => {
      await c.query(`insert into user_preferences(user_id, demo_opt_in) values ($1, true) on conflict (user_id) do update set demo_opt_in=true`, [user.id]);
      const wl = (await c.query(`insert into watchlists(user_id, name, position) values ($1, 'Sample: mega caps', 99) on conflict (user_id, name) do nothing returning id`, [user.id])).rows[0];
      if (wl) for (const [i, s] of ['AAPL', 'MSFT', 'NVDA', 'SPY'].entries()) await c.query('insert into watchlist_items(watchlist_id, user_id, symbol, position) values ($1,$2,$3,$4) on conflict do nothing', [wl.id, user.id, s, i]);
      const pf = (await c.query(`insert into portfolios(user_id, name, kind) values ($1, 'Sample (simulated)', 'simulated') on conflict (user_id, name) do nothing returning id`, [user.id])).rows[0];
      if (pf) {
        const t = [['buy', 'SPY', '2025-01-02', 10, 590], ['buy', 'AAPL', '2025-03-03', 15, 238], ['buy', 'MSFT', '2025-06-02', 5, 460]];
        for (const [type, sym, d, q, p] of t) {
          await c.query(`insert into transactions(portfolio_id, user_id, type, symbol, trade_date, quantity, price, fees, fingerprint, note)
            values ($1,$2,$3,$4,$5,$6,$7,0,$8,'Sample transaction (simulated)')`, [pf.id, user.id, type, sym, d, q, p, `sample|${sym}|${d}`]);
        }
      }
    });
    sendJson(res, 200, { ok: true });
  });
}
