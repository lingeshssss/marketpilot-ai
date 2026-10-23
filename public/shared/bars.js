// ============================================================
// Normalised OHLCV bar validation.
// Bar shape: { date: 'YYYY-MM-DD', t: epochMs, o, h, l, c, v }
// ============================================================

import { addDays, isTradingDay } from './calendar.js';

export class DataQualityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DataQualityError';
    this.details = details;
  }
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validates bars. Throws DataQualityError for malformed or out-of-order data
 * (we never "repair" provider data silently). Returns quality notes for
 * conditions that are legitimate but worth surfacing.
 */
export function validateBars(bars, { symbol = '?' } = {}) {
  if (!Array.isArray(bars)) throw new DataQualityError(`${symbol}: bars is not an array`);
  const notes = { zeroVolumeBars: 0, missingSessions: [], count: bars.length };
  let prevDate = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new DataQualityError(`${symbol}: bar ${i} has invalid date`, { index: i });
    for (const k of ['o', 'h', 'l', 'c', 'v']) {
      if (!finite(b[k])) throw new DataQualityError(`${symbol}: bar ${b.date} field ${k} is not a finite number`, { index: i });
    }
    if (b.o <= 0 || b.h <= 0 || b.l <= 0 || b.c <= 0) throw new DataQualityError(`${symbol}: bar ${b.date} has a non-positive price`, { index: i });
    if (b.v < 0) throw new DataQualityError(`${symbol}: bar ${b.date} has negative volume`, { index: i });
    const eps = 1e-9;
    if (b.h + eps < Math.max(b.o, b.c, b.l) || b.l - eps > Math.min(b.o, b.c, b.h)) {
      throw new DataQualityError(`${symbol}: bar ${b.date} OHLC values are inconsistent`, { index: i });
    }
    if (prevDate !== null) {
      if (b.date === prevDate) throw new DataQualityError(`${symbol}: duplicate bar for ${b.date}`, { index: i });
      if (b.date < prevDate) throw new DataQualityError(`${symbol}: bars out of order at ${b.date}`, { index: i });
      // record trading sessions that are missing between consecutive bars
      let d = addDays(prevDate, 1), guard = 0;
      while (d < b.date && guard++ < 40) {
        if (isTradingDay(d)) notes.missingSessions.push(d);
        d = addDays(d, 1);
      }
    }
    if (b.v === 0) notes.zeroVolumeBars++;
    prevDate = b.date;
  }
  return notes;
}
