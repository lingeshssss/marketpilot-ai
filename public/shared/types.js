// Shared data contracts (JSDoc typedefs, checked by `npm run typecheck`).
// No runtime code — import with `import './types.js'` is unnecessary; reference
// via `import('./types.js').Bar` in JSDoc.

/** @typedef {{ date: string, t?: number, o: number, h: number, l: number, c: number, v: number, vw?: number|null }} Bar */

/**
 * @typedef {Object} Quote
 * @property {string} symbol
 * @property {number|null} price
 * @property {number|null} prevClose
 * @property {number|null} change
 * @property {number|null} changePct
 * @property {string} [changeBasis]
 * @property {string|null} [sessionDate]
 * @property {'regular-close'|'pre'|'regular'|'post'} [session]
 * @property {string|null} [marketTime]      ISO time of the observation at the exchange
 * @property {string} retrievedAt            ISO time MarketPilot fetched it
 * @property {string} source                 provider id ('massive' | 'demo')
 * @property {'eod'|'delayed'|'realtime'|'demo'} [timeliness]
 * @property {'fresh'|'stale'|'unavailable'} status
 * @property {string|null} [reason]
 * @property {string|null} quoteId           stable identity: source:symbol:time:price
 */

/** @typedef {{ zeroVolumeBars?: number, missingSessions?: string[] }} DataQuality */

/**
 * @typedef {Object} Transaction
 * @property {string} [id]
 * @property {number} [seq]
 * @property {'buy'|'sell'|'dividend'|'deposit'|'withdrawal'|'split'|'fee'} type
 * @property {string|null} [symbol]
 * @property {string} date                   YYYY-MM-DD
 * @property {number|null} [quantity]
 * @property {number|null} [price]
 * @property {number|null} [fees]
 * @property {number|null} [amount]
 * @property {number|null} [splitFrom]
 * @property {number|null} [splitTo]
 */

/** @typedef {{ kind: string, threshold: number, cooldownMinutes?: number }} AlertRuleCore */
/** @typedef {{ lastKey?: string, lastSide?: 'trigger'|'clear', lastValue?: number, lastAsOf?: string, lastTriggeredAt?: string }} AlertState */
/** @typedef {{ key: string|null|undefined, value: number|null|undefined, fresh: boolean, asOf?: string|null }} Observation */

/** @typedef {{ signal?: AbortSignal, limit?: number }} CallOptions */

export {};
