import { sendJson, readBody } from '../http.js';
import { AppError } from '../errors.js';
import { query, many, hasDatabase } from '../db.js';
import { config, capabilities } from '../config.js';
import { getAnalysis, getNews, toAppError } from '../market/service.js';
import { analyze } from '../ai/analyst.js';
import { runJob } from '../jobs/runner.js';
import { marketJob } from '../jobs/market.js';
import { scannerJob } from '../jobs/scanner.js';
import { alertsJob, deliveriesJob } from '../jobs/alerts.js';
import { lastCompletedSession } from '../../public/shared/calendar.js';
import { timingSafeEqual } from 'node:crypto';

const JOBS = {
  market: (o) => runJob('market', marketJob, o),
  scanner: (o) => runJob('scanner', scannerJob, o),
  alerts: (o) => runJob('alerts', alertsJob, o),
  deliveries: (o) => runJob('deliveries', deliveriesJob, o),
};

function cronAuthorized(req) {
  const secret = config.cron.secret;
  if (!secret) return false;
  const got = String(req.headers.authorization || '');
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export function registerSystemRoutes(r) {
  r.get('/api/config', async ({ res }) => sendJson(res, 200, { capabilities: capabilities() }), { public: true });

  r.get('/api/health', async ({ res }) => {
    const caps = capabilities();
    const out = { ok: true, time: new Date().toISOString(), capabilities: caps, jobs: null, data: null };
    if (hasDatabase()) {
      try {
        out.jobs = await many(`select distinct on (job) job, status, started_at, finished_at, error, stats from job_runs order by job, started_at desc`);
        const failures = await many(`select job, count(*)::int n from job_runs where status='failed' and started_at > now() - interval '24 hours' group by job`);
        const latest = (await query('select max(date) d from grouped_days')).rows[0].d;
        const pendingEmail = (await query(`select count(*)::int n from deliveries where status='pending'`)).rows[0].n;
        const failedEmail = (await query(`select count(*)::int n from deliveries where status='failed' and created_at > now() - interval '7 days'`)).rows[0].n;
        const expected = lastCompletedSession(new Date());
        out.data = { latestStoredSession: latest, expectedSession: expected, fresh: latest === expected, jobFailures24h: failures, pendingDeliveries: pendingEmail, failedDeliveries7d: failedEmail };
      } catch (e) { out.ok = false; out.dbError = 'Database query failed'; }
    }
    sendJson(res, out.ok ? 200 : 503, out);
  }, { public: true });

  // Scheduled jobs: Vercel Cron (GET) or external scheduler (POST), bearer CRON_SECRET.
  const cron = async ({ req, res, params, url }) => {
    if (!cronAuthorized(req)) throw new AppError(401, 'unauthorized', 'Invalid cron credentials');
    if (!hasDatabase()) throw new AppError(503, 'database_unavailable', 'Jobs need the database');
    const names = params.job === 'all' ? ['market', 'scanner', 'alerts', 'deliveries'] : [params.job];
    if (!names.every((n) => JOBS[n])) throw new AppError(404, 'not_found', 'Unknown job');
    const budget = Math.min(55_000, Number(url.searchParams.get('budgetMs')) || 50_000);
    const results = [];
    const start = Date.now();
    for (const n of names) results.push(await JOBS[n]({ trigger: req.method === 'GET' ? 'vercel-cron' : 'external', budgetMs: Math.max(5000, budget - (Date.now() - start)) }));
    sendJson(res, 200, { results });
  };
  r.get('/api/cron/:job', cron, { public: true, noOriginCheck: true });
  r.post('/api/cron/:job', cron, { public: true, noOriginCheck: true });

  // ---------- AI ----------
  r.post('/api/ai/analyze', async ({ req, res, user }) => {
    const b = await readBody(req);
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    let an; let news = null;
    try { an = await getAnalysis(b.symbol); } catch (e) { throw toAppError(e); }
    try { news = await getNews(an.symbol); } catch { news = { articles: [], error: 'News unavailable' }; }
    const result = await analyze({ userId: user.id, analysis: an, news, expectedCutoff: lastCompletedSession(new Date()), signal: ac.signal });
    sendJson(res, 200, result);
  });

  r.get('/api/ai/history', async ({ res, user, url }) => {
    const sym = url.searchParams.get('symbol');
    const rows = await many(`select id, symbol, timeframe, analysis_id, model, prompt_version, status, output, error, created_at from analysis_history
      where user_id=$1 and ($2::text is null or symbol=$2) order by created_at desc limit 30`, [user.id, sym ? sym.toUpperCase() : null]);
    sendJson(res, 200, { history: rows });
  });
}
