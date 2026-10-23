# Technical analysis specification (`mp-ta-1.0.0`)

Implementation: `public/shared/indicators.js`, `public/shared/analysis.js` — pure functions shared
by the server, the scanner job, the alert evaluator and the browser chart overlays.

## Inputs
- **Timeframe:** daily bars of completed regular sessions only (`date ≤ lastCompletedSession`).
- **Adjustment:** as delivered by Massive aggregates: **split-adjusted, not dividend-adjusted**.
- **History:** up to 2 years (Basic plan limit); the scanner uses the latest 300 stored bars.
- **Validation:** bars are rejected if any field is non-finite, a price ≤ 0, volume < 0, OHLC
  inconsistent (high < max(o,c,l) or low > min(o,c,h)), dates duplicated or out of order.
  Gaps versus the exchange calendar are reported (`quality.missingSessions`), never filled.
- **Cutoff & identity:** `id = sha256(version | symbol | timeframe | bar count | last 260 bars)`.
  Same inputs ⇒ identical object; any new bar ⇒ new id.

## Indicators (warm-up ⇒ `null`, never 0 or partial)
| Output | Definition | Bars needed |
|---|---|---|
| SMA(n) | arithmetic mean of last n closes | n |
| EMA(n) | α = 2/(n+1), seeded with SMA(n) | n |
| RSI(14) | Wilder: seed = mean of first 14 gains/losses, then (prev×13 + x)/14. Flat ⇒ 50; no losses ⇒ 100; no gains ⇒ 0 | 15 |
| MACD(12,26,9) | EMA12 − EMA26; signal = EMA9 of MACD; histogram = MACD − signal | 26 (line), 34 (signal) |
| MACD state | sign change of histogram in last 3 bars ⇒ bullish/bearish cross (n bars ago); else above/below signal | 34 |
| Bollinger(20,2) | SMA20 ± 2 × population σ; %B = (close − lower)/(upper − lower), undefined when bands collapse | 20 |
| ATR(14) | Wilder smoothing of true range | 15 |
| Volume ratio | latest volume ÷ mean of the **previous** 20 bars | 21 |
| Volatility | σ of 20 daily log returns × √252 | 21 |
| Max drawdown | peak-to-trough on closes over 120 bars | 2 |
| Support/resistance | pivot highs/lows with 5 bars each side, last 120 bars, clustered within 1.5%; level = cluster mean; resistance above close (nearest first), support below | 11 |

Reference verification (`tests/unit/indicators.test.js`): StockCharts SMA/EMA/RSI tables,
brute-force re-implementations (1e-9), flat prices, monotonic series, warm-up boundaries,
population-σ Bollinger, ATR with gaps, insufficient history.

## Scores — heuristics, NOT probabilities
All are 0–100 and **have not been calibrated against forward returns**. The UI says so next to them.
| Score | Formula | Labels |
|---|---|---|
| Trend | 100 × share of satisfied conditions among those with enough history: close>SMA20, close>SMA50, close>SMA200, SMA20>SMA50, SMA50>SMA200, SMA50 rising over 10 bars | ≥67 Uptrend, ≤33 Downtrend |
| Momentum | 0.6 × RSI14 + 0.4 × MACD component (100: MACD>signal & >0; 70: >signal & ≤0; 50: equal; 30: <signal & ≥0; 0: <signal & <0) | ≥60 Positive, ≤40 Negative |
| Risk | 0.7 × min(100, ann. vol %) + 0.3 × min(100, 2 × |120-bar drawdown %|) | <33 Low, <67 Moderate |
| Composite | 0.5 × trend + 0.3 × momentum + 0.2 × (100 − risk) | ≥65 Constructive, ≤35 Weak |
| News sentiment | 50 + 50 × (positive − negative) ÷ tagged articles, using Massive's per-ticker insight tags; needs ≥3 | ≥60 Positive, ≤40 Negative |

No confidence percentages or probability-of-profit figures are displayed anywhere.

## Explanations
`explainAnalysis()` derives every sentence from the analysis object, quoting the same numbers
(e.g. "RSI(14) is 89.4, at or above the 70 overbought threshold"). A property test over 300 random
series asserts text/zone/state agreement.

## Exit scenarios (research only)
- **Technical levels:** pivot resistance/support above (method shown).
- **Volatility stop:** close − 2 × ATR(14) — genuinely volatility-derived.
- **Illustrative targets:** close +5% / +10%, labelled "not a technical level".
- **Risk/reward:** user-editable entry/exit/stop; arithmetic only, no likelihood implied.
