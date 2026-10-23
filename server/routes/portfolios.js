import { sendJson, readBody } from '../http.js';
import { AppError, notFound, badRequest } from '../errors.js';
import { query, tx, many, one } from '../db.js';
import { config } from '../config.js';
import { getQuotes, getDailyHistory, toAppError } from '../market/service.js';
import {
  computePortfolio, performanceSeries, validateTransaction, txnFingerprint, mapCsv, parseCsv, replay,
} from '../../public/shared/portfolio.js';
import { uuid } from './user.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function rowToTxn(r) {
  return {
    id: r.id, seq: r.seq, type: r.type, symbol: r.symbol, date: r.trade_date,
    quantity: r.quantity, price: r.price, fees: r.fees, amount: r.amount, splitFrom: r.split_from, splitTo: r.split_to,
    note: r.note, source: r.source, portfolioId: r.portfolio_id,
  };
}

function cleanTxn(b) {
  const t = {
    type: String(b.type || '').toLowerCase(),
    symbol: b.symbol ? String(b.symbol).trim().toUpperCase() : null,
    date: String(b.date || ''),
    quantity: isNum(b.quantity) ? b.quantity : (b.quantity == null || b.quantity === '' ? null : Number(b.quantity)),
    price: isNum(b.price) ? b.price : (b.price == null || b.price === '' ? null : Number(b.price)),
    fees: b.fees == null || b.fees === '' ? 0 : Number(b.fees),
    amount: b.amount == null || b.amount === '' ? null : Number(b.amount),
    splitFrom: b.splitFrom == null || b.splitFrom === '' ? null : Number(b.splitFrom),
    splitTo: b.splitTo == null || b.splitTo === '' ? null : Number(b.splitTo),
    note: String(b.note ?? '').slice(0, 500),
  };
  if (!['buy', 'sell', 'dividend', 'split'].includes(t.type)) t.symbol = null;
  const errs = validateTransaction({ ...t, quantity: t.quantity ?? undefined, price: t.price ?? undefined, amount: t.amount ?? undefined, splitFrom: t.splitFrom ?? undefined, splitTo: t.splitTo ?? undefined });
  if (t.date > new Date().toISOString().slice(0, 10)) errs.push('Date cannot be in the future');
  if (errs.length) throw badRequest(errs.join('; '), { fields: errs });
  return t;
}

async function ownedPortfolio(userId, id, c = { query }) {
  const r = await c.query('select id, name, kind, base_currency, created_at from portfolios where id=$1 and user_id=$2', [uuid(id, 'Portfolio'), userId]);
  if (!r.rows[0]) throw notFound('Portfolio');
  return r.rows[0];
}

async function txnsFor(userId, portfolioIds) {
  if (!portfolioIds.length) return [];
  const rows = await many('select * from transactions where user_id=$1 and portfolio_id = any($2::uuid[]) order by trade_date, seq', [userId, portfolioIds]);
  return rows.map(rowToTxn);
}

/**
 * THE portfolio valuation used by every screen (dashboard card, portfolio page,
 * per-portfolio view). Same transactions + same quote snapshot => same totals.
 */
export async function valuePortfolios(userId, { portfolioId = null, kind = 'actual' } = {}) {
  const pfs = portfolioId
    ? [await ownedPortfolio(userId, portfolioId)]
    : await many('select id, name, kind from portfolios where user_id=$1 and kind=$2 order by created_at', [userId, kind]);
  const txns = await txnsFor(userId, pfs.map((p) => p.id));
  const led = replay(txns);
  const symbols = [...led.positions.values()].filter((p) => p.quantity > 1e-9).map((p) => p.symbol);
  let quotes = {};
  let quoteError = null;
  if (symbols.length) {
    try { quotes = await getQuotes(symbols); } catch (e) { quoteError = toAppError(e).message; }
  }
  const usable = Object.fromEntries(Object.entries(quotes).filter(([, q]) => q && q.status !== 'unavailable'));
  const summary = computePortfolio(txns, usable);
  return {
    scope: portfolioId ? { portfolioId, name: pfs[0].name, kind: pfs[0].kind } : { all: true, kind, portfolios: pfs.length },
    ...summary,
    quotes,
    quoteError,
    transactionCount: txns.length,
    valuedAt: new Date().toISOString(),
    method: 'Average cost; see docs/ACCOUNTING.md',
  };
}

