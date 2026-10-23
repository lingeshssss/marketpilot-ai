import { get, put, post, ApiError } from './api.js';

export const session = { user: null, prefs: null, caps: null, ready: false, unreadAlerts: 0 };
const listeners = new Set();
export const onSession = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(session));

export async function loadSession() {
  session.configError = null;
  for (let attempt = 0; attempt < 3 && !session.caps; attempt++) {
    try { session.caps = (await get('/api/config')).capabilities; } catch (e) {
      session.configError = e;
      await new Promise((r) => setTimeout(r, e.status === 429 ? 1500 * (attempt + 1) : 400));
    }
  }
  try {
    const me = await get('/api/me');
    session.user = me.user; session.prefs = me.preferences;
    if (me.user && !me.preferencesStored) {
      // First sign-in on an account: carry over choices made on this device instead of discarding them.
      const carried = { ...me.preferences, theme: localPref('theme-choice', me.preferences.theme), ticker_motion: localPref('ticker-motion', me.preferences.ticker_motion) };
      try { session.prefs = (await put('/api/me/preferences', carried)).preferences; } catch { /* keep server defaults */ }
    }
    if (me.user) { applyTheme(session.prefs.theme); refreshUnread(); }
  } catch (e) {
    if (!(e instanceof ApiError) || (e.status !== 401 && e.status !== 503)) console.warn('session', e);
    session.user = null; session.prefs = null;
  }
  session.ready = true;
  emit();
  return session;
}

export async function refreshUnread() {
  if (!session.user) { session.unreadAlerts = 0; return; }
  try { session.unreadAlerts = (await get('/api/alerts/events')).unread; emit(); } catch { /* non-critical */ }
}

export async function signOut() {
  await post('/api/auth/sign-out', {});
  session.user = null; session.prefs = null; session.unreadAlerts = 0;
  emit();
}

export async function savePrefs(patch) {
  const next = { ...(session.prefs || {}), ...patch };
  if (session.user) {
    const r = await put('/api/me/preferences', next);
    session.prefs = r.preferences;
  } else {
    session.prefs = next;
  }
  if (patch.theme) applyTheme(patch.theme);
  emit();
  return session.prefs;
}

export function localPref(key, fallback) {
  try { const v = localStorage.getItem(`mp-${key}`); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setLocalPref(key, value) { try { localStorage.setItem(`mp-${key}`, JSON.stringify(value)); } catch { /* ignore */ } }

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
  try { localStorage.setItem('mp-theme', theme === 'light' || theme === 'dark' ? theme : 'system'); } catch { /* ignore */ }
}

export function tickerMotion() {
  if (session.prefs) return session.prefs.ticker_motion !== false;
  return localPref('ticker-motion', true);
}
