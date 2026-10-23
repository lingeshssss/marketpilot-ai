import { html, mount, $, on } from '../lib/dom.js';
import { get, post } from '../lib/api.js';
import { session, savePrefs, loadSession, applyTheme, setLocalPref, localPref } from '../lib/session.js';
import { setTitle, toast, openDialog, notice, confirmDialog } from '../lib/ui.js';

export default async function settingsPage({ root, navigate }) {
  setTitle('Settings');
  const caps = session.caps || {};
  const p = session.prefs || { theme: localPref('theme-choice', 'system'), ticker_motion: localPref('ticker-motion', true), default_chart: 'line', notify_inapp: true, notify_email: false };
  const md = caps.marketData || {};
  const seg = (name, options, value) => html`<div class="segmented" role="radiogroup" aria-label="${name}">${options.map(([v, l]) => html`<button type="button" role="radio" data-pref="${name}" data-value="${v}" aria-checked="${v === value}" aria-pressed="${v === value}">${l}</button>`)}</div>`;
  const row = (label, desc, control) => html`<div class="row" style="justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)"><div style="min-width:200px;flex:1"><div style="font-weight:560">${label}</div><div class="small muted">${desc}</div></div>${control}</div>`;
  const yes = (v, ok = 'Configured', no = 'Not configured') => html`<span class="chip ${v ? 'pos' : 'warn'}">${v ? ok : no}</span>`;

  mount(root, html`<div class="page" style="max-width:820px"><div class="page-head"><h1>Settings</h1></div><div class="stack">
    <section class="card" aria-labelledby="ap-h"><h2 id="ap-h">Appearance</h2>
      ${row('Theme', 'Follow the system, or choose light or dark.', seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], p.theme))}
      ${row('Default chart', 'Chart type used when opening a symbol.', seg('default_chart', [['line', 'Line'], ['candle', 'Candles']], p.default_chart))}
      ${row('Ticker motion', 'Scroll the ticker tape. Always static with Reduce Motion.', html`<label class="switch"><input type="checkbox" role="switch" data-switch="ticker_motion" ${p.ticker_motion ? 'checked' : ''} aria-label="Ticker motion" /></label>`)}
      ${!session.user ? html`<p class="xs subtle" style="margin-top:8px">Saved on this device. Sign in to sync preferences across devices.</p>` : ''}</section>

    ${session.user ? html`<section class="card" aria-labelledby="nt-h"><h2 id="nt-h">Notifications</h2>
      ${row('In-app alerts', 'Show triggered alerts in the Alerts page and badge.', html`<label class="switch"><input type="checkbox" role="switch" data-switch="notify_inapp" ${p.notify_inapp ? 'checked' : ''} aria-label="In-app alerts" /></label>`)}
      ${row('Email alerts', caps.email ? `Send to ${session.user.email} for rules that include email.` : 'Email delivery is not configured on this server.', html`<label class="switch"><input type="checkbox" role="switch" data-switch="notify_email" ${p.notify_email ? 'checked' : ''} ${caps.email ? '' : 'disabled'} aria-label="Email alerts" /></label>`)}
      ${caps.email ? html`<div class="row" style="padding-top:12px"><button class="btn" type="button" data-test-email>Send test email</button><span class="xs subtle">Marked [TEST]; sent only to your verified address.</span></div>` : ''}</section>` : ''}

    <section class="card" aria-labelledby="ds-h"><h2 id="ds-h" style="margin-bottom:8px">Data sources & services</h2>
      <dl class="kv">
        <div><dt>Market data</dt><dd>${md.provider === 'massive' ? 'Massive (formerly Polygon.io)' : md.demo ? 'Demo (synthetic)' : '—'} ${md.status === 'configured' ? '' : html`<span class="chip warn">${md.status}</span>`}</dd></div>
        <div><dt>Quote timeliness</dt><dd>${{ eod: 'End-of-day', delayed: '15-minute delayed', realtime: 'Real-time', demo: 'Synthetic' }[md.quoteTimeliness] || '—'}</dd></div>
        <div><dt>Plan</dt><dd>${md.plan || '—'}</dd></div>
        <div><dt>Financial statements</dt><dd>${yes(md.fundamentalsStatements, 'Included', 'Not in plan')}</dd></div>
        <div><dt>Accounts & storage</dt><dd>${yes(caps.auth)}</dd></div>
        <div><dt>Email delivery</dt><dd>${yes(caps.email)}</dd></div>
        <div><dt>AI explanations</dt><dd>${caps.ai ? caps.ai.model : yes(false)}</dd></div>
        <div><dt>Alert scheduler</dt><dd>${yes(caps.cron)}</dd></div>
      </dl>
      ${(caps.configIssues || []).length ? notice(html`<strong>Configuration problems:</strong> ${caps.configIssues.map((i) => `${i.variable} ${i.problem}`).join('; ')}. The related features are disabled until fixed.`, 'warn') : ''}
      <p class="small muted" style="margin-top:12px">Prices, indicators and scores are computed from provider data; nothing is randomly generated. When a source fails, MarketPilot shows the last known value labelled stale, or marks it unavailable. Technical scores are transparent heuristics, not probabilities, and nothing here is investment advice.</p></section>

    ${session.user ? html`<section class="card" aria-labelledby="ac-h"><h2 id="ac-h">Account</h2>
      ${row('Signed in as', session.user.email + (session.user.emailVerified ? ' · verified' : ' · not verified'), html`<button class="btn" type="button" data-signout>Sign out</button>`)}
      ${row('Export your data', 'Download watchlists, portfolios, transactions, alerts and AI history as JSON.', html`<a class="btn" href="/api/account/export" download>Download</a>`)}
      ${row('Sample data', 'Add a clearly labelled simulated portfolio and sample watchlist to explore. Never mixed with actual holdings.', html`<button class="btn" type="button" data-sample>Add sample data</button>`)}
      ${row('Delete account', 'Permanently deletes your account and all saved data.', html`<button class="btn danger" type="button" data-delete>Delete account…</button>`)}</section>`
    : caps.auth ? html`<section class="card">${notice(html`<a href="/signin" data-link>Sign in</a> or <a href="/signup" data-link>create an account</a> to save watchlists, portfolios and alerts.`)}</section>` : ''}
  </div></div>`);

  on(root, 'click', '[data-pref]', async (e, b) => {
    const key = b.dataset.pref; const value = b.dataset.value;
    for (const x of root.querySelectorAll(`[data-pref="${key}"]`)) { x.setAttribute('aria-checked', String(x === b)); x.setAttribute('aria-pressed', String(x === b)); }
    if (key === 'theme') { applyTheme(value); setLocalPref('theme-choice', value); }
    try { await savePrefs({ [key]: value }); } catch (err) { toast(err.message, { tone: 'error' }); }
  });
  on(root, 'change', '[data-switch]', async (e, el) => {
    const key = el.dataset.switch;
    if (key === 'ticker_motion') setLocalPref('ticker-motion', el.checked);
    try { await savePrefs({ [key]: el.checked }); toast('Saved'); if (key === 'ticker_motion') location.reload(); } catch (err) { el.checked = !el.checked; toast(err.message, { tone: 'error' }); }
  });
  on(root, 'click', '[data-test-email]', async (e, b) => {
    b.disabled = true;
    try { await post('/api/alerts/test-delivery'); toast('Test email sent'); } catch (err) { toast(err.message, { tone: 'error' }); } finally { b.disabled = false; }
  });
  on(root, 'click', '[data-sample]', async () => {
    if (!(await confirmDialog({ title: 'Add sample data?', message: 'Creates “Sample (simulated)” portfolio and “Sample: mega caps” watchlist. You can delete them any time.', confirm: 'Add' }))) return;
    try { await post('/api/account/sample-data'); toast('Sample data added'); } catch (err) { toast(err.message, { tone: 'error' }); }
  });
  on(root, 'click', '[data-delete]', () => {
    const dlg = openDialog({
      title: 'Delete account',
      body: html`<div class="stack"><p class="small">This permanently deletes your account, watchlists, portfolios, transactions, alerts and AI history. Consider <a href="/api/account/export" download>exporting your data</a> first.</p>
        <div class="field"><label for="del-pw">Confirm with your password</label><input class="input" type="password" id="del-pw" autocomplete="current-password" /></div><div id="del-err" class="small neg" role="alert"></div></div>`,
      footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn danger" type="button" data-ok>Delete permanently</button>`,
    });
    dlg.el.querySelector('[data-ok]').addEventListener('click', async () => {
      try { await post('/api/auth/delete-user', { password: dlg.el.querySelector('#del-pw').value }); dlg.close(); await loadSession(); toast('Account deleted'); navigate('/'); }
      catch (err) { dlg.el.querySelector('#del-err').textContent = err.status === 400 || err.status === 401 ? 'Incorrect password.' : err.message; }
    });
  });
}
