// Ticker tape: renders stored quotes (same objects as every other screen).
// Motion is optional, pauses on hover/focus, has a visible pause control,
// and is static under prefers-reduced-motion.

import { html, mount, raw } from '../lib/dom.js';
import { I } from '../lib/icons.js';
import { fmtPrice, fmtPct, direction } from '/shared/format.js';
import * as store from '../lib/store.js';

const SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM'];

export function mountTape(root, { motion, setMotion, available }) {
  let moving = motion();
  const draw = () => {
    if (!available()) { mount(root, ''); return; }
    const items = SYMBOLS.map((s) => store.quote(s)).filter((q) => q && q.status !== 'unavailable');
    if (!items.length) { mount(root, ''); return; }
    const one = items.map((q) => {
      const d = direction(q.changePct);
      return html`<a class="tape-item" href="/symbols/${q.symbol}" data-link tabindex="-1">
        <strong>${q.symbol}</strong><span class="num">${fmtPrice(q.price)}</span>
        <span class="change ${d === 'up' ? 'pos' : d === 'down' ? 'neg' : 'flat'}">${d === 'up' ? I.up : d === 'down' ? I.down : ''}${fmtPct(q.changePct)}</span></a>`;
    });
    const demo = items.some((q) => q.source === 'demo');
    const stale = items.some((q) => q.status === 'stale');
    mount(root, html`<section class="tape ${moving ? 'moving' : ''}" aria-label="Market ticker">
      <div class="tape-viewport"><div class="tape-track" aria-hidden="true">${one}${moving ? one : ''}</div></div>
      <span class="sr-only">${items.map((q) => `${q.symbol} ${fmtPrice(q.price)} ${fmtPct(q.changePct)}`).join(', ')}</span>
      ${demo ? html`<span class="chip warn xs" style="margin:0 4px">Demo</span>` : stale ? html`<span class="chip warn xs" style="margin:0 4px">Stale</span>` : ''}
      <button class="btn ghost sm icon tape-toggle" type="button" data-tape-toggle aria-pressed="${!moving}" aria-label="${moving ? 'Pause ticker motion' : 'Resume ticker motion'}">${moving ? I.pause : I.play}</button>
    </section>`);
    root.querySelector('[data-tape-toggle]').addEventListener('click', async () => { moving = !moving; draw(); await setMotion(moving).catch(() => {}); });
  };
  store.subscribe((changed) => { if (changed.some((s) => SYMBOLS.includes(s))) draw(); });
  if (available()) { store.pin(SYMBOLS); store.load(SYMBOLS).then(draw).catch(() => {}); }
  return { refresh: draw };
}
