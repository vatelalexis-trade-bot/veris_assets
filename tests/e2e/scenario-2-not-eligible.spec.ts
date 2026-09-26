// Scenario 2 of SPEC §29 — investor not eligible, in a real browser (docs/BACKLOG.md P11-6).
// Given an investor whose KYC/KYB has expired (Iris Asset Holdings, account investor.d), when it
// tries to subscribe to an issuance it is invited to, then the subscription is refused with a
// reason in plain language, nothing is submitted to the issuer, and the decision is kept.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('scenario 2 — an investor whose KYC/KYB has expired cannot subscribe', async ({ page }) => {
  await signIn(page, 'investor.d@example.com');

  // The opportunity is visible: the investor is invited to it.
  await page.goto('/en/portal/opportunities');
  await page.getByRole('link', { name: /Northwind Senior Debt 2026/ }).click();
  await expect(page.getByRole('heading', { name: 'Northwind Senior Debt 2026' })).toBeVisible();

  // The subscription form: units → amount, declarations.
  await page.getByLabel('Number of units').fill('120');
  await expect(page.getByText('€120,000.00')).toBeVisible();
  await page.getByLabel('I have read and accept the documents of the issuance.').check();
  await page
    .getByLabel('I declare that I meet the eligibility conditions of the issuance.')
    .check();
  await page.getByRole('button', { name: 'Submit the subscription' }).click();

  // Refused, with the reason in plain language.
  const refusal = page.getByRole('alert');
  await expect(refusal.getByText('Your subscription was not sent.')).toBeVisible();
  await expect(refusal.getByText('The KYC/KYB check has expired.')).toBeVisible();
  await expect(page).toHaveURL(/\/portal\/opportunities\/[0-9a-f-]+$/);

  // Nothing was submitted: the only subscription of the investor stays a draft.
  const own = await page.request.get('/api/v1/subscriptions?pageSize=100');
  const statuses = ((await own.json()) as { data: { status: string }[] }).data.map(
    (row) => row.status,
  );
  expect(statuses.length).toBeGreaterThan(0);
  expect(statuses.every((status) => status === 'DRAFT' || status === 'CANCELLED')).toBe(true);
});
