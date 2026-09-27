// Emergency access of a Platform Administrator (SPEC §4.1, P16-6, D-103), in a real browser.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('emergency access: read-only, shown on every page, ended by the administrator', async ({
  page,
}) => {
  await signIn(page, 'platform.admin@example.com');
  await page.goto('/en/platform/break-glass');
  await page
    .getByLabel('Organisation')
    .selectOption({ label: 'Northwind Asset Management SAS (demo)' });
  await page.getByLabel('Reason').fill('Support ticket 42: coupon question (demo)');
  await page.getByRole('button', { name: 'Open the emergency access' }).click();

  await expect(page).toHaveURL(/\/en\/issuer\/dashboard$/);
  const banner = page.getByRole('alert').filter({ hasText: 'Emergency read-only access' });
  await expect(banner).toContainText('Northwind Asset Management SAS (demo)');
  // Read-only: the registry is visible, the menu has no entry that changes data.
  await page.goto('/en/issuer/registry');
  await expect(banner).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);

  await banner.getByRole('button', { name: 'End the access' }).click();
  await expect(page).toHaveURL(/\/en\/platform\/break-glass$/);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Emergency read-only access' }),
  ).toHaveCount(0);
});
