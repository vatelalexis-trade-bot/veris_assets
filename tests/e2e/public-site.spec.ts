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

test('illustrative projects: filtered by status, each labelled, none to invest in', async ({
  page,
}) => {
  await page.goto('/en');
  const projects = page.locator('#projects');
  await expect(
    projects.getByText('Fictitious projects, shown to illustrate the software.'),
  ).toBeVisible();
  const cards = projects.getByRole('tabpanel').getByRole('article');
  await expect(cards).toHaveCount(9);

  await projects.getByRole('tab', { name: 'Upcoming (3)' }).click();
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.getByText('Illustrative example')).toBeVisible();
    await expect(card.getByText(/Illustrative target yield, not guaranteed/)).toBeVisible();
  }
  // The keyboard moves between the filters too.
  await page.keyboard.press('ArrowRight');
  await expect(projects.getByRole('tab', { name: 'Closed (3)' })).toBeFocused();
  await expect(
    projects.getByRole('tabpanel').getByRole('heading', { name: 'Rhône Storage Hub' }),
  ).toBeVisible();
  // Only the demo and the team as ways forward: no way to invest from the public site.
  await expect(page.getByRole('link', { name: /invest now|investir/i })).toHaveCount(0);
});
