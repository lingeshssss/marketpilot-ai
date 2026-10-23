# MarketPilot design specification

MarketPilot is an adaptive web research workspace for iPhone, iPad and Mac browsers. It follows Apple
Human Interface Guidelines principles where they apply to the web; it is not a native app and does not
reproduce Apple's system materials exactly. This revision builds on PR #1 (`design/apple-inspired-workspace`)
and applies it to the working, data-backed product.

## 1. Design system

Tokens live in `public/css/app.css` (`:root`, redefined for dark mode and for Increase Contrast).

| Token | Light | Dark |
| --- | --- | --- |
| Canvas `--bg` | #F5F5F7 | #000000 |
| Content surface `--surface` | #FFFFFF | #1C1C1E |
| Primary text | #1D1D1F | #F5F5F7 |
| Secondary text `--text-2` | #3C3C43 | #D1D1D6 |
| Tertiary text `--text-3` (never lighter) | #5E5E66 (6.3:1) | #A1A1AA |
| Accent / links | #0A66D6 / #0058C4 | #3D9BFF / #6CB2FF |
| Positive | #0B7A3E (5.5:1) | #34C77B |
| Negative | #C4261D (5.6:1) | #FF6B61 |
| Caution | #8A5300 | #FFB340 |
| Chart series (validated for CVD & contrast) | #0A66D6, #B26B00, #7A3FBF | #2A86EA, #C9800F, #9B72EA |

- **Type:** platform system stack (San Francisco on Apple devices). Size-specific tracking: display
  text −0.024em, body −0.011em, small text 0. Numbers use tabular figures everywhere. Sizes are in rem
  so browser text scaling works.
- **Spacing:** 4pt grid (`--s1`…`--s10`), 16px phone gutters, 24px desktop gutters, 16–22px radii.
- **Targets:** 40px controls with a pointer, **44px on touch** (`pointer: coarse`).
- **Materials:** translucent blur is reserved for chrome — sidebar, toolbar, tab bar, ticker. All
  financial text and charts sit on solid surfaces. Reduce Transparency and Increase Contrast switch
  chrome to solid and strengthen borders.
- **Direction is never colour-only:** changes carry ▲/▼ glyphs, signs and accessible labels.

## 2. Screens

| Screen | Route | Layout |
| --- | --- | --- |
| Dashboard | `/` | data-source notice → four ETF benchmarks (SPY, QQQ, DIA, IWM) with session & timeliness → movers in the stated scan universe → market news (publisher, time, link) → portfolio → watchlist → recent alerts |
| Symbol | `/symbols/:symbol?tab=` | name, price, change, provenance → actions → tabs: Overview (chart, key stats, signal summary), Analysis, Exit scenarios, News, Fundamentals, AI explanation |
| Scanner | `/scanner?screen=` | filter panel (AND/OR, numeric, signals, type, sector, presets, saved screens) → sortable paged results with "why it matched" |
| Watchlists | `/watchlists/:id` | list tabs → items with reorder, notes, undoable removal, import/export |
| Portfolios | `/portfolios/:id` | totals (value, day P&L, unrealized, realized + dividends) → holdings & allocation → performance → transactions → method |
| Alerts | `/alerts` | rules with enable switches and last observation → history with delivery status |
| Settings | `/settings` | appearance → notifications → data sources & configuration issues → account (export, sample data, delete) |
| Auth | `/signin` `/signup` `/forgot-password` `/reset-password` | single card |

Desktop uses a sidebar; phones use a five-tab bar (Dashboard, Scanner, Watchlists, Portfolios, Alerts)
with Settings in the toolbar. Safe-area insets pad the toolbar, tab bar, ticker and sheets.

## 3. Interaction and motion

- Press feedback on pointer-down: 97% scale over 100ms.
- Sheets and switches use a critically damped spring curve (CSS `linear()` approximation, ~0.32s);
  sheets enter from the bottom on phones and dismiss the same way. CSS transitions retarget from the
  current value, so they can be interrupted.
- Pages enter with a 320ms fade and 6px rise. The ticker scrolls only if enabled, pauses on hover or
  focus, has a visible pause button, and is static under Reduce Motion.
- Reduce Motion replaces movement with opacity changes and turns off shimmer and page entry.
- Prices change only when the provider returns a new observation (`quoteId`), never on a timer.

## 4. Accessibility

Skip link, landmark navigation, `aria-current` on nav, labelled icon buttons, a WAI-ARIA combobox for
search ("/" focuses it), tabs with arrow-key navigation, native `<dialog>` with focus moved in and
restored to the opener, focus moved to the page heading after navigation, visible focus rings,
`aria-live` toasts and status regions, `aria-sort` on sortable columns, and a data-table alternative
for charts.

## 5. Honesty in the interface

Every price shows its session, market time, timeliness (end-of-day, delayed, real-time, demo) and
source; stale or unavailable data is labelled, never replaced. Scores are labelled heuristics.
Disclosures sit next to the decision they qualify instead of in banner blocks.

References: Apple HIG — [Materials](https://developer.apple.com/design/human-interface-guidelines/materials),
[Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[Charts](https://developer.apple.com/design/human-interface-guidelines/charts).
