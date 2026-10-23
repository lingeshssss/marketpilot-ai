// Escaping template helpers. Every interpolated value is HTML-escaped unless
// wrapped with raw() — provider data (names, headlines) is never trusted.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));

function part(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return esc(v);
}

/** html`<p>${value}</p>` -> Raw (escaped interpolation, composable). */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Raw(out);
}

export function mount(el, content) {
  if (typeof el === 'string') el = document.querySelector(el);
  if (el) el.innerHTML = part(content);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Safe external link (http/https only) opened in a new tab. */
export function extLink(url, label, cls = '') {
  if (!/^https?:\/\//i.test(String(url || ''))) return html`<span class="${cls}">${label}</span>`;
  return html`<a class="${cls}" href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}<span class="sr-only"> (opens in a new tab)</span></a>`;
}

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  });
}
