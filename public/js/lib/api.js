// Fetch wrapper: JSON, credentials, cancellation, typed errors.

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
  get offline() { return this.code === 'offline'; }
}

export async function api(path, { method = 'GET', body, signal, raw = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, signal, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, navigator.onLine === false ? 'offline' : 'network', navigator.onLine === false ? 'You appear to be offline.' : 'Could not reach the server.');
  }
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = data?.error || {};
    const msg = err.message || data?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, err.code || data?.code || 'error', msg, err.details);
  }
  return data;
}

export const get = (p, o) => api(p, o);
export const post = (p, body, o) => api(p, { ...o, method: 'POST', body: body ?? {} });
export const put = (p, body, o) => api(p, { ...o, method: 'PUT', body });
export const patch = (p, body, o) => api(p, { ...o, method: 'PATCH', body });
export const del = (p, o) => api(p, { ...o, method: 'DELETE' });

/**
 * Retries a request when the server reports the market-data budget is used up
 * (HTTP 429 with retryAfter). onWait(seconds) lets the UI show a countdown.
 * Bounded: at most 2 retries, each wait capped at 60s; aborts with the signal.
 */
export async function withBudgetRetry(fn, { onWait, signal, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      const wait = e instanceof ApiError && e.status === 429 ? Number(e.details?.retryAfter) : NaN;
      if (attempt >= retries || !Number.isFinite(wait) || wait > 60 || signal?.aborted) throw e;
      for (let left = Math.ceil(wait) + 1; left > 0; left--) {
        onWait?.(left);
        await new Promise((r, j) => { const t = setTimeout(r, 1000); signal?.addEventListener('abort', () => { clearTimeout(t); j(new DOMException('Aborted', 'AbortError')); }, { once: true }); });
      }
    }
  }
}