export function registerPortfolioRoutes(r) {
  r.get('/api/portfolios', async ({ res, user }) => {
    const pfs = await many(`select p.id, p.name, p.kind, p.base_currency, p.created_at, count(t.id)::int as transactions
      from portfolios p left join transactions t on t.portfolio_id = p.id where p.user_id=$1 group by p.id order by p.kind, p.created_at`, [user.id]);
    sendJson(res, 200, { portfolios: pfs });
  });

  r.get('/api/portfolios/summary', async ({ res, user, url }) => {
    const kind = url.searchParams.get('kind') === 'simulated' ? 'simulated' : 'actual';
    sendJson(res, 200, await valuePortfolios(user.id, { kind }));
  });

  r.post('/api/portfolios', async ({ req, res, user }) => {
    const b = await readBody(req);
    const nm = String(b.name ?? '').trim();
    if (nm.length < 1 || nm.length > 60) throw badRequest('Name must be 1–60 characters');
    const kind = b.kind === 'simulated' ? 'simulated' : 'actual';
    const c = (await one('select count(*)::int c from portfolios where user_id=$1', [user.id])).c;
    if (c >= config.limits.portfoliosPerUser) throw new AppError(409, 'limit_reached', 'Portfolio limit reached');
    try {
      sendJson(res, 201, { portfolio: await one('insert into portfolios(user_id, name, kind) values ($1,$2,$3) returning id, name, kind, base_currency, created_at', [user.id, nm, kind]) });
    } catch (e) { if (e.code === '23505') throw new AppError(409, 'duplicate', 'A portfolio with that name already exists'); throw e; }
  });

  r.patch('/api/portfolios/:id', async ({ req, res, user, params }) => {
    const b = await readBody(req);
    await ownedPortfolio(user.id, params.id);
    const nm = String(b.name ?? '').trim();
    if (nm.length < 1 || nm.length > 60) throw badRequest('Name must be 1–60 characters');
    try { await query('update portfolios set name=$3, updated_at=now() where id=$1 and user_id=$2', [params.id, user.id, nm]); } catch (e) {
      if (e.code === '23505') throw new AppError(409, 'duplicate', 'A portfolio with that name already exists'); throw e;
    }
    sendJson(res, 200, { ok: true });
  });

  r.delete('/api/portfolios/:id', async ({ res, user, params }) => {
    const r1 = await query('delete from portfolios where id=$1 and user_id=$2', [uuid(params.id, 'Portfolio'), user.id]);
    if (!r1.rowCount) throw notFound('Portfolio');
    sendJson(res, 200, { ok: true });
  });

  r.get('/api/portfolios/:id', async ({ res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const txns = await txnsFor(user.id, [pf.id]);
    const valuation = await valuePortfolios(user.id, { portfolioId: pf.id });
    sendJson(res, 200, { portfolio: pf, transactions: txns, valuation });
  });

  r.post('/api/portfolios/:id/transactions', async ({ req, res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const t = cleanTxn(await readBody(req));
    const existing = await txnsFor(user.id, [pf.id]);
    if (existing.length >= config.limits.transactionsPerPortfolio) throw new AppError(409, 'limit_reached', 'Transaction limit reached');
    const check = replay([...existing, { ...t, seq: Number.MAX_SAFE_INTEGER }]);
    if (check.problems.length) throw badRequest(check.problems.map((p) => `${p.date} ${p.symbol}: ${p.message}`).join('; '));
    const row = await one(`insert into transactions(portfolio_id, user_id, type, symbol, trade_date, quantity, price, fees, amount, split_from, split_to, note, fingerprint, source)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual') returning *`,
    [pf.id, user.id, t.type, t.symbol, t.date, t.quantity, t.price, t.fees, t.amount, t.splitFrom, t.splitTo, t.note, txnFingerprint(t)]);
    sendJson(res, 201, { transaction: rowToTxn(row) });
  });

  r.patch('/api/portfolios/:id/transactions/:tid', async ({ req, res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const t = cleanTxn(await readBody(req));
    const existing = (await txnsFor(user.id, [pf.id]));
    const target = existing.find((x) => x.id === params.tid);
    if (!target) throw notFound('Transaction');
    const check = replay(existing.map((x) => (x.id === params.tid ? { ...t, id: x.id, seq: x.seq } : x)));
    if (check.problems.length) throw badRequest(check.problems.map((p) => `${p.date} ${p.symbol}: ${p.message}`).join('; '));
    await query(`update transactions set type=$4, symbol=$5, trade_date=$6, quantity=$7, price=$8, fees=$9, amount=$10, split_from=$11, split_to=$12, note=$13, fingerprint=$14
      where id=$1 and portfolio_id=$2 and user_id=$3`, [params.tid, pf.id, user.id, t.type, t.symbol, t.date, t.quantity, t.price, t.fees, t.amount, t.splitFrom, t.splitTo, t.note, txnFingerprint(t)]);
    sendJson(res, 200, { ok: true });
  });

  r.delete('/api/portfolios/:id/transactions/:tid', async ({ res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const existing = await txnsFor(user.id, [pf.id]);
    if (!existing.some((x) => x.id === params.tid)) throw notFound('Transaction');
    const check = replay(existing.filter((x) => x.id !== params.tid));
    if (check.problems.length) throw badRequest(`Deleting this would leave an invalid history: ${check.problems[0].message} on ${check.problems[0].date}`);
    await query('delete from transactions where id=$1 and portfolio_id=$2 and user_id=$3', [params.tid, pf.id, user.id]);
    sendJson(res, 200, { ok: true });
  });

  r.post('/api/portfolios/:id/import/preview', async ({ req, res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const b = await readBody(req, 2_000_000);
    const rows = parseCsv(String(b.csv || ''));
    if (rows.length > 5001) throw badRequest('CSV is limited to 5,000 rows');
    if (!b.mapping) return sendJson(res, 200, { header: rows[0] || [], sample: rows.slice(1, 6) });
    const existing = await txnsFor(user.id, [pf.id]);
    const preview = mapCsv(rows, b.mapping, existing);
    const valid = preview.items.filter((i) => !i.errors.length && !i.duplicate).map((i) => ({ ...i.txn, seq: Number.MAX_SAFE_INTEGER - 10000 + i.line }));
    const check = replay([...existing, ...valid]);
    sendJson(res, 200, { ...preview, ledgerProblems: check.problems });
  });

  r.post('/api/portfolios/:id/import/commit', async ({ req, res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const b = await readBody(req, 2_000_000);
    const items = Array.isArray(b.transactions) ? b.transactions.slice(0, 5000) : [];
    const clean = items.map(cleanTxn);
    const result = await tx(async (c) => {
      const existing = (await c.query('select * from transactions where portfolio_id=$1 and user_id=$2 order by trade_date, seq', [pf.id, user.id])).rows.map(rowToTxn);
      const fps = new Set(existing.map(txnFingerprint));
      const toInsert = []; let skipped = 0;
      for (const t of clean) { const fp = txnFingerprint(t); if (fps.has(fp)) { skipped++; continue; } fps.add(fp); toInsert.push(t); }
      const check = replay([...existing, ...toInsert.map((t, i) => ({ ...t, seq: Number.MAX_SAFE_INTEGER - 10000 + i }))]);
      if (check.problems.length) throw badRequest(`Import rejected: ${check.problems[0].message} on ${check.problems[0].date}`);
      for (const t of toInsert) {
        await c.query(`insert into transactions(portfolio_id, user_id, type, symbol, trade_date, quantity, price, fees, amount, split_from, split_to, note, fingerprint, source)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'csv')`, [pf.id, user.id, t.type, t.symbol, t.date, t.quantity, t.price, t.fees, t.amount, t.splitFrom, t.splitTo, t.note, txnFingerprint(t)]);
      }
      return { inserted: toInsert.length, skippedDuplicates: skipped };
    });
    sendJson(res, 200, result);
  });

  r.get('/api/portfolios/:id/performance', async ({ res, user, params }) => {
    const pf = await ownedPortfolio(user.id, params.id);
    const txns = await txnsFor(user.id, [pf.id]);
    const symbols = [...new Set(txns.filter((t) => t.symbol).map((t) => t.symbol))];
    if (symbols.length > 25) throw new AppError(422, 'too_many_symbols', 'Performance history is limited to portfolios with up to 25 symbols in this release.');
    const closes = {}; const missing = []; const dateSet = new Set(); let stale = false;
    for (const s of symbols) {
      try {
        const h = await getDailyHistory(s);
        stale = stale || h.stale;
        closes[s] = new Map(h.bars.map((b) => [b.date, b.c]));
        for (const b of h.bars) dateSet.add(b.date);
      } catch (e) { missing.push({ symbol: s, reason: toAppError(e).message }); }
    }
    const dates = [...dateSet].sort();
    const first = txns[0]?.date;
    const perf = performanceSeries(txns, closes, dates.filter((d) => !first || d >= first));
    sendJson(res, 200, {
      ...perf, missing, stale,
      historyStart: dates[0] || null,
      note: 'Valued at daily split-adjusted closes; dividends count when recorded as cash. Time-weighted return chains daily sub-periods and removes the effect of deposits/withdrawals.',
      truncated: first && dates[0] && first < dates[0] ? `Price history before ${dates[0]} is not available from the provider plan; earlier days are excluded.` : null,
    });
  });
}
