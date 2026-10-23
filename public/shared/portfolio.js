// ============================================================
// Portfolio accounting — derived entirely from recorded transactions.
//
// METHOD (documented in docs/ACCOUNTING.md)
//  * Cost basis: average cost. Buy fees are added to basis; sell fees reduce
//    proceeds. Realised P&L = proceeds − fees − avgCost × quantity sold.
//  * Splits: quantity × (to / from); total basis unchanged.
//  * Dividends: cash income, reported separately; do not change basis.
//  * Cash: deposits/withdrawals are external flows. A buy that exceeds the
//    available cash is treated as an implicit contribution of the shortfall
//    (so portfolios that never record deposits still reconcile).
//  * Daily P&L (per position, versus previous close):
//        held-at-prev-close qty × (price − prevClose)
//      + Σ buys today  qty × (price − buy price)
//      + Σ sells today qty × (sell price − prevClose)
//    Fees are excluded from daily P&L.
//  * Performance: time-weighted return chaining daily sub-periods,
//    r_d = (V_d − F_d) / V_{d−1} − 1, valued at daily closes; transactions are
//    assumed to settle at that day's close.
//  * Ordering: by trade date, then by `seq` (entry order).
// ============================================================

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const TXN_TYPES = ['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'split', 'fee'];

export function sortTransactions(txns) {
  return [...txns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq ?? 0) - (b.seq ?? 0)));
}

