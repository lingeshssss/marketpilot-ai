# Portfolio accounting method

Implementation: `public/shared/portfolio.js` (pure, unit-tested). Every screen calls the single server
function `valuePortfolios()` with the same quote snapshot, so totals are identical everywhere.

## Transactions
`buy`, `sell` (quantity, price, fees), `dividend` (cash amount), `deposit`, `withdrawal`, `fee`,
`split` (new-for-old ratio). Fractional quantities are supported (stored as NUMERIC(28,10)).
Ordering: trade date, then entry order. Future dates and sells exceeding the position are rejected;
edits/deletes that would make history invalid are rejected.

## Rules
- **Cost basis:** average cost. Buy fees are added to basis; sell fees reduce proceeds.
- **Realized P&L:** proceeds − sell fees − average cost × quantity sold. (Tax-lot methods such as FIFO
  or specific identification can produce different realized figures; this is not tax reporting.)
- **Splits:** quantity × to/from; total basis unchanged (average cost scales accordingly).
- **Dividends:** cash income, reported separately; no basis change; not reinvested automatically.
- **Cash:** deposits/withdrawals are external flows. A buy larger than available cash is treated as an
  implicit contribution of the shortfall, so portfolios without recorded deposits still reconcile.
- **Market value:** quantity × current normalized quote. If any holding lacks a usable quote, totals that
  depend on prices are shown as unavailable rather than understated.
- **Day P&L:** for each position, shares held at the previous close × (price − previous close) +
  today's buys × (price − buy price) + today's sells × (sell price − previous close). Fees excluded.
- **Performance:** daily valuation at split-adjusted closes; quantities are restated to the as-of-date
  share basis using recorded splits. Time-weighted return chains daily sub-period returns
  r = (V_d − F_d) / V_{d−1} − 1 where F_d is that day's external flow (transactions settle at the close).
  Missing prices carry the last known close forward and are reported.

## Limitations
- Single currency (USD). No FX.
- No corporate actions beyond user-recorded splits and dividends (spin-offs, mergers not modelled).
- Provider history limits (2 years on Massive Basic) truncate the performance chart; this is stated.
- Simulated portfolios are kept separate and are never included in "all actual portfolios".
