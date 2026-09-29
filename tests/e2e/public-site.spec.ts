// Public site (D-108): the roles section leads to the sign-in and to the technology page, which has
// its own address in each language (/en/technology, /fr/technologie).
import { expect, test } from '@playwright/test';

test('roles section: sign-in in the visitor’s language', async ({ page }) => {
  await page.goto('/fr');
  await page.locator('#roles').getByRole('link', { name: 'Se connecter à la démo' }).click();
  await expect(page).toHaveURL(/\/fr\/login$/);

  await page.goto('/en');
  await page.locator('#roles').getByRole('link', { name: 'Sign in to the demo' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
});

test('technology page: reached from the header and the roles section, one address per language', async ({
  page,
}) => {
  await page.goto('/fr');
  await page.getByRole('banner').getByRole('link', { name: 'Technologie' }).click();
  await expect(page).toHaveURL(/\/fr\/technologie$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('confiance au registre');
  const current = page.getByRole('banner').getByRole('link', { name: 'Technologie' });
  await expect(current).toHaveAttribute('aria-current', 'page');

  await page.goto('/en');
  await page
    .locator('#roles')
    .getByRole('link', { name: /How the platform is built/ })
    .click();
  await expect(page).toHaveURL(/\/en\/technology$/);
  await expect(page.getByRole('heading', { name: 'An append-only ledger' })).toBeVisible();

  // Each language is sent to its own address, as the language switcher keeps the path.
  await page.goto('/fr/technology');
  await expect(page).toHaveURL(/\/fr\/technologie$/);
  await page.goto('/en/technologie');
  await expect(page).toHaveURL(/\/en\/technology$/);

  // From the technology page, the sections of the menu are those of the home page.
  await page.getByRole('banner').getByRole('link', { name: 'Security' }).click();
  await expect(page).toHaveURL(/\/en#security$/);
});
