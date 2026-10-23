// ============================================================
// Numeric rounding & display rules — one definition for every screen.
//
//  * Calculations always use full-precision provider values.
//  * Rounding happens ONLY at display time, through these functions.
//  * Prices: 2 decimals when |p| >= 1, 4 decimals below $1.
//  * Percentages: 2 decimals. Money totals: 2 decimals.
//  * Quantities: up to 8 decimals, trailing zeros trimmed.
//  * Rounding mode: half away from zero (Intl default "halfExpand").
//  * Missing values render as an em dash, never as 0.
// ============================================================

const DASH = '—';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function roundTo(value, dp) {
  if (!isNum(value)) return null;
  const f = 10 ** dp;
  const r = Math.round(Math.abs(value) * f + Number.EPSILON * f) / f;
  return Math.sign(value) * r || 0;
}

export function priceDecimals(p) { return isNum(p) && Math.abs(p) < 1 && p !== 0 ? 4 : 2; }

const nfCache = new Map();
function nf(min, max, opts = {}) {
  const key = `${min}|${max}|${JSON.stringify(opts)}`;
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max, ...opts }));
  }
  return nfCache.get(key);
}

export function fmtPrice(p, { currency = 'USD', symbol = true } = {}) {
  if (!isNum(p)) return DASH;
  const dp = priceDecimals(p);
  const s = nf(dp, dp).format(Math.abs(p));
  const cur = symbol ? (currency === 'USD' ? '$' : `${currency} `) : '';
  return `${p < 0 ? '−' : ''}${cur}${s}`;
}

export function fmtMoney(v, { currency = 'USD', signed = false } = {}) {
  if (!isNum(v)) return DASH;
  const s = nf(2, 2).format(Math.abs(v));
  const cur = currency === 'USD' ? '$' : `${currency} `;
  const sign = v < 0 ? '−' : (signed && v > 0 ? '+' : '');
  return `${sign}${cur}${s}`;
}

/** @param {number|null|undefined} v @param {{ reference?: number|null }} [opts] */
export function fmtChange(v, { reference = undefined } = {}) {
  if (!isNum(v)) return DASH;
  const dp = priceDecimals(reference ?? v);
  const s = nf(dp, dp).format(Math.abs(v));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`;
}

export function fmtPct(v, { signed = true, dp = 2 } = {}) {
  if (!isNum(v)) return DASH;
  const s = nf(dp, dp).format(Math.abs(v));
  const sign = v < 0 ? '−' : (signed && v > 0 ? '+' : '');
  return `${sign}${s}%`;
}

export function fmtQty(q) {
  if (!isNum(q)) return DASH;
  return nf(0, 8).format(q);
}

export function fmtCompact(v) {
  if (!isNum(v)) return DASH;
  return nf(0, 2, { notation: 'compact', compactDisplay: 'short' }).format(v);
}

export function fmtNumber(v, dp = 2) {
  if (!isNum(v)) return DASH;
  return nf(dp, dp).format(v);
}

/** 'up' | 'down' | 'flat' — used for accessible direction labels. */
export function direction(v) {
  if (!isNum(v) || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

export function fmtDateTime(iso, { tz = 'America/New_York', withTz = true } = {}) {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', ...(withTz ? { timeZoneName: 'short' } : {}),
  }).format(d);
}

export function fmtDate(dateStr) {
  if (!dateStr) return DASH;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y) return DASH;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function fmtRelative(iso, now = Date.now()) {
  if (!iso) return DASH;
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return DASH;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}
