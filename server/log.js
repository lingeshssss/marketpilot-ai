// Structured JSON logging with redaction. Never log secrets, tokens,
// email addresses, passwords, or portfolio/transaction payloads.

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|session|email|quantity|price|amount|fees|notes?|transactions?|holdings|positions/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /(Bearer\s+)[A-Za-z0-9._\-]+/g;
const KEYLIKE = /\b(sk-[A-Za-z0-9_\-]{8,}|re_[A-Za-z0-9_]{8,})\b/g;

export function redact(value, depth = 0) {
  if (depth > 5) return '[depth]';
  if (typeof value === 'string') return value.replace(EMAIL, '[email]').replace(BEARER, '$1[redacted]').replace(KEYLIKE, '[key]');
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Error) return { name: value.name, message: redact(value.message), code: /** @type {any} */ (value).code };
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

function emit(level, msg, fields) {
  if (process.env.LOG_LEVEL === 'silent') return;
  if (level === 'debug' && process.env.LOG_LEVEL !== 'debug') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...redact(fields || {}) });
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const log = {
  debug: (m, f) => emit('debug', m, f),
  info: (m, f) => emit('info', m, f),
  warn: (m, f) => emit('warn', m, f),
  error: (m, f) => emit('error', m, f),
};
