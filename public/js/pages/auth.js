import { html, mount, $ } from '../lib/dom.js';
import { post } from '../lib/api.js';
import { session, loadSession } from '../lib/session.js';
import { setTitle, notice, toast } from '../lib/ui.js';

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export default async function authPage({ root, params, query, navigate }) {
  const mode = params.mode;
  if (!session.caps?.auth) {
    setTitle('Accounts unavailable');
    mount(root, html`<div class="page" style="max-width:480px">${notice('Accounts are unavailable on this server: the database or auth secret is not configured.', 'warn')}</div>`);
    return;
  }
  const next = safeNext(query.next);
  const titles = { signin: 'Sign in', signup: 'Create account', 'forgot-password': 'Reset your password', 'reset-password': 'Choose a new password' };
  setTitle(titles[mode]);
  const emailOn = !!session.caps.email;

  const fields = {
    signin: html`<div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required autofocus /></div>
      <div class="field"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required /></div>`,
    signup: html`<div class="field"><label for="name">Name</label><input class="input" id="name" name="name" autocomplete="name" required autofocus /></div>
      <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="pw-hint" /><span class="hint" id="pw-hint">At least 10 characters.</span></div>`,
    'forgot-password': html`<div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" required autofocus /></div>`,
    'reset-password': html`<div class="field"><label for="password">New password</label><input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required autofocus /><span class="hint">At least 10 characters.</span></div>`,
  }[mode];

  mount(root, html`<div class="page" style="max-width:440px"><div class="card" style="margin-top:4vh">
    <h1 style="margin-bottom:4px">${titles[mode]}</h1>
    <p class="small muted" style="margin-bottom:20px">${{ signin: 'Your watchlists, portfolios and alerts sync across devices.', signup: 'New accounts start empty — nothing is pre-filled.', 'forgot-password': 'We’ll email you a link that works for one hour.', 'reset-password': 'You’ll be signed out of other devices.' }[mode]}</p>
    ${mode === 'forgot-password' && !emailOn ? notice('Password reset needs email delivery, which is not configured on this server.', 'warn') : ''}
    ${mode === 'reset-password' && !query.token ? notice(query.error ? 'This reset link is invalid or has expired. Request a new one.' : 'Missing reset token. Use the link from your email.', 'err') : ''}
    <form class="stack" id="auth-form" novalidate>${fields}<div id="auth-msg" role="alert" class="small"></div>
      <button class="btn primary" type="submit" style="width:100%">${titles[mode]}</button></form>
    <div class="small" style="margin-top:16px;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      ${mode === 'signin' ? html`<a href="/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}" data-link>Create an account</a><a href="/forgot-password" data-link>Forgot password?</a>` : html`<a href="/signin" data-link>Back to sign in</a>`}
    </div></div></div>`);

  const form = $('#auth-form', root); const msg = $('#auth-msg', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'small neg'; msg.textContent = '';
    for (const input of form.querySelectorAll('input[required]')) {
      if (!input.checkValidity()) { input.setAttribute('aria-invalid', 'true'); msg.textContent = `${input.labels[0]?.textContent}: ${input.validationMessage}`; input.focus(); return; }
      input.removeAttribute('aria-invalid');
    }
    const btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    const v = (n) => form.elements[n]?.value;
    try {
      if (mode === 'signin') {
        await post('/api/auth/sign-in/email', { email: v('email'), password: v('password') });
        await loadSession(); toast('Signed in'); navigate(next);
      } else if (mode === 'signup') {
        await post('/api/auth/sign-up/email', { name: v('name'), email: v('email'), password: v('password'), callbackURL: '/?verified=1' });
        if (emailOn) { msg.className = 'small pos'; msg.textContent = `Check ${v('email')} for a verification link, then sign in.`; form.reset(); }
        else { await loadSession(); toast('Account created'); navigate(next); }
      } else if (mode === 'forgot-password') {
        await post('/api/auth/request-password-reset', { email: v('email'), redirectTo: '/reset-password' });
        msg.className = 'small pos'; msg.textContent = 'If an account exists for that email, a reset link is on its way.';
      } else if (mode === 'reset-password') {
        await post('/api/auth/reset-password', { newPassword: v('password'), token: query.token });
        toast('Password updated — sign in with your new password'); navigate('/signin');
      }
    } catch (err) {
      msg.textContent = err.status === 403 && mode === 'signin' ? 'Verify your email first — we sent you a link when you signed up.'
        : err.status === 401 ? 'Incorrect email or password.' : err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : err.message;
    } finally { btn.disabled = false; }
  });
}
