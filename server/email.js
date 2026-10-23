// Email delivery. Production transport: Resend HTTP API.
// 'outbox' writes to a database table instead of sending — allowed only
// outside production, and used by automated tests so no real mail is sent.

import { config, capabilities } from './config.js';
import { query } from './db.js';
import { AppError } from './errors.js';
import { log } from './log.js';

export function emailAvailable() { return !!capabilities().email; }

export async function sendEmail({ to, subject, text, kind }) {
  const cfg = config.email;
  if (!emailAvailable()) throw new AppError(503, 'email_unavailable', 'Email delivery is not configured');
  if (cfg.transport === 'outbox') {
    // Dev/test sink. Written after the current tick so callers that still hold the
    // only local connection (e.g. inside an auth transaction) are not blocked.
    setTimeout(() => {
      query('insert into email_outbox(to_address, subject, body, kind) values ($1,$2,$3,$4)', [to, subject, text, kind])
        .catch((e) => log.error('outbox_write_failed', { error: e }));
    }, 0);
    return { id: 'outbox', transport: 'outbox' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new AppError(502, 'email_send_failed', `Email provider returned ${res.status}`), {
      retryable: res.status === 429 || res.status >= 500, providerBody: body.slice(0, 200),
    });
  }
  const data = await res.json().catch(() => ({}));
  return { id: data.id || null, transport: 'resend' };
}
