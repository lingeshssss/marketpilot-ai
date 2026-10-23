// Static release checks (no network):
//  1. every JS module parses (node --check)
//  2. no Math.random() in app code — values must come from data, not dice
//  3. the demo provider is only reachable through the explicit config switch
//  4. no secrets / private keys committed
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const roots = ['api', 'server', 'public/js', 'public/shared', 'scripts'];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(m?js)$/.test(f)) files.push(p); } };
roots.forEach(walk);
let failed = 0;
const fail = (m) => { failed++; console.error(`FAIL ${m}`); };

for (const f of files) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { fail(`syntax ${f}: ${e.stderr}`); } }
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (/Math\.random\s*\(/.test(src) && !['public/js/lib/ui.js' /* dialog element id */, 'server/market/massive.js' /* retry jitter */, 'scripts/check.js'].includes(f)) fail(`Math.random() in ${f}`);
  if (/createDemoProvider/.test(src) && !['server/market/demo.js', 'server/market/service.js', 'scripts/check.js'].includes(f)) fail(`demo provider referenced from ${f}`);
  if (/(sk-ant-[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(src)) fail(`possible secret in ${f}`);
}
const svc = readFileSync('server/market/service.js', 'utf8');
if (!/config\.market\.provider === 'massive'\s*\n?\s*\? createMassiveProvider/.test(svc)) fail('provider factory changed — verify demo is only selected explicitly');
console.log(failed ? `${failed} check(s) failed` : `checks passed (${files.length} files)`);
process.exit(failed ? 1 : 0);
