// The online demonstration answers as in the Codespace (docs/DEPLOYMENT.md). Read-only: nothing
// is created, so the demo data stay as loaded.
import { expect, test } from '@playwright/test';
import { signIn } from '../e2e/helpers';

test('public site: logo, security headers and calculator', async ({ page }) => {
  const response = await page.goto('/fr');
  expect(response!.headers()['strict-transport-security']).toContain('max-age');
  expect(response!.headers()['content-security-policy']).toMatch(/'nonce-[^']+'/);
  await expect(page.getByRole('img', { name: 'Veris Assets' }).first()).toBeVisible();
  await page.getByLabel('Nombre d’investisseurs').fill('80');
  await expect(page.getByText('158 300 €').first()).toBeVisible();
});

test('issuer portal: dashboard of the demo organisation', async ({ page }) => {
  await signIn(page, 'northwind.admin1@example.com');
  await page.goto('/en/issuer/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/en/issuer/issuances');
  await expect(page.getByText('Northwind Green Notes').first()).toBeVisible();
});

test('investor portal: positions and the paid coupon', async ({ page }) => {
  await signIn(page, 'investor.a@example.com');
  await page.goto('/en/portal/portfolio');
  await expect(page.getByText('Northwind Green Notes').first()).toBeVisible();
  // The paid coupon: its detail gives the investor's own line.
  await page.goto('/en/portal/distributions');
  await page.getByRole('table').getByRole('link').first().click();
  await expect(page.getByText('€2,500.00').first()).toBeVisible();
});
