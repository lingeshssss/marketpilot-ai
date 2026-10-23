// E2E journeys run against the local dev server in DEMO mode (synthetic market
// data, embedded Postgres, email captured in a dev-only outbox). They verify UI
// workflows, not provider integration.
import { defineConfig, devices } from '@playwright/test';

const PORT = 3199;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `node scripts/dev.js --demo --ephemeral`,
    env: { PORT: String(PORT), CRON_SECRET: 'e2e-cron-secret-00001', LOG_LEVEL: 'silent', API_RATE_LIMIT_PER_MIN: '100000' },
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
