// ============================================================
// Runtime configuration. Every external dependency is optional at boot;
// a missing credential turns the dependent feature into an explicit
// "unavailable" state — never a silent fallback to fabricated data.
// ============================================================

import { z } from 'zod';

const env = process.env;

// Runtime validation of environment variables. An invalid value disables the
// feature it belongs to and is reported by NAME only (values never leave the server).
const ENV_RULES = {
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  MARKET_DATA_PROVIDER: z.enum(['massive', 'demo']),
  MASSIVE_PLAN: z.enum(['basic', 'starter', 'developer', 'advanced', 'business']),
  MASSIVE_API_KEY: z.string().min(8, 'looks truncated'),
  MASSIVE_BASE_URL: z.string().url().startsWith('https://', 'must use https'),
  ANTHROPIC_API_KEY: z.string().min(20, 'looks truncated'),
  RESEND_API_KEY: z.string().min(10, 'looks truncated'),
  EMAIL_FROM: z.string().regex(/^(.+<)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/, 'must be an email address or "Name <email>"'),
  EMAIL_TRANSPORT: z.enum(['resend', 'outbox']),
  CRON_SECRET: z.string().min(16, 'must be at least 16 characters'),
  APP_URL: z.string().url(),
};

/** @returns {{ values: Record<string, string>, issues: { variable: string, problem: string }[] }} */
export function validateEnv(source = env) {
  /** @type {Record<string, string>} */ const values = {}; const issues = [];
  for (const [name, schema] of Object.entries(ENV_RULES)) {
    const raw = source[name];
    if (raw === undefined || raw === '') continue;
    const r = schema.safeParse(name === 'MARKET_DATA_PROVIDER' || name === 'MASSIVE_PLAN' || name === 'EMAIL_TRANSPORT' ? raw.toLowerCase() : raw);
    if (r.success) values[name] = r.data;
    else issues.push({ variable: name, problem: r.error.issues[0]?.message || 'invalid value' });
  }
  return { values, issues };
}
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

const MASSIVE_PLANS = {
  basic: { quotes: 'eod', snapshot: false, statements: false, historyYears: 2, rateLimitPerMin: 5 },
  starter: { quotes: 'delayed', snapshot: true, statements: false, historyYears: 5, rateLimitPerMin: 600 },
  developer: { quotes: 'delayed', snapshot: true, statements: false, historyYears: 10, rateLimitPerMin: 600 },
  advanced: { quotes: 'realtime', snapshot: true, statements: true, historyYears: 20, rateLimitPerMin: 600 },
  business: { quotes: 'realtime', snapshot: true, statements: true, historyYears: 20, rateLimitPerMin: 600 },
};

