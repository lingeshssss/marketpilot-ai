import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  holidaysForYear, earlyClosesForYear, marketState, describeDate, lastCompletedSession,
  exchangeTimeToUtc, previousTradingDay, registerCalendarOverrides, clearCalendarOverrides,
} from '../../public/shared/calendar.js';

// Published NYSE holiday schedules (nyse.com/markets/hours-calendars)
const NYSE = {
  2024: ['2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25'],
  2025: ['2025-01-01', '2025-01-09', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25'],
  2026: ['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'],
  2027: ['2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
};
const EARLY = {
  2024: ['2024-07-03', '2024-11-29', '2024-12-24'],
  2025: ['2025-07-03', '2025-11-28', '2025-12-24'],
  2026: ['2026-11-27', '2026-12-24'],
};

for (const [y, dates] of Object.entries(NYSE)) {
  test(`NYSE holidays ${y}`, () => assert.deepEqual([...holidaysForYear(Number(y)).keys()].sort(), dates));
}
for (const [y, dates] of Object.entries(EARLY)) {
  test(`NYSE early closes ${y}`, () => assert.deepEqual([...earlyClosesForYear(Number(y)).keys()].sort(), dates));
}

test('2022: Jan 1 on Saturday is not observed on Dec 31, 2021', () => {
  assert.equal(describeDate('2021-12-31').trading, true);
  assert.equal(holidaysForYear(2022).has('2022-01-01'), false);
});

test('Sunday 2026-10-18 is closed (weekend) — the live-UI "Markets Open" bug', () => {
  const s = marketState(new Date('2026-10-18T15:00:00Z'));
  assert.equal(s.phase, 'closed');
  assert.equal(s.reason, 'Weekend');
  assert.equal(s.lastSessionDate, '2026-10-16');
  assert.equal(s.nextOpen, '2026-10-19T13:30:00.000Z'); // 9:30 EDT
});

test('Holiday: Thanksgiving 2026 closed; day after is early close at 13:00 ET', () => {
  assert.equal(marketState(new Date('2026-11-26T16:00:00Z')).reason, 'Thanksgiving Day');
  const s = marketState(new Date('2026-11-27T17:30:00Z')); // 12:30 EST
  assert.equal(s.phase, 'regular'); assert.equal(s.earlyClose, true);
  assert.equal(s.close, '2026-11-27T18:00:00.000Z');
  assert.equal(marketState(new Date('2026-11-27T18:30:00Z')).phase, 'post');
  assert.equal(marketState(new Date('2026-11-27T22:30:00Z')).phase, 'closed', 'post ends 17:00 on early-close days');
});

test('DST: open is 13:30Z in summer, 14:30Z in winter; transition weeks', () => {
  assert.equal(exchangeTimeToUtc('2026-07-15', 9, 30).toISOString(), '2026-07-15T13:30:00.000Z');
  assert.equal(exchangeTimeToUtc('2026-01-15', 9, 30).toISOString(), '2026-01-15T14:30:00.000Z');
  // DST starts 2026-03-08; Monday 03-09 open is 13:30Z
  assert.equal(exchangeTimeToUtc('2026-03-09', 9, 30).toISOString(), '2026-03-09T13:30:00.000Z');
  assert.equal(exchangeTimeToUtc('2026-03-06', 9, 30).toISOString(), '2026-03-06T14:30:00.000Z');
  // DST ends 2026-11-01
  assert.equal(exchangeTimeToUtc('2026-11-02', 16, 0).toISOString(), '2026-11-02T21:00:00.000Z');
  assert.equal(marketState(new Date('2026-03-09T13:45:00Z')).phase, 'regular');
  assert.equal(marketState(new Date('2026-03-06T13:45:00Z')).phase, 'pre');
});

test('Session phases on a normal day', () => {
  const at = (iso) => marketState(new Date(iso)).phase;
  assert.equal(at('2026-10-19T07:59:00Z'), 'closed'); // 03:59 ET
  assert.equal(at('2026-10-19T08:00:00Z'), 'pre');
  assert.equal(at('2026-10-19T13:30:00Z'), 'regular');
  assert.equal(at('2026-10-19T19:59:59Z'), 'regular');
  assert.equal(at('2026-10-19T20:00:00Z'), 'post');
  assert.equal(at('2026-10-20T00:00:00Z'), 'closed');
});

test('lastCompletedSession respects close time and holidays', () => {
  assert.equal(lastCompletedSession(new Date('2026-10-19T19:00:00Z')), '2026-10-16');
  assert.equal(lastCompletedSession(new Date('2026-10-19T20:00:00Z')), '2026-10-19');
  assert.equal(previousTradingDay('2026-04-06'), '2026-04-02', 'skips Good Friday');
});

test('Provider overrides add ad-hoc closures', () => {
  registerCalendarOverrides([{ date: '2026-10-21', status: 'closed', name: 'Test closure' }]);
  assert.equal(describeDate('2026-10-21').trading, false);
  clearCalendarOverrides();
  assert.equal(describeDate('2026-10-21').trading, true);
});