/** Validates a single transaction's shape. Returns an array of error strings. */
export function validateTransaction(t) {
  const errs = [];
  if (!TXN_TYPES.includes(t.type)) errs.push(`Unknown type "${t.type}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) errs.push('Date must be YYYY-MM-DD');
  const needsSymbol = ['buy', 'sell', 'dividend', 'split'].includes(t.type);
  if (needsSymbol && !/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t.symbol || '')) errs.push('Symbol is required');
  if (t.type === 'buy' || t.type === 'sell') {
    if (!isNum(t.quantity) || t.quantity <= 0) errs.push('Quantity must be greater than 0');
    if (!isNum(t.price) || t.price < 0) errs.push('Price must be 0 or greater');
  }
  if (t.fees !== undefined && t.fees !== null && (!isNum(t.fees) || t.fees < 0)) errs.push('Fees must be 0 or greater');
  if (['dividend', 'deposit', 'withdrawal', 'fee'].includes(t.type) && (!isNum(t.amount) || t.amount <= 0)) errs.push('Amount must be greater than 0');
  if (t.type === 'split' && (!isNum(t.splitFrom) || !isNum(t.splitTo) || t.splitFrom <= 0 || t.splitTo <= 0)) errs.push('Split ratio must be positive (e.g. 1 → 4)');
  return errs;
}

function emptyPos(symbol) {
  return { symbol, quantity: 0, costBasis: 0, realized: 0, dividends: 0, fees: 0 };
}

const EPS = 1e-9;

/** Replays transactions; returns raw ledger state. Throws on overselling. */
export function replay(txns, { untilDate = null } = {}) {
  const positions = new Map();
  let cash = 0, contributions = 0, withdrawals = 0, implicit = 0, fees = 0, dividends = 0;
  const pos = (s) => { if (!positions.has(s)) positions.set(s, emptyPos(s)); return positions.get(s); };
  const problems = [];

  for (const t of sortTransactions(txns)) {
    if (untilDate && t.date > untilDate) break;
    const f = isNum(t.fees) ? t.fees : 0;
    switch (t.type) {
      case 'deposit': cash += t.amount; contributions += t.amount; break;
      case 'withdrawal': cash -= t.amount; withdrawals += t.amount; break;
      case 'fee': cash -= t.amount; fees += t.amount; break;
      case 'dividend': { const p = pos(t.symbol); p.dividends += t.amount; dividends += t.amount; cash += t.amount; break; }
      case 'buy': {
        const p = pos(t.symbol);
        const cost = t.quantity * t.price + f;
        p.quantity += t.quantity; p.costBasis += cost; p.fees += f; fees += f;
        if (cash < cost) { const short = cost - Math.max(cash, 0); implicit += short; cash += short; }
        cash -= cost;
        break;
      }
      case 'sell': {
        const p = pos(t.symbol);
        if (t.quantity > p.quantity + EPS) {
          problems.push({ id: t.id, date: t.date, symbol: t.symbol, message: `Sell of ${t.quantity} exceeds ${p.quantity} held` });
          break;
        }
        const avg = p.quantity > 0 ? p.costBasis / p.quantity : 0;
        const basisOut = avg * t.quantity;
        const proceeds = t.quantity * t.price - f;
        p.realized += proceeds - basisOut;
        p.costBasis -= basisOut; p.quantity -= t.quantity; p.fees += f; fees += f;
        if (Math.abs(p.quantity) < EPS) { p.quantity = 0; p.costBasis = 0; }
        cash += proceeds;
        break;
      }
      case 'split': {
        const p = pos(t.symbol);
        p.quantity *= t.splitTo / t.splitFrom;
        break;
      }
      default: break;
    }
  }
  return { positions, cash, contributions, withdrawals, implicit, fees, dividends, problems };
}

/**
 * Holdings & totals valued with normalized quotes.
 * quotes: { [symbol]: { price, prevClose, sessionDate, status } }
 */
export function computePortfolio(txns, quotes = {}) {
  const led = replay(txns);
  const sorted = sortTransactions(txns);
  const rows = [];
  let mv = 0, basis = 0, unreal = 0, realized = 0, daily = 0, prevValue = 0, missingQuotes = [];

  for (const p of led.positions.values()) {
    realized += p.realized;
    if (p.quantity <= EPS) { rows.push({ ...p, closed: true }); continue; }
    const q = quotes[p.symbol];
    const price = q && isNum(q.price) ? q.price : null;
    const row = {
      ...p, closed: false,
      avgCost: p.costBasis / p.quantity,
      price, prevClose: q?.prevClose ?? null, quoteStatus: q?.status ?? 'unavailable', sessionDate: q?.sessionDate ?? null,
      marketValue: null, unrealized: null, unrealizedPct: null, dailyPnl: null,
    };
    basis += p.costBasis;
    if (price === null) { missingQuotes.push(p.symbol); rows.push(row); continue; }
    row.marketValue = p.quantity * price;
    row.unrealized = row.marketValue - p.costBasis;
    row.unrealizedPct = p.costBasis > 0 ? (row.unrealized / p.costBasis) * 100 : null;
    mv += row.marketValue; unreal += row.unrealized;

    if (isNum(q.prevClose) && q.sessionDate) {
      // Quantity held at the previous close (splits effective today included).
      let qtyPrev = 0; let dp = 0;
      for (const t of sorted) {
        if (t.symbol !== p.symbol) continue;
        if (t.date < q.sessionDate) {
          if (t.type === 'buy') qtyPrev += t.quantity;
          else if (t.type === 'sell') qtyPrev -= t.quantity;
          else if (t.type === 'split') qtyPrev *= t.splitTo / t.splitFrom;
        } else if (t.date === q.sessionDate) {
          if (t.type === 'split') qtyPrev *= t.splitTo / t.splitFrom;
          else if (t.type === 'buy') dp += t.quantity * (price - t.price);
          else if (t.type === 'sell') { dp += t.quantity * (t.price - q.prevClose); qtyPrev -= t.quantity; }
        }
      }
      qtyPrev = Math.max(0, qtyPrev);
      dp += qtyPrev * (price - q.prevClose);
      row.dailyPnl = dp;
      daily += dp;
      prevValue += qtyPrev * q.prevClose;
    }
    rows.push(row);
  }

  const open = rows.filter((r) => !r.closed);
  for (const r of open) r.weight = mv > 0 && isNum(r.marketValue) ? (r.marketValue / mv) * 100 : null;
  const complete = missingQuotes.length === 0;
  const totalValue = complete ? mv + led.cash : null;
  const netContributions = led.contributions + led.implicit - led.withdrawals;

  return {
    positions: open.sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1)),
    closedPositions: rows.filter((r) => r.closed),
    totals: {
      marketValue: complete ? mv : null,
      cash: led.cash,
      totalValue,
      costBasis: basis,
      unrealized: complete ? unreal : null,
      realized,
      dividends: led.dividends,
      fees: led.fees,
      dailyPnl: complete ? daily : null,
      dailyPnlPct: complete && prevValue > 0 ? (daily / prevValue) * 100 : null,
      netContributions,
      totalGain: totalValue !== null ? totalValue - netContributions : null,
    },
    missingQuotes,
    problems: led.problems,
  };
}

/**
 * Daily valuation & time-weighted return.
 * closes: { [symbol]: Map<date, adjustedClose> } (split-adjusted closes)
 * dates: ascending trading dates to evaluate.
 */
export function performanceSeries(txns, closes, dates) {
  const sorted = sortTransactions(txns);
  if (!sorted.length || !dates.length) return { series: [], twr: null, carriedForward: [] };
  const splits = sorted.filter((t) => t.type === 'split');
  const futureRatio = (symbol, date) => splits
    .filter((s) => s.symbol === symbol && s.date > date)
    .reduce((acc, s) => acc * (s.splitTo / s.splitFrom), 1);

  const series = [];
  const lastPx = {};
  const carried = new Set();
  let idx = 0, twrIndex = 1, prevV = null;
  let holdings = new Map(), cash = 0, net = 0;

  for (const d of dates) {
    if (d < sorted[0].date) continue;
    let flow = 0;
    while (idx < sorted.length && sorted[idx].date <= d) {
      const t = sorted[idx++];
      const f = isNum(t.fees) ? t.fees : 0;
      if (t.type === 'deposit') { cash += t.amount; flow += t.amount; }
      else if (t.type === 'withdrawal') { cash -= t.amount; flow -= t.amount; }
      else if (t.type === 'fee') cash -= t.amount;
      else if (t.type === 'dividend') cash += t.amount;
      else if (t.type === 'buy') {
        const cost = t.quantity * t.price + f;
        if (cash < cost) { const s = cost - Math.max(cash, 0); cash += s; flow += s; }
        cash -= cost; holdings.set(t.symbol, (holdings.get(t.symbol) || 0) + t.quantity);
      } else if (t.type === 'sell') {
        cash += t.quantity * t.price - f; holdings.set(t.symbol, (holdings.get(t.symbol) || 0) - t.quantity);
      } else if (t.type === 'split') {
        holdings.set(t.symbol, (holdings.get(t.symbol) || 0) * t.splitTo / t.splitFrom);
      }
    }
    net += flow;
    let mv = 0;
    for (const [sym, qty] of holdings) {
      if (Math.abs(qty) < EPS) continue;
      const px = closes[sym]?.get(d);
      if (isNum(px)) lastPx[sym] = px; else if (isNum(lastPx[sym])) carried.add(`${sym}@${d}`);
      const p = lastPx[sym];
      if (!isNum(p)) continue;
      // Adjusted close × future split ratio = price in as-of-date shares.
      mv += qty * p * futureRatio(sym, d);
    }
    const v = mv + cash;
    if (prevV !== null && prevV > 0) twrIndex *= (v - flow) / prevV;
    series.push({ date: d, value: v, netContributions: net, twrIndex });
    prevV = v;
  }
  return { series, twr: series.length ? (twrIndex - 1) * 100 : null, carriedForward: [...carried] };
}

// ---------------- CSV import ----------------

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const num = (s) => {
  if (s === undefined || s === null) return undefined;
  const t = String(s).replace(/[$,\s]/g, '');
  if (t === '') return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

function normDate(s) {
  const t = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // US M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

/** Fingerprint used for duplicate detection on import. */
export function txnFingerprint(t) {
  const n = (v) => (isNum(v) ? Number(v).toFixed(8) : '');
  return [t.type, t.date, t.symbol || '', n(t.quantity), n(t.price), n(t.fees || 0), n(t.amount), n(t.splitFrom), n(t.splitTo)].join('|');
}

/**
 * Maps CSV rows to transactions using a column mapping
 * { type, date, symbol, quantity, price, fees, amount } (header names).
 * Returns preview rows with per-row errors and duplicate flags.
 */
export function mapCsv(rows, mapping, existing = []) {
  if (!rows.length) return { header: [], items: [] };
  const header = rows[0].map((h) => h.trim());
  const col = (name) => (mapping[name] ? header.indexOf(mapping[name]) : -1);
  const seen = new Set(existing.map(txnFingerprint));
  const inFile = new Set();
  const items = rows.slice(1).map((r, i) => {
    const get = (k) => { const c = col(k); return c >= 0 ? r[c] : undefined; };
    const type = String(get('type') || '').trim().toLowerCase();
    const t = {
      type: ({ bought: 'buy', purchase: 'buy', sold: 'sell', div: 'dividend' })[type] || type,
      date: normDate(get('date')),
      symbol: get('symbol') ? String(get('symbol')).trim().toUpperCase() : undefined,
      quantity: num(get('quantity')), price: num(get('price')), fees: num(get('fees')) ?? 0, amount: num(get('amount')),
    };
    if (t.type === 'dividend' && t.amount === undefined && isNum(t.quantity) && isNum(t.price)) t.amount = t.quantity * t.price;
    const errors = validateTransaction(t);
    const fp = txnFingerprint(t);
    const duplicate = seen.has(fp) ? 'existing' : inFile.has(fp) ? 'in-file' : null;
    inFile.add(fp);
    return { line: i + 2, txn: t, errors, duplicate };
  });
  return { header, items };
}
