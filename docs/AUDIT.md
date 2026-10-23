# Audit of the original application (v1, deployed 2026-10-14)

Source inspected: the repository at commit-equivalent of the live deployment
(`https://marketpilot-ai-gilt.vercel.app`, files byte-identical to the repo).

## Stack as found
- Static site: `index.html`, `css/styles.css`, vanilla ES modules in `js/`, Chart.js from a CDN.
- No backend, no database, no authentication, no API routes, no scheduled jobs, no tests.
- Vercel project `marketpilot-ai`: framework "Other", output = repo root, **zero environment variables**.
- README described "Data: Mock data (ready for real API integration)".

## Feature → implementation trace

| Visible feature | Implementation | Finding |
|---|---|---|
| Quotes everywhere | `STOCKS` constant in `js/data/mockData.js` (hardcoded prices from an old date) | Not market data |
| Daily change % | `Math.random()` at each render site: dashboard signal panel, watchlist panel, watchlist page, stock detail, scanner, top movers | Root cause of AAPL +0.61% / +2.25% / +0.82% and NVDA +3.26% / −0.74%; values change on every render |
| Ticker tape | Separate hardcoded array in `app.js` (`AAPL +0.82%`) | Third, unrelated source for the same instrument |
| Price history & charts | `generatePriceHistory()` random walk forced to end at the constant price | Fabricated; different on every visit |
| RSI/MACD charts | Real formulas, but run on the random history | Values meaningless and non-repeatable |
| Trend/momentum/risk/sentiment scores | `generateScores()` = ticker hash + `Math.random()` | Root cause of scores changing on reopen and disagreeing between sections |
| "RSI overheating" (sell timing) | Keyed on the random **trend score**, not RSI | Root cause of RSI 89.4 "overbought" next to "no overheating" |
| "MACD crossover watch" | Keyed on random momentum score, not MACD | Root cause of "bullish cross" chart vs "potential bearish crossover" text |
| Resistance | Chart card: pivot clustering on random history (often none above → N/A); sell timing: `price × 1.04/1.08/1.14` | Root cause of N/A vs $227/$235.73/$248.83 |
| Entry/sell zones, stop | Fixed percentages of price; stop labelled "volatility profile" | Mislabelled method |
| Confidence % / "probability favors" | Weighted sum of random scores | Unvalidated probability language |
| Dashboard portfolio | Literals `184620`, `22340`, `+$842.30 (+0.46%)` in `dashboard.js` | Root cause of $184,620 vs $27,663.85 |
| Portfolio page | 5 hardcoded positions × constant prices; day P&L literal `+$842.30` | Same literal reused on both screens |
| "Markets Open" | Static string in `dashboard.js` | Root cause of "Markets Open" on Sunday 2026-10-18 |
| Market indices / sectors | Constants | Static |
| News | Template headlines with the company name inserted, shuffled randomly; no URLs | Fabricated articles |
| AI Analysis button | Scrolls / re-renders template text; no model call | No progress/completion because nothing runs |
| Alerts | Hardcoded list in `app.js` modal; per-ticker template alerts | No rules, no evaluation |
| Watchlist | In-memory array; lost on refresh | Browser-only (not even localStorage) |
| Settings | In-memory object; theme/candle options disabled | Not persisted; says "mock market data, simulated sentiment" |
| Search | Prefix match over the 20-symbol constant | Root cause of SPY returning nothing |
| Routing | `currentPage` variable, `innerHTML` swap | Root cause of every section sharing `/`; no Back/Forward |
| Navigation semantics | `div`s with click handlers, emoji icons, unlabeled icon buttons | Accessibility gaps |
| Text contrast | `--text-muted` ≈ 3:1 on dark background, 0.65–0.72rem labels | Readability finding confirmed |

## Security / isolation
- No user concept at all; nothing to isolate. No secrets present (no integrations).
- Third-party script (Chart.js CDN) without SRI; Google Fonts dependency.

## Deployment
- Live files identical to the repository; the deployed app is exactly the mock prototype.

## Conclusion
Every number on the live site is either a constant or random. The redesign replaces the
data, calculation, persistence and alerting layers entirely, keeping vanilla JS + Vercel.
