// Minimal HTTP router for Node (Vercel functions & local dev share it).

import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { log } from './log.js';
import { config } from './config.js';
import { query, hasDatabase } from './db.js';

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

export function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  securityHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', headers['Cache-Control'] || 'no-store');
  for (const [k, v] of Object.entries(headers)) if (k !== 'Cache-Control') res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readBody(req, limit = 1_000_000) {
  if (req.body !== undefined && typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new AppError(413, 'payload_too_large', 'Request body too large');
    chunks.push(c);
  }
  if (!size) return {};
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('application/json')) throw new AppError(415, 'unsupported_media_type', 'Expected application/json');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(400, 'invalid_json', 'Malformed JSON body'); }
}

/** Blocks cross-site state-changing requests (defence in depth beyond SameSite cookies). */
export function checkOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return; // non-browser clients (cron, curl) carry no cookies cross-site
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let ok = config.trustedOrigins.includes(origin);
  try { if (new URL(origin).host === host) ok = true; } catch { /* ignore */ }
  if (!ok) throw new AppError(403, 'bad_origin', 'Cross-origin request rejected');
}

const memBuckets = new Map();
/** Fixed-window rate limiter; DB-backed when available so it holds across instances. */
export async function rateLimit(key, limit, windowSec = 60) {
  const now = Date.now();
  const start = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
  let count;
  if (hasDatabase()) {
    try {
      const r = await query(`insert into api_rate_limits(key, window_start, count) values ($1, to_timestamp($2/1000.0), 1)
        on conflict (key, window_start) do update set count = api_rate_limits.count + 1 returning count`, [key, start]);
      count = r.rows[0].count;
    } catch { count = undefined; }
  }
  if (count === undefined) {
    const k = `${key}|${start}`;
    count = (memBuckets.get(k) || 0) + 1;
    memBuckets.set(k, count);
    if (memBuckets.size > 5000) memBuckets.clear();
  }
  if (count > limit) {
    const retry = Math.ceil((start + windowSec * 1000 - now) / 1000);
    throw new AppError(429, 'rate_limited', 'Too many requests. Please slow down.', { retryAfter: retry });
  }
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  patch(p, h, o) { this.add('PATCH', p, h, o); }
  delete(p, h, o) { this.add('DELETE', p, h, o); }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = pathname.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

export function handleError(res, err, reqId) {
  if (err instanceof AppError) {
    const headers = err.details?.retryAfter ? { 'Retry-After': String(err.details.retryAfter) } : {};
    if (err.status >= 500) log.warn('request_failed', { reqId, code: err.code, message: err.message });
    return sendJson(res, err.status, { error: { code: err.code, message: err.message, details: err.details } }, headers);
  }
  log.error('unhandled_error', { reqId, error: err });
  return sendJson(res, 500, { error: { code: 'internal', message: 'Something went wrong. The error has been logged.', requestId: reqId } });
}

export function newRequestId() { return randomUUID(); }
