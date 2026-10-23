// System appearance with an explicit, device-local preference.
const media = window.matchMedia('(prefers-color-scheme: dark)');
export function getAppearance() {
  try { return localStorage.getItem('marketpilot-appearance') || 'system'; }
  catch { return 'system'; }
}
export function applyAppearance(preference = getAppearance()) {
  document.documentElement.dataset.theme = preference === 'system'
    ? (media.matches ? 'dark' : 'light') : preference;
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  window.dispatchEvent(new Event('appearancechange'));
}
export function setAppearance(preference) {
  if (!['system', 'light', 'dark'].includes(preference)) return;
  try { localStorage.setItem('marketpilot-appearance', preference); } catch { /* Session only. */ }
  applyAppearance(preference);
}
media.addEventListener('change', () => applyAppearance());
applyAppearance();
