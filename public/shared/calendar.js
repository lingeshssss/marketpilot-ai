// ============================================================
// US equity exchange calendar (NYSE / Nasdaq regular schedule)
// Pure module — shared by browser and server.
//
// Times are computed in America/New_York with Intl, so DST transitions
// are handled by the platform tz database rather than fixed offsets.
//
// Holiday rules follow NYSE Rule 7.2 (observed-date conventions):
//  - Saturday holidays are observed the preceding Friday, EXCEPT New Year's
//    Day (NYSE does not close on Dec 31 when Jan 1 falls on a Saturday).
//  - Sunday holidays are observed the following Monday.
// Early closes (13:00 ET): July 3 when it is Mon–Thu, the day after
// Thanksgiving, and Dec 24 when it is Mon–Thu.
// Ad-hoc closures (e.g. national days of mourning) are listed explicitly and
// can be extended at runtime with provider-supplied holiday data.
// ============================================================

export const EXCHANGE_TZ = 'America/New_York';

export const SESSION_TIMES = {
  preOpen: [4, 0],
  regularOpen: [9, 30],
  regularClose: [16, 0],
  earlyClose: [13, 0],
  postClose: [20, 0],
  earlyPostClose: [17, 0],
};

// Unscheduled full-day closures announced by NYSE.
const AD_HOC_CLOSURES = {
  '2012-10-29': 'Hurricane Sandy',
  '2012-10-30': 'Hurricane Sandy',
  '2018-12-05': 'National Day of Mourning (George H.W. Bush)',
  '2025-01-09': 'National Day of Mourning (Jimmy Carter)',
};

// Runtime overrides (from provider holiday feeds). date -> { status, name, close? }
const overrides = new Map();

export function registerCalendarOverrides(entries = []) {
  for (const e of entries) {
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    if (e.status !== 'closed' && e.status !== 'early-close') continue;
    overrides.set(e.date, { status: e.status, name: e.name || 'Exchange holiday' });
  }
}

export function clearCalendarOverrides() { overrides.clear(); }

// ---------- date helpers (calendar dates as 'YYYY-MM-DD') ----------

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function dow(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

function nthWeekday(y, m, weekday, n) {
  const first = dow(y, m, 1);
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(y, m, weekday) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDow = dow(y, m, last);
  return last - ((lastDow - weekday + 7) % 7);
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

function observed(y, m, d, { saturdayToFriday = true } = {}) {
  const w = dow(y, m, d);
  if (w === 6) return saturdayToFriday ? addDays(ymd(y, m, d), -1) : null;
  if (w === 0) return addDays(ymd(y, m, d), 1);
  return ymd(y, m, d);
}

const holidayCache = new Map();

/** Returns Map(date -> holiday name) of full-day closures for a year. */
export function holidaysForYear(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const h = new Map();
  const add = (date, name) => { if (date) h.set(date, name); };

  add(observed(y, 1, 1, { saturdayToFriday: false }), "New Year's Day");
  add(ymd(y, 1, nthWeekday(y, 1, 1, 3)), 'Martin Luther King Jr. Day');
  add(ymd(y, 2, nthWeekday(y, 2, 1, 3)), "Washington's Birthday");
  const [em, ed] = easterSunday(y);
  add(addDays(ymd(y, em, ed), -2), 'Good Friday');
  add(ymd(y, 5, lastWeekday(y, 5, 1)), 'Memorial Day');
  if (y >= 2022) add(observed(y, 6, 19), 'Juneteenth National Independence Day');
  add(observed(y, 7, 4), 'Independence Day');
  add(ymd(y, 9, nthWeekday(y, 9, 1, 1)), 'Labor Day');
  add(ymd(y, 11, nthWeekday(y, 11, 4, 4)), 'Thanksgiving Day');
  add(observed(y, 12, 25), 'Christmas Day');
  // New Year's Day of the following year falling on Saturday is NOT observed on Dec 31.

  for (const [date, name] of Object.entries(AD_HOC_CLOSURES)) {
    if (date.startsWith(`${y}-`)) h.set(date, name);
  }
  holidayCache.set(y, h);
  return h;
}

/** Returns Map(date -> reason) of scheduled 13:00 ET early closes for a year. */
export function earlyClosesForYear(y) {
  const e = new Map();
  const jul3 = dow(y, 7, 3);
  if (jul3 >= 1 && jul3 <= 4) e.set(ymd(y, 7, 3), 'Day before Independence Day');
  e.set(addDays(ymd(y, 11, nthWeekday(y, 11, 4, 4)), 1), 'Day after Thanksgiving');
  const dec24 = dow(y, 12, 24);
  if (dec24 >= 1 && dec24 <= 4) e.set(ymd(y, 12, 24), 'Christmas Eve');
  return e;
}

/** Describes a calendar date: trading day?, holiday name, early close. */
export function describeDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = dow(y, m, d);
  const ov = overrides.get(dateStr);
  if (w === 0 || w === 6) return { date: dateStr, trading: false, reason: 'Weekend' };
  if (ov && ov.status === 'closed') return { date: dateStr, trading: false, reason: ov.name };
  const hol = holidaysForYear(y).get(dateStr);
  if (hol) return { date: dateStr, trading: false, reason: hol };
  const early = (ov && ov.status === 'early-close') ? ov.name : earlyClosesForYear(y).get(dateStr);
  return { date: dateStr, trading: true, earlyClose: !!early, earlyCloseReason: early || null };
}

export function isTradingDay(dateStr) { return describeDate(dateStr).trading; }

export function previousTradingDay(dateStr) {
  let d = addDays(dateStr, -1);
  for (let i = 0; i < 15 && !isTradingDay(d); i++) d = addDays(d, -1);
  return d;
}

export function nextTradingDay(dateStr) {
  let d = addDays(dateStr, 1);
  for (let i = 0; i < 15 && !isTradingDay(d); i++) d = addDays(d, 1);
  return d;
}

// ---------- timezone conversion ----------

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: EXCHANGE_TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Wall-clock parts of an instant in exchange time. */
export function exchangeParts(instant) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(instant)) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
  };
}

