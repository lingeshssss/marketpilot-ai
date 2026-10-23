// Applies the saved theme before first paint (no flash). Per-device convenience only;
// the signed-in preference is synced from the server after load.
try {
  var t = localStorage.getItem('mp-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage unavailable */ }
