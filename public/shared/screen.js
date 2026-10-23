// ============================================================
// Scanner screen definitions & evaluation (shared by server and UI).
//
// Semantics
//  * Sector, type and exchange selections are restrictions: a row must be in
//    one of the selected values for each dimension (OR within, AND across).
//  * Numeric/signal filters are combined with `logic`: 'AND' (all must match)
//    or 'OR' (at least one must match).
//  * A filter on a field the row lacks (null) does not match.
//  * Sorting puts nulls last regardless of direction.
// ============================================================

export const SCREEN_FIELDS = {
  price: { label: 'Price', unit: '$' },
  changePct: { label: 'Day change', unit: '%' },
  volume: { label: 'Volume', unit: '' },
  avgVolume20: { label: 'Avg volume (20d)', unit: '' },
  dollarVolume20: { label: 'Avg $ volume (20d)', unit: '$' },
  marketCap: { label: 'Market cap', unit: '$' },
  rsi14: { label: 'RSI(14)', unit: '' },
  trend: { label: 'Trend score', unit: '' },
  momentum: { label: 'Momentum score', unit: '' },
  risk: { label: 'Risk score', unit: '' },
  volatility20: { label: 'Volatility (20d, ann.)', unit: '%' },
  return20: { label: '20-day return', unit: '%' },
  volumeRatio: { label: 'Volume vs 20d avg', unit: '×' },
  distToResistance: { label: 'Distance to resistance', unit: '%' },
};

export const SIGNAL_FILTERS = {
  macd_bullish_cross: { label: 'MACD bullish cross (≤3 bars)', test: (r) => r.macdState === 'bullish_cross' },
  macd_bearish_cross: { label: 'MACD bearish cross (≤3 bars)', test: (r) => r.macdState === 'bearish_cross' },
  above_sma50: { label: 'Close above SMA50', test: (r) => r.aboveSma50 === true },
  above_sma200: { label: 'Close above SMA200', test: (r) => r.aboveSma200 === true },
  below_sma200: { label: 'Close below SMA200', test: (r) => r.aboveSma200 === false },
  rsi_overbought: { label: 'RSI ≥ 70', test: (r) => typeof r.rsi14 === 'number' && r.rsi14 >= 70 },
  rsi_oversold: { label: 'RSI ≤ 30', test: (r) => typeof r.rsi14 === 'number' && r.rsi14 <= 30 },
  new_52w_high: { label: 'At 52-week high', test: (r) => r.at52wHigh === true },
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateScreen(def) {
  const errs = [];
  if (def.logic && !['AND', 'OR'].includes(def.logic)) errs.push('logic must be AND or OR');
  for (const f of def.filters || []) {
    if (f.signal) { if (!SIGNAL_FILTERS[f.signal]) errs.push(`Unknown signal ${f.signal}`); continue; }
    if (!SCREEN_FIELDS[f.field]) errs.push(`Unknown field ${f.field}`);
    if (!['gte', 'lte', 'between'].includes(f.op)) errs.push(`Unknown operator ${f.op}`);
    if (!isNum(f.value) || (f.op === 'between' && !isNum(f.value2))) errs.push(`Filter ${f.field} needs numeric bounds`);
  }
  if ((def.filters || []).length > 20) errs.push('At most 20 filters');
  return errs;
}

function matchFilter(row, f) {
  if (f.signal) return SIGNAL_FILTERS[f.signal].test(row);
  const v = row[f.field];
  if (!isNum(v)) return false;
  if (f.op === 'gte') return v >= f.value;
  if (f.op === 'lte') return v <= f.value;
  return v >= Math.min(f.value, f.value2) && v <= Math.max(f.value, f.value2);
}

const OP = { gte: '≥', lte: '≤' };
function fmtVal(field, v) {
  if (!isNum(v)) return '—';
  if (['dollarVolume20', 'marketCap', 'volume', 'avgVolume20'].includes(field)) {
    const a = Math.abs(v);
    return a >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0);
  }
  const unit = SCREEN_FIELDS[field]?.unit;
  return unit === '%' ? `${v.toFixed(2)}%` : unit === '$' ? `$${v.toFixed(2)}` : unit === '×' ? `${v.toFixed(2)}×` : v.toFixed(1);
}

/** Human-readable reasons a row matched (only conditions that are true for it). */
export function explainMatch(row, def = {}) {
  const out = [];
  for (const f of def.filters || []) {
    if (!matchFilter(row, f)) continue;
    if (f.signal) { out.push(SIGNAL_FILTERS[f.signal].label); continue; }
    const label = SCREEN_FIELDS[f.field].label;
    const bound = f.op === 'between' ? `between ${fmtVal(f.field, Math.min(f.value, f.value2))} and ${fmtVal(f.field, Math.max(f.value, f.value2))}` : `${OP[f.op]} ${fmtVal(f.field, f.value)}`;
    out.push(`${label} ${fmtVal(f.field, row[f.field])} (${bound})`);
  }
  if (def.sectors?.length) out.push(`Sector: ${row.sector}`);
  if (def.types?.length) out.push(`Type: ${row.type}`);
  return out;
}

export function applyScreen(rows, def = {}) {
  const logic = def.logic === 'OR' ? 'OR' : 'AND';
  const filters = def.filters || [];
  const inSet = (set, v) => !set || set.length === 0 || set.includes(v);
  let out = rows.filter((r) => inSet(def.sectors, r.sector) && inSet(def.types, r.type) && inSet(def.exchanges, r.exchange));
  if (filters.length) {
    out = out.filter((r) => (logic === 'AND' ? filters.every((f) => matchFilter(r, f)) : filters.some((f) => matchFilter(r, f))));
  }
  const sort = def.sort || { field: 'symbol', dir: 'asc' };
  const dir = sort.dir === 'desc' ? -1 : 1;
  out.sort((a, b) => {
    const x = a[sort.field], y = b[sort.field];
    if (x === null || x === undefined) return (y === null || y === undefined) ? a.symbol.localeCompare(b.symbol) : 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'string') return dir * x.localeCompare(y);
    return dir * (x - y) || a.symbol.localeCompare(b.symbol);
  });
  const pageSize = Math.min(100, Math.max(5, def.pageSize || 25));
  const total = out.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, def.page || 1));
  const pageRows = out.slice((page - 1) * pageSize, page * pageSize).map((r) => ({ ...r, matched: explainMatch(r, def) }));
  return { total, page, pages, pageSize, rows: pageRows };
}
