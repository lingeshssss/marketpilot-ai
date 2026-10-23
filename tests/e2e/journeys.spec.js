import { test, expect } from '@playwright/test';

const CRON = { Authorization: 'Bearer e2e-cron-secret-00001' };
let seeded = false;

test.beforeEach(async ({ request }) => {
  if (seeded) return;
  for (const job of ['market', 'scanner']) expect((await request.post(`/api/cron/${job}`, { headers: CRON })).ok()).toBeTruthy();
  seeded = true;
});

async function signUp(page, request, email) {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('E2E User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-very-long-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/Check .* for a verification link/)).toBeVisible();
  let link;
  await expect.poll(async () => {
    const mails = await (await request.get('/__dev/outbox')).json();
    link = mails.find((m) => m.to_address === email && m.kind === 'verify_email')?.body.match(/https?:\/\/\S+/)?.[0];
    return !!link;
  }).toBeTruthy();
  await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByText('Email verified')).toBeVisible();
}

test('direct routes, refresh, back/forward and market state', async ({ page }) => {
  await page.goto('/symbols/SPY?tab=analysis');
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'What the indicators say' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Analysis' })).toHaveAttribute('aria-selected', 'true');
  const rsiCard = await page.locator('table.data tr', { hasText: 'RSI (14)' }).locator('td.r').innerText();
  await expect(page.locator('.ev-item').first()).toContainText(rsiCard); // explanation agrees with the card
  await page.goto('/scanner');
  await expect(page.getByRole('heading', { name: 'Scanner', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/symbols\/SPY\?tab=analysis/);
  await page.goForward();
  await expect(page).toHaveURL(/\/scanner/);
  await page.goto('/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const chip = page.locator('#market-state');
  if (await chip.isVisible()) await expect(chip).toContainText(/Market|Pre-market|After hours/);
});

test('keyboard search finds an ETF and the same quote shows everywhere', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Search stocks and ETFs' }).fill('SPY');
  await expect(page.getByRole('option').first()).toContainText('SPY');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/symbols\/SPY$/);
  const price = (await page.locator('#sym-head .num').first().innerText()).trim();
  const change = (await page.locator('#sym-head .change').first().getAttribute('aria-label')).split(',')[0];
  await page.goto('/');
  const card = page.locator('#proxies a', { hasText: 'SPY' });
  await expect(card).toContainText(price);
  await expect(card.locator('.change')).toHaveAttribute('aria-label', new RegExp(change.replace(/[.()+]/g, '\\$&')));
  const tape = page.locator('.tape .sr-only');
  await expect(tape).toContainText(`SPY ${price}`);
  // rerender: values unchanged without new inputs
  await page.reload();
  await expect(page.locator('#proxies a', { hasText: 'SPY' })).toContainText(price);
});

test('account: sign up, watchlist with undo, portfolio totals reconcile, alert dialog focus', async ({ page, request, browserName }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  // A preference chosen while signed out must survive sign-up (not silently reset).
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await signUp(page, request, email);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

  // Watchlist
  await page.goto('/watchlists');
  await page.getByRole('button', { name: /Create your first list|New list/ }).first().click();
  await page.getByLabel('Name').fill('Tech');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Tech' })).toBeVisible();
  await page.getByRole('button', { name: 'Add symbols' }).first().click();
  await page.getByLabel('Symbols').fill('AAPL, MSFT AAPL\nSPY');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/Added 3/)).toBeVisible();
  await expect(page.locator('[data-item]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove MSFT' }).click();
  await expect(page.locator('[data-item]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-item]')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('[data-item]')).toHaveCount(3);
  await expect(page.locator('[data-item]').nth(1)).toContainText('MSFT');

  // Portfolio
  await page.goto('/portfolios');
  await page.getByRole('button', { name: 'New portfolio' }).first().click();
  await page.getByLabel('Name').fill('Brokerage');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Brokerage' })).toBeVisible();
  await page.getByRole('button', { name: /Transaction|Add transaction/ }).first().click();
  await page.getByLabel('Symbol').fill('AAPL');
  await page.getByLabel('Quantity').fill('2.5');
  await page.getByLabel('Price per share').fill('100');
  await page.getByLabel('Date').fill('2026-01-05');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Transaction added')).toBeVisible();
  const pageTotal = await page.locator('.metric', { hasText: 'Total value' }).locator('.metric-value').innerText();
  const pageDay = await page.locator('.metric', { hasText: 'Day P&L' }).locator('.metric-value').innerText();
  await page.goto('/');
  await expect(page.locator('#pf .metric', { hasText: 'Total value' }).locator('.metric-value')).toHaveText(pageTotal);
  await expect(page.locator('#pf .metric', { hasText: 'Day P&L' }).locator('.metric-value')).toHaveText(pageDay);
  await page.goto('/portfolios');
  await expect(page.locator('.metric', { hasText: 'Total value' }).locator('.metric-value')).toHaveText(pageTotal);

  // Alert dialog: focus moves in, Escape closes, focus returns
  await page.goto('/symbols/AAPL');
  const btn = page.getByRole('button', { name: 'Alert' });
  await btn.click();
  const dlg = page.getByRole('dialog', { name: 'New alert' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(btn).toBeFocused();
  await btn.click();
  await page.getByLabel('Threshold').fill('500');
  await page.getByRole('button', { name: 'Create alert' }).click();
  await expect(page.getByText('Alert created')).toBeVisible();
  await page.goto('/alerts');
  await expect(page.getByRole('link', { name: 'AAPL' })).toBeVisible();
});

test('no horizontal page overflow on any main route', async ({ page }) => {
  for (const r of ['/', '/symbols/AAPL', '/symbols/AAPL?tab=analysis', '/scanner', '/watchlists', '/portfolios', '/alerts', '/settings', '/signin']) {
    await page.goto(r);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), r).toBeLessThanOrEqual(0);
  }
});
