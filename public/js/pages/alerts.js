import { html, mount, $, on } from '../lib/dom.js';
import { get, post, patch, del } from '../lib/api.js';
import { session, refreshUnread } from '../lib/session.js';
import { I } from '../lib/icons.js';
import { errorState, emptyState, notice, setTitle, loadingState, openDialog, toast, confirmDialog, fmtDateTime, fmtRelative } from '../lib/ui.js';
import { ALERT_KINDS, validateRule } from '/shared/alerts.js';
import { fmtPrice, fmtPct, fmtNumber } from '/shared/format.js';

let capsCache = null;

/** Create/edit dialog — used here and from the symbol page. */
export async function alertForm({ symbol = '', rule = null, onSaved }) {
  if (!capsCache) { try { capsCache = (await get('/api/alerts')).capabilities; } catch { capsCache = { email: false, liveTimeframe: false }; } }
  const r = rule || { symbol, kind: 'price_above', threshold: '', timeframe: '1D', channels: ['inapp'], cooldownMinutes: 1440, enabled: true };
  const dlg = openDialog({
    title: rule ? 'Edit alert' : 'New alert',
    body: html`<form class="stack" id="alert-form" novalidate>
      <div class="form-grid">
        <div class="field"><label for="al-sym">Symbol</label><input class="input" id="al-sym" name="symbol" value="${r.symbol}" autocapitalize="characters" maxlength="10" required /></div>
        <div class="field"><label for="al-kind">Condition</label><select class="input" id="al-kind" name="kind">${Object.entries(ALERT_KINDS).map(([k, v]) => html`<option value="${k}" ${k === r.kind ? 'selected' : ''}>${v.label}</option>`)}</select></div>
        <div class="field"><label for="al-th">Threshold</label><input class="input num" id="al-th" name="threshold" inputmode="decimal" value="${r.threshold}" required /><span class="hint" id="al-th-hint"></span></div>
        <div class="field"><label for="al-tf">Evaluated on</label><select class="input" id="al-tf" name="timeframe">
          <option value="1D" ${r.timeframe === '1D' ? 'selected' : ''}>Daily close (after the session)</option>
          <option value="live" ${r.timeframe === 'live' ? 'selected' : ''} ${capsCache.liveTimeframe ? '' : 'disabled'}>Intraday quotes${capsCache.liveTimeframe ? '' : ' (needs intraday data plan)'}</option></select></div>
        <div class="field"><label for="al-cd">Cooldown after trigger</label><select class="input" id="al-cd" name="cooldownMinutes">${[[0, 'None'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']].map(([v, l]) => html`<option value="${v}" ${Number(r.cooldownMinutes) === v ? 'selected' : ''}>${l}</option>`)}</select></div>
      </div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:560;margin-bottom:6px">Deliver to</legend>
        <label class="row small"><input type="checkbox" checked disabled /> In-app (always)</label>
        <label class="row small"><input type="checkbox" name="email" ${r.channels?.includes('email') ? 'checked' : ''} ${capsCache.email ? '' : 'disabled'} /> Email${capsCache.email ? '' : ' — not configured on this server'}</label></fieldset>
      <p class="xs subtle">Fires once when the value crosses the threshold (from the other side). The first check only records a baseline. Stale or missing data never fires an alert.</p>
      <div id="al-err" role="alert" class="small neg"></div></form>`,
    footer: html`<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-save>${rule ? 'Save' : 'Create alert'}</button>`,
  });
  const f = dlg.el.querySelector('form');
  const hint = () => { const k = ALERT_KINDS[f.kind.value]; $('#al-th-hint', dlg.el).textContent = k.metric === 'price' ? 'Price in USD' : k.metric === 'rsi14' ? 'RSI level, 1–99 (daily bars only)' : 'Percent, e.g. 3 or -3'; };
  f.kind.addEventListener('change', hint); hint();
  const save = async () => {
    const body = { symbol: f.symbol.value.trim().toUpperCase(), kind: f.kind.value, threshold: Number(f.threshold.value.replace(/[$,%]/g, '')), timeframe: f.timeframe.value, cooldownMinutes: Number(f.cooldownMinutes.value), channels: ['inapp', ...(f.email.checked ? ['email'] : [])] };
    const errs = validateRule(body);
    if (errs.length) { $('#al-err', dlg.el).textContent = errs.join(' · '); return; }
    try {
      const out = rule ? await patch(`/api/alerts/${rule.id}`, body) : await post('/api/alerts', body);
      dlg.close(); onSaved?.(out.rule);
    } catch (e) { $('#al-err', dlg.el).textContent = e.message; }
  };
  dlg.el.querySelector('[data-save]').addEventListener('click', save);
  f.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function obsText(rule) {
  const o = rule.lastObservation;
  if (!o) return 'No observation yet';
  const k = ALERT_KINDS[rule.kind];
  const v = k.metric === 'price' ? fmtPrice(o.value) : k.metric === 'changePct' ? fmtPct(o.value) : fmtNumber(o.value, 1);
  return `Last ${v} (${o.side === 'trigger' ? 'beyond' : 'not beyond'} threshold) · data ${fmtDateTime(o.asOf)}`;
}

export default async function alertsPage({ root, signal, navigate }) {
  setTitle('Alerts');
  if (!session.user) {
    mount(root, html`<div class="page"><div class="page-head"><h1>Alerts</h1></div>${emptyState('Sign in to create alerts', 'Alerts are evaluated on the server on a schedule, so they work with this page closed.', session.caps?.auth ? html`<a class="btn primary" href="/signin?next=/alerts" data-link>Sign in</a>` : '')}</div>`);
    return;
  }
  mount(root, html`<div class="page"><div class="page-head"><div><h1>Alerts</h1><p class="muted small">Price, daily-change and RSI conditions, checked on the server.</p></div>
    <button class="btn primary" type="button" data-new>${I.plus} New alert</button></div>
    <div class="stack" id="al-body">${loadingState()}</div></div>`);

  const load = async () => {
    const body = $('#al-body', root);
    try {
      const [{ rules, capabilities: caps }, ev] = await Promise.all([get('/api/alerts', { signal }), get('/api/alerts/events', { signal })]);
      capsCache = caps;
      mount(body, html`
        ${caps.evaluation !== 'scheduled' ? notice('The background scheduler is not configured on this server (CRON_SECRET), so rules are saved but not evaluated yet.', 'warn') : ''}
        <section class="card flush" aria-labelledby="rules-h"><div class="card-head pad"><h2 id="rules-h">Rules</h2><span class="xs subtle">${rules.length} rule${rules.length === 1 ? '' : 's'}</span></div>
          ${rules.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Rule</th><th scope="col">Status</th><th scope="col">Delivery</th><th scope="col">Last check</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>
            ${rules.map((r) => html`<tr><td><a class="sym" href="/symbols/${r.symbol}" data-link>${r.symbol}</a> <span class="small">${ALERT_KINDS[r.kind]?.label} ${ALERT_KINDS[r.kind]?.unit === '$' ? fmtPrice(r.threshold) : ALERT_KINDS[r.kind]?.unit === '%' ? `${r.threshold}%` : r.threshold}</span><div class="xs subtle">${r.timeframe === '1D' ? 'Daily close' : 'Intraday'} · cooldown ${r.cooldownMinutes ? `${r.cooldownMinutes / 60}h` : 'none'}</div></td>
              <td><label class="switch" title="${r.enabled ? 'Enabled' : 'Paused'}"><input type="checkbox" role="switch" data-toggle="${r.id}" ${r.enabled ? 'checked' : ''} aria-label="${r.enabled ? 'Pause' : 'Enable'} ${r.description}" /></label></td>
              <td class="small">${r.channels.join(', ')}</td>
              <td class="xs muted">${r.lastEvaluatedAt ? fmtRelative(r.lastEvaluatedAt) : 'Not yet'}<div>${obsText(r)}</div>${r.lastTriggeredAt ? html`<div>Triggered ${fmtRelative(r.lastTriggeredAt)}</div>` : ''}</td>
              <td class="r"><div class="row tight" style="justify-content:flex-end"><button class="btn sm icon ghost" type="button" data-edit="${r.id}" aria-label="Edit ${r.description}">${I.edit}</button><button class="btn sm icon ghost" type="button" data-del="${r.id}" aria-label="Delete ${r.description}">${I.trash}</button></div></td></tr>`)}
          </tbody></table></div>` : emptyState('No alert rules', 'Create a rule from here or from any symbol page.', html`<button class="btn" type="button" data-new>${I.plus} New alert</button>`)}</section>
        <section class="card flush" aria-labelledby="hist-h"><div class="card-head pad"><h2 id="hist-h">History</h2>${ev.unread ? html`<button class="btn sm" type="button" data-read>Mark ${ev.unread} as read</button>` : ''}</div>
          ${ev.events.length ? html`<div class="list" style="padding:0 12px 8px">${ev.events.map((e) => html`<div class="list-row" style="align-items:flex-start"><div style="min-width:0">
            <div class="small" style="font-weight:${e.read_at ? 400 : 650}">${e.message}</div>
            <div class="xs subtle">Triggered ${fmtDateTime(e.created_at)} · data as of ${fmtDateTime(e.data_as_of)}</div>
            <div class="row tight" style="margin-top:4px">${e.deliveries.map((d) => html`<span class="chip ${d.status === 'sent' ? 'pos' : d.status === 'failed' ? 'neg' : d.status === 'pending' ? 'info' : ''}" title="${d.error || ''}">${d.channel}: ${d.status}${d.attempts > 1 ? ` (${d.attempts} tries)` : ''}</span>`)}</div></div></div>`)}</div>`
          : emptyState('Nothing triggered yet', 'Triggered alerts and their delivery status appear here.')}</section>`);
    } catch (e) { if (e.name !== 'AbortError') mount(body, errorState(e)); }
  };

  on(root, 'click', '[data-new]', () => alertForm({ onSaved: () => { toast('Alert created'); load(); } }));
  on(root, 'click', '[data-edit]', async (e, b) => { const { rules } = await get('/api/alerts'); const r = rules.find((x) => x.id === b.dataset.edit); if (r) alertForm({ rule: r, onSaved: () => { toast('Alert saved'); load(); } }); });
  on(root, 'click', '[data-del]', async (e, b) => { if (await confirmDialog({ title: 'Delete alert?', message: 'Its trigger history will also be removed.', confirm: 'Delete', danger: true })) { await del(`/api/alerts/${b.dataset.del}`); toast('Alert deleted'); load(); } });
  on(root, 'change', '[data-toggle]', async (e, el) => { try { await patch(`/api/alerts/${el.dataset.toggle}`, { enabled: el.checked }); toast(el.checked ? 'Alert enabled' : 'Alert paused'); } catch (err) { el.checked = !el.checked; toast(err.message, { tone: 'error' }); } });
  on(root, 'click', '[data-read]', async () => { await post('/api/alerts/events/read'); await refreshUnread(); load(); });
  on(root, 'click', '[data-retry]', load);
  await load();
}
