// Request entry point shared by the Vercel function and the local dev server.

import { toNodeHandler } from 'better-auth/node';
import { Router, sendJson, handleError, newRequestId, checkOrigin, rateLimit, clientIp, securityHeaders } from './http.js';
import { AppError } from './errors.js';
import { config } from './config.js';
import { getAuth, requireUser } from './auth.js';
import { registerMarketRoutes } from './routes/market.js';
import { registerUserRoutes } from './routes/user.js';
import { registerPortfolioRoutes } from './routes/portfolios.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerSystemRoutes } from './routes/system.js';

const router = new Router();
registerSystemRoutes(router);
registerMarketRoutes(router);
registerUserRoutes(router);
registerPortfolioRoutes(router);
registerAlertRoutes(router);

let authHandler = null;

export async function handle(req, res) {
  const reqId = newRequestId();
  res.setHeader('X-Request-Id', reqId);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return sendJson(res, 400, { error: { code: 'bad_url', message: 'Bad URL' } }); }
  // Vercel rewrite passes the original path in ?__path=
  const forwarded = url.searchParams.get('__path');
  if (forwarded !== null) {
    url.searchParams.delete('__path');
    url = new URL(`/api/${forwarded}${url.search}`, 'http://localhost');
    req.url = url.pathname + url.search;
  }
  try {
    if (url.pathname.startsWith('/api/auth/')) {
      checkOrigin(req);
      securityHeaders(res);
      res.setHeader('Cache-Control', 'no-store');
      if (!authHandler) authHandler = toNodeHandler(getAuth());
      return await authHandler(req, res);
    }
    const m = router.match(req.method, url.pathname);
    if (!m) throw new AppError(404, 'not_found', 'No such endpoint');
    if (m.methodNotAllowed) throw new AppError(405, 'method_not_allowed', 'Method not allowed');
    if (!m.route.opts.noOriginCheck) checkOrigin(req);
    const ctx = { req, res, url, params: m.params, reqId };
    if (!m.route.opts.public) {
      ctx.user = await requireUser(req);
      await rateLimit(`u:${ctx.user.id}`, config.limits.apiPerMinute);
    } else if (!url.pathname.startsWith('/api/cron/')) {
      await rateLimit(`ip:${clientIp(req)}`, config.limits.apiPerMinute);
    }
    await m.route.handler(ctx);
  } catch (e) {
    handleError(res, e, reqId);
  }
}
