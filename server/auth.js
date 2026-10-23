// Authentication via Better Auth (email + password, database sessions).
// Sessions are opaque tokens in HttpOnly cookies and validated server-side
// against the `session` table on every private request.

import { betterAuth } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { config, capabilities } from './config.js';
import { getPool } from './db.js';
import { sendEmail, emailAvailable } from './email.js';
import { AppError, unauthorized } from './errors.js';
import { log } from './log.js';

let instance = null;

export function authAvailable() { return capabilities().auth; }

export function getAuth() {
  if (!authAvailable()) throw new AppError(503, 'auth_unavailable', 'Accounts are unavailable: the database or auth secret is not configured.');
  if (instance) return instance;
  const mail = emailAvailable();
  instance = betterAuth({
    appName: 'MarketPilot',
    baseURL: config.appUrl,
    basePath: '/api/auth',
    secret: config.auth.secret,
    database: getPool(),
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // Verification is enforced whenever an email transport exists.
      requireEmailVerification: mail,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: mail ? async ({ user, url }) => {
        await sendEmail({ to: user.email, kind: 'password_reset', subject: 'Reset your MarketPilot password',
          text: `Use this link within 1 hour to reset your password:\n\n${url}\n\nIf you did not request this, you can ignore this email.` });
      } : undefined,
    },
    emailVerification: mail ? {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 86400,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, kind: 'verify_email', subject: 'Verify your MarketPilot email',
          text: `Confirm your email address:\n\n${url}\n\nThis link expires in 24 hours.` });
      },
    } : undefined,
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    user: { deleteUser: { enabled: true } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 300, max: 5 },
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: config.appUrl.startsWith('https://'),
      ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    },
    logger: { disabled: false, level: 'error', log: (level, message) => log.error('auth', { level, message }) },
  });
  return instance;
}

export function resetAuthInstance() { instance = null; }

/** Returns { user, session } or null. Never trusts client-provided ids. */
export async function getSession(req) {
  if (!authAvailable()) return null;
  const res = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
  return res && res.user ? res : null;
}

export async function requireUser(req) {
  const s = await getSession(req);
  if (!s) throw unauthorized();
  return s.user;
}