/** Converts an exchange-local wall time to a UTC Date (DST-aware). */
export function exchangeTimeToUtc(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Offset of exchange tz at guess; iterate twice to settle around transitions.
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = exchangeParts(new Date(t));
    const [py, pm, pd] = p.date.split('-').map(Number);
    const asUtc = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    t = guess - (asUtc - t);
  }
  return new Date(t);
}

/** Session boundaries (UTC Dates) for a trading date, or null if closed. */
export function sessionBounds(dateStr) {
  const info = describeDate(dateStr);
  if (!info.trading) return null;
  const T = SESSION_TIMES;
  const close = info.earlyClose ? T.earlyClose : T.regularClose;
  const post = info.earlyClose ? T.earlyPostClose : T.postClose;
  return {
    date: dateStr,
    earlyClose: info.earlyClose,
    preOpen: exchangeTimeToUtc(dateStr, ...T.preOpen),
    open: exchangeTimeToUtc(dateStr, ...T.regularOpen),
    close: exchangeTimeToUtc(dateStr, ...close),
    postClose: exchangeTimeToUtc(dateStr, ...post),
  };
}

/**
 * Market state at an instant.
 * phase: 'pre' | 'regular' | 'post' | 'closed'
 */
export function marketState(instant = new Date()) {
  const now = instant instanceof Date ? instant : new Date(instant);
  const { date } = exchangeParts(now);
  const info = describeDate(date);
  const base = { asOf: now.toISOString(), exchangeDate: date, timezone: EXCHANGE_TZ };

  if (!info.trading) {
    const nd = nextTradingDay(date);
    return {
      ...base, phase: 'closed', label: 'Market closed', reason: info.reason,
      isTradingDay: false, nextOpen: sessionBounds(nd).open.toISOString(),
      lastSessionDate: previousTradingDay(date),
    };
  }
  const b = sessionBounds(date);
  const common = { ...base, isTradingDay: true, earlyClose: b.earlyClose, earlyCloseReason: info.earlyCloseReason || null,
    open: b.open.toISOString(), close: b.close.toISOString() };
  if (now < b.preOpen) {
    return { ...common, phase: 'closed', label: 'Market closed', reason: 'Before pre-market',
      nextOpen: b.open.toISOString(), lastSessionDate: previousTradingDay(date) };
  }
  if (now < b.open) {
    return { ...common, phase: 'pre', label: 'Pre-market', reason: 'Extended hours',
      nextOpen: b.open.toISOString(), lastSessionDate: previousTradingDay(date) };
  }
  if (now < b.close) {
    return { ...common, phase: 'regular', label: b.earlyClose ? 'Market open · early close' : 'Market open',
      reason: b.earlyClose ? `Closes 1:00 PM ET (${info.earlyCloseReason})` : 'Regular session',
      lastSessionDate: previousTradingDay(date) };
  }
  const nd = nextTradingDay(date);
  if (now < b.postClose) {
    return { ...common, phase: 'post', label: 'After hours', reason: 'Extended hours',
      nextOpen: sessionBounds(nd).open.toISOString(), lastSessionDate: date };
  }
  return { ...common, phase: 'closed', label: 'Market closed', reason: 'After extended hours',
    nextOpen: sessionBounds(nd).open.toISOString(), lastSessionDate: date };
}

/**
 * The most recent trading date whose regular session has fully closed at `instant`.
 * Used to decide whether end-of-day data is current.
 */
export function lastCompletedSession(instant = new Date()) {
  const { date } = exchangeParts(instant);
  if (isTradingDay(date) && instant >= sessionBounds(date).close) return date;
  return previousTradingDay(date);
}

/** Classifies a trade timestamp into a session phase. */
export function sessionOfInstant(instant) {
  const s = marketState(instant);
  return s.phase;
}
