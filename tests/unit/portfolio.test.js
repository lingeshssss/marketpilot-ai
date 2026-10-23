import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolio, performanceSeries, replay, mapCsv, parseCsv, validateTransaction } from '../../public/shared/portfolio.js';
import { evaluateRule, validateRule } from '../../public/shared/alerts.js';
import { fmtPrice, fmtPct, fmtMoney, roundTo, fmtChange } from '../../public/shared/format.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
let seq = 0;
const T = (o) => ({ seq: seq++, fees: 0, ...o });

test('Average cost, fees, partial sell, realized P&L', () => {
  const txns = [
    T({ type: 'buy', symbol: 'AAA', date: '2026-01-05', quantity: 10, price: 100, fees: 1 }),
    T({ type: 'buy', symbol: 'AAA', date: '2026-02-05', quantity: 10, price: 120, fees: 1 }),
    T({ type: 'sell', symbol: 'AAA', date: '2026-03-05', quantity: 5, price: 130, fees: 1 }),
  ];
  const p = computePortfolio(txns, { AAA: { price: 125, prevClose: 124, sessionDate: '2026-03-06' } });
  const pos = p.positions[0];
  near(pos.quantity, 15);
  near(pos.avgCost, 2202 / 20);           // (1001 + 1201) / 20
  near(p.totals.realized, 5 * 130 - 1 - 5 * 110.1);
  near(pos.marketValue, 15 * 125);
  near(pos.unrealized, 15 * 125 - 15 * 110.1);
  near(p.totals.dailyPnl, 15 * 1);
});

test('Fractional shares and splits keep total basis; daily P&L on split day uses post-split qty', () => {
  const txns = [
    T({ type: 'buy', symbol: 'SPL', date: '2026-01-05', quantity: 2.5, price: 400 }),
    T({ type: 'split', symbol: 'SPL', date: '2026-06-01', splitFrom: 1, splitTo: 4 }),
  ];
  const p = computePortfolio(txns, { SPL: { price: 101, prevClose: 100, sessionDate: '2026-06-01' } });
  near(p.positions[0].quantity, 10);
  near(p.positions[0].avgCost, 100);
  near(p.totals.dailyPnl, 10);
});

test('Buys and sells on the quote date use trade price in daily P&L', () => {
  const txns = [
    T({ type: 'buy', symbol: 'D', date: '2026-01-02', quantity: 10, price: 50 }),
    T({ type: 'buy', symbol: 'D', date: '2026-01-05', quantity: 5, price: 51 }),
    T({ type: 'sell', symbol: 'D', date: '2026-01-05', quantity: 2, price: 53 }),
  ];
  const p = computePortfolio(txns, { D: { price: 52, prevClose: 50, sessionDate: '2026-01-05' } });
  // held at prev close 10, sold 2 today -> 8 × (52−50) = 16; buy 5 × (52−51) = 5; sell 2 × (53−50) = 6
  near(p.totals.dailyPnl, 27);
});

test('Dividends, deposits, withdrawals, implicit contributions, cash reconciles', () => {
  const txns = [
    T({ type: 'deposit', date: '2026-01-01', amount: 1000 }),
    T({ type: 'buy', symbol: 'C', date: '2026-01-02', quantity: 15, price: 100 }), // 500 shortfall -> implicit
    T({ type: 'dividend', symbol: 'C', date: '2026-02-01', amount: 30 }),
    T({ type: 'withdrawal', date: '2026-02-02', amount: 10 }),
  ];
  const led = replay(txns);
  near(led.implicit, 500); near(led.cash, 20);
  const p = computePortfolio(txns, { C: { price: 110, prevClose: 110, sessionDate: '2026-02-03' } });
  near(p.totals.totalValue, 15 * 110 + 20);
  near(p.totals.netContributions, 1490);
  near(p.totals.totalGain, 1670 - 1490);
  near(p.totals.dividends, 30);
});

test('Overselling is reported, not silently clamped; missing quote -> totals unavailable (not zero)', () => {
  const txns = [T({ type: 'buy', symbol: 'O', date: '2026-01-02', quantity: 1, price: 10 }), T({ type: 'sell', symbol: 'O', date: '2026-01-03', quantity: 2, price: 10 })];
  assert.equal(replay(txns).problems.length, 1);
  const p = computePortfolio([T({ type: 'buy', symbol: 'Q', date: '2026-01-02', quantity: 1, price: 10 })], {});
  assert.equal(p.totals.totalValue, null);
  assert.deepEqual(p.missingQuotes, ['Q']);
});