export function loadConfig() {
  const { values: v, issues } = validateEnv(env);
  const isProduction = env.VERCEL_ENV === 'production' || (env.NODE_ENV === 'production' && !env.VERCEL_ENV);
  const deployEnv = env.VERCEL_ENV || env.NODE_ENV || 'development';
  const appUrl = (env.APP_URL || env.BETTER_AUTH_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:3000')).replace(/\/$/, '');

  const providerName = v.MARKET_DATA_PROVIDER || '';
  const plan = v.MASSIVE_PLAN || 'basic';
  const planCaps = MASSIVE_PLANS[plan] || MASSIVE_PLANS.basic;

  const emailTransport = v.EMAIL_TRANSPORT || (v.RESEND_API_KEY ? 'resend' : '');

  return {
    configIssues: issues,
    isProduction,
    deployEnv,
    appUrl,
    trustedOrigins: [...new Set([
      appUrl,
      ...[env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((h) => `https://${h}`),
      ...(env.TRUSTED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    ])],
    database: {
      url: v.DATABASE_URL || '',
      poolMax: int(env.DATABASE_POOL_MAX, 3),
      ssl: env.DATABASE_SSL ? bool(env.DATABASE_SSL) : /sslmode=require|neon\.tech|supabase/.test(env.DATABASE_URL || ''),
    },
    auth: {
      secret: v.BETTER_AUTH_SECRET || '',
    },
    market: {
      // 'massive' | 'demo' | '' (unconfigured => unavailable)
      provider: providerName,
      massive: {
        apiKey: v.MASSIVE_API_KEY || env.POLYGON_API_KEY || '',
        baseUrl: (v.MASSIVE_BASE_URL || 'https://api.massive.com').replace(/\/$/, ''),
        plan: MASSIVE_PLANS[plan] ? plan : 'basic',
        caps: planCaps,
        rateLimitPerMin: int(env.MASSIVE_RATE_LIMIT_PER_MIN, planCaps.rateLimitPerMin),
        timeoutMs: int(env.MASSIVE_TIMEOUT_MS, 8000),
      },
      demoAllowedInProduction: bool(env.ALLOW_DEMO_DATA_IN_PRODUCTION, false),
    },
    ai: {
      apiKey: v.ANTHROPIC_API_KEY || '',
      model: env.AI_MODEL || 'claude-opus-5-5',
      effort: env.AI_EFFORT || 'medium',
      maxTokens: int(env.AI_MAX_TOKENS, 8000),
      perUserDaily: int(env.AI_DAILY_LIMIT_PER_USER, 20),
      globalDaily: int(env.AI_DAILY_LIMIT_GLOBAL, 300),
      fallbacks: (env.AI_FALLBACKS || 'default').toLowerCase(),
      timeoutMs: int(env.AI_TIMEOUT_MS, 120000),
    },
    email: {
      transport: emailTransport, // 'resend' | 'outbox' | ''
      resendApiKey: v.RESEND_API_KEY || '',
      from: v.EMAIL_FROM || '',
    },
    cron: { secret: v.CRON_SECRET || '' },
    limits: {
      apiPerMinute: int(env.API_RATE_LIMIT_PER_MIN, 300),
      alertRulesPerUser: int(env.MAX_ALERT_RULES_PER_USER, 50),
      watchlistsPerUser: int(env.MAX_WATCHLISTS_PER_USER, 20),
      itemsPerWatchlist: int(env.MAX_ITEMS_PER_WATCHLIST, 200),
      portfoliosPerUser: int(env.MAX_PORTFOLIOS_PER_USER, 20),
      transactionsPerPortfolio: int(env.MAX_TRANSACTIONS_PER_PORTFOLIO, 10000),
    },
  };
}

export let config = loadConfig();
export function reloadConfig() { config = loadConfig(); return config; }

/** Public, secret-free capability summary consumed by the UI. */
export function capabilities(cfg = config) {
  const m = cfg.market;
  const marketConfigured = m.provider === 'massive' ? !!m.massive.apiKey : m.provider === 'demo';
  const demoBlocked = m.provider === 'demo' && cfg.isProduction && !m.demoAllowedInProduction;
  const emailOk = (cfg.email.transport === 'resend' && !!cfg.email.resendApiKey && !!cfg.email.from)
    || (cfg.email.transport === 'outbox' && !cfg.isProduction);
  return {
    environment: cfg.deployEnv,
    marketData: {
      provider: marketConfigured && !demoBlocked ? m.provider : null,
      status: !m.provider ? 'unconfigured' : demoBlocked ? 'demo_blocked_in_production' : marketConfigured ? 'configured' : 'missing_credentials',
      demo: m.provider === 'demo' && !demoBlocked,
      plan: m.provider === 'massive' ? m.massive.plan : null,
      quoteTimeliness: m.provider === 'massive' ? m.massive.caps.quotes : m.provider === 'demo' ? 'demo' : null,
      fundamentalsStatements: m.provider === 'massive' && m.massive.caps.statements,
      intraday: m.provider === 'massive' || m.provider === 'demo',
    },
    database: !!cfg.database.url,
    auth: !!cfg.database.url && !!cfg.auth.secret,
    email: emailOk ? cfg.email.transport : null,
    ai: !!cfg.ai.apiKey && !!cfg.database.url ? { model: cfg.ai.model } : null,
    cron: !!cfg.cron.secret,
    // Names of misconfigured variables only — never their values.
    configIssues: (cfg.configIssues || []).map((i) => ({ variable: i.variable, problem: i.problem })),
  };
}
