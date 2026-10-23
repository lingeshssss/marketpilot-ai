# MarketPilot design specification

MarketPilot is an adaptive web research workspace for iPhone, iPad, and Mac browsers. This implementation follows Apple HIG principles; it is not a native SwiftUI app or an exact implementation of Apple's system Liquid Glass renderer.

## 1. Design system

| Token | Light | Dark |
| --- | --- | --- |
| Canvas | #F5F5F7 | #111214 |
| Content surface | #FFFFFF | #1C1D21 |
| Primary text | #1D1D1F | #F5F5F7 |
| Secondary text | #515560 | #C0C3CC |
| Accent / links | #0067D8 | #70B3FF |
| Positive | #137743 | #64D99B |
| Negative | #C12E39 | #FF8790 |
| Caution | #8B5900 | #F5C568 |

Use the platform system font stack, which selects San Francisco on Apple devices. Page titles scale from 28 to 40px, section titles use 16–20px semibold, and body text uses relative units. Numbers use tabular spacing. This supports browser text scaling; native Dynamic Type integration would require a native application.

Use a 4px spacing base, 16px mobile gutters, 24px card padding, 24px section gaps, and 40px desktop gutters. Cards have 20–24px corners. Primary controls have at least 44px target heights. Switches have an expanded hit area. Safe-area insets protect headers and bottom navigation.

Glass is reserved for the toolbar, sidebar, and mobile tab bar. Financial text and charts sit on solid surfaces. Materials use 24px backdrop blur with a solid fallback. Reduce Transparency and Increase Contrast preferences remove translucent backgrounds. Icons are consistent outline SVGs with SF Symbol-like metaphors: square grid, star, viewfinder, briefcase, and gear. They are not bundled SF Symbols assets.

## 2. Core screen layouts

**Today:** Search toolbar → sample-data context → large page title and date → four market snapshots → market brief → movers, sectors, and example news. Desktop places the watchlist and portfolio summary in a supporting column; mobile stacks content and provides five persistent tabs.

**Company:** Company name and price → watchlist action → time-range controls and price chart → technical indicators → analysis tabs and explanatory context. Risk information uses labels as well as color. An unsupported ticker shows a recovery action.

**Watchlist:** Saved sample companies with prices and signals. Search adds supported companies through their detail screen; an empty watchlist provides a dashboard action.

**Explore:** Filter controls → ranked sample setups → company detail. Filters remain keyboard accessible; narrower layouts wrap controls.

**Portfolio:** Existing example positions and allocation information remain available. Holdings are simulated, not brokerage balances.

**Settings:** Grouped preference cards → System / Light / Dark segmented control → analysis and example alert preferences → about. Appearance persists on the device and follows OS changes in System mode.

**About / landing:** Concise headline → two clear entry actions → feature cards → explanation and disclosures. The initial app route opens Today; the Home sidebar item opens the introduction.

## 3. Interaction and motion

- Pointer-down feedback scales buttons to 97% over 100ms. Release returns to rest through the existing spring-like cubic-bezier timing. This is CSS easing, not a native physics spring.
- Page entry fades and translates 6px over 320ms. Keep chart transitions subtle; no continuous ticker tape or blinking signal dots.
- Reduce Motion disables CSS animation and transitions. No artificial loading delay is introduced for synchronous sample data.
- Empty search and unsupported ticker states explain recovery. Search results are buttons; Enter opens an exact symbol and Escape dismisses search.
- A visible focus ring, skip link, labeled icon buttons, keyboard activation of existing rows, switch states, and current-navigation announcements support keyboard and assistive technology use.
- Route changes move focus to the heading. Escape closes the example alerts and restores focus. Refresh preserves the current hash route.
- Loading from an unavailable external Chart.js CDN must leave the rest of the detail screen operable. Live-data loading, retry, and stale-data handling remain backend work.

## Scope and validation

The app retains simulated prices, generated signals, example news, sample holdings, and existing local watchlist behavior. It does not gain real market APIs, LLM inference, brokerage integration, or server storage through this design change.

JavaScript syntax checks and render/appearance smoke checks are run locally. A local HTTP server could not bind under the execution sandbox, and the supplied Vercel preview requires login. Visual browser QA and a deployment check are therefore still required before production release.

References: [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography).