test('TWR neutralises deposits; split-adjusted closes valued in as-of shares', () => {
  const closes = { S: new Map([['2026-01-02', 10], ['2026-01-05', 11], ['2026-01-06', 11], ['2026-01-07', 12.1]]) };
  const txns = [
    T({ type: 'deposit', date: '2026-01-02', amount: 1000 }),
    T({ type: 'buy', symbol: 'S', date: '2026-01-02', quantity: 100, price: 10 }),
    T({ type: 'deposit', date: '2026-01-06', amount: 1000 }),
  ];
  const r = performanceSeries(txns, closes, ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']);
  // Day returns: +10%, 0% (deposit removed), then 1100*1.1+1000 = 2210 vs 2100 -> +5.238%
  near(r.series[1].value, 1100); near(r.series[2].value, 2100);
  near(r.twr, (1.1 * 1 * (2210 / 2100) - 1) * 100, 1e-9);

  // 1:2 split on 01-06: adjusted closes before split are halved by provider
  const adj = { S: new Map([['2026-01-02', 5], ['2026-01-05', 5.5], ['2026-01-06', 5.5]]) };
  const tx2 = [T({ type: 'buy', symbol: 'S', date: '2026-01-02', quantity: 100, price: 10 }), T({ type: 'split', symbol: 'S', date: '2026-01-06', splitFrom: 1, splitTo: 2 })];
  const r2 = performanceSeries(tx2, adj, ['2026-01-02', '2026-01-05', '2026-01-06']);
  near(r2.series[0].value, 0 + 100 * 5 * 2 - 1000 + 1000); // cash 0 after implicit funding; MV = 1000
  near(r2.series[2].value, 200 * 5.5);
  near(r2.twr, 10, 1e-9);
});

test('CSV import: mapping, US dates, validation errors, duplicate detection (existing + in-file)', () => {
  const csv = 'Action,Trade Date,Ticker,Qty,Price,Commission\nBuy,01/05/2026,aapl,10,"1,200.50",1\nBuy,01/05/2026,aapl,10,"1,200.50",1\nSell,2026-02-01,MSFT,-3,400,0\n';
  const rows = parseCsv(csv);
  const existing = [{ type: 'buy', date: '2026-01-05', symbol: 'AAPL', quantity: 10, price: 1200.5, fees: 1 }];
  const { items } = mapCsv(rows, { type: 'Action', date: 'Trade Date', symbol: 'Ticker', quantity: 'Qty', price: 'Price', fees: 'Commission' }, existing);
  assert.equal(items[0].txn.price, 1200.5);
  assert.equal(items[0].duplicate, 'existing');
  assert.equal(items[1].duplicate, 'existing');
  assert.ok(items[2].errors.some((e) => /Quantity/.test(e)));
  const fresh = mapCsv(rows, { type: 'Action', date: 'Trade Date', symbol: 'Ticker', quantity: 'Qty', price: 'Price', fees: 'Commission' }, []);
  assert.equal(fresh.items[0].duplicate, null); assert.equal(fresh.items[1].duplicate, 'in-file');
  assert.deepEqual(validateTransaction({ type: 'buy', date: '2026-01-01', symbol: 'A', quantity: 1, price: 1 }), []);
});

test('Alerts: baseline, cross, idempotent retries, stale skip, cooldown', () => {
  const rule = { kind: 'price_above', threshold: 100, cooldownMinutes: 60 };
  const t0 = new Date('2026-10-19T20:00:00Z');
  let r = evaluateRule(rule, null, { key: 'k1', value: 99, fresh: true }, t0);
  assert.equal(r.action, 'baseline');
  r = evaluateRule(rule, r.state, { key: 'k2', value: 101, fresh: true }, t0);
  assert.equal(r.action, 'trigger');
  const again = evaluateRule(rule, r.state, { key: 'k2', value: 101, fresh: true }, t0);
  assert.equal(again.action, 'skip_duplicate', 'retry of same observation is a no-op');
  let s = evaluateRule(rule, r.state, { key: 'k3', value: 102, fresh: true }, t0);
  assert.equal(s.action, 'no_cross', 'staying above does not re-trigger');
  s = evaluateRule(rule, s.state, { key: 'k4', value: 98, fresh: true }, t0);
  s = evaluateRule(rule, s.state, { key: 'k5', value: 103, fresh: true }, new Date(t0.getTime() + 30 * 60000));
  assert.equal(s.action, 'suppressed_cooldown');
  const st = evaluateRule(rule, s.state, { key: 'k6', value: 50, fresh: false }, t0);
  assert.equal(st.action, 'skip_stale'); assert.deepEqual(st.state, s.state);
  assert.deepEqual(validateRule({ kind: 'rsi_above', symbol: 'AAPL', threshold: 120 }), ['RSI threshold must be between 0 and 100']);
});

test('Formatting rules', () => {
  assert.equal(fmtPrice(218.265), '$218.27');
  assert.equal(fmtPrice(0.12345), '$0.1235');
  assert.equal(fmtPct(-0.744), '−0.74%');
  assert.equal(fmtPct(0), '0.00%');
  assert.equal(fmtMoney(-1234.5), '−$1,234.50');
  assert.equal(fmtPrice(null), '—');
  assert.equal(fmtChange(1.005, { reference: 200 }), '+1.01');
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(-2.675, 2), -2.68);
});
