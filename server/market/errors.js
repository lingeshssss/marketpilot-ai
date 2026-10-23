export class ProviderError extends Error {
  /** kind: rate_limited | unavailable | not_found | unauthorized | not_entitled | invalid_data | timeout | unconfigured */
  /** @param {string} kind @param {string} message @param {{ retryAfter?: number, status?: number }} [opts] */
  constructor(kind, message, { retryAfter = undefined, status = undefined } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.retryAfter = retryAfter;
    this.status = status;
  }
}
