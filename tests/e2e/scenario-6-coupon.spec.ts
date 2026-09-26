// Scenario 6 of SPEC §29 — coupon, in a real browser (docs/BACKLOG.md P14-7).
// Given an ACTIVE issuance at 5 % semi-annual in 30E/360, nominal 1 000 €, and an investor
// holding 100 units at the record date (demo issuance "Northwind Green Notes": its first coupon
// was paid, its second is due), when the distribution is calculated, reviewed and approved, then the investor's
// line is exactly 2 500.00 €, the total equals the sum of the lines (rounding difference shown),
// the fictitious payment instruction and the CSV are generated, and a recalculation from the
// snapshot gives the same result.
// The holdings are dated in the past by the demo data: the scenario needs a fresh demo
// (`pnpm db:reset`) to be played again.
import { expect, test, type Page } from '@playwright/test';
import { call, signIn } from './helpers';

test('scenario 6 — coupon of 2 500.00 € on 100 units, four eyes, CSV', async ({ browser }) => {
  const pages: Record<string, Page> = {};
  for (const email of [
    'northwind.operator@example.com',
    'northwind.admin1@example.com',
    'northwind.admin2@example.com',
  ]) {
    pages[email] = await (await browser.newContext()).newPage();
    await signIn(pages[email], email);
  }
  const operator = pages['northwind.operator@example.com']!;
  const admin1 = pages['northwind.admin1@example.com']!;
  const admin2 = pages['northwind.admin2@example.com']!;

  const issuances = await call<{ data: { id: string; code: string }[] }>(
    operator,
    'GET',
    '/api/v1/issuances?pageSize=100',
  );
  const notes = issuances.data.find((row) => row.code === 'NWGN')!;
  const schedule = await call<{ status: string; distributionId: string | null }[]>(
    operator,
    'GET',
    `/api/v1/issuances/${notes.id}/coupon-schedule`,
  );
  expect(schedule[0]!.status, 'The first coupon is paid in the demo data.').toBe('DISTRIBUTED');
  expect(
    schedule[1]!.distributionId,
    'The second coupon was already distributed: reset the demo (pnpm db:reset).',
  ).toBeNull();

  // The operator creates and calculates the distribution of the coupon due.
  await operator.goto(`/en/issuer/issuances/${notes.id}`);
  await operator.getByRole('tab', { name: 'Coupons' }).click();
  await operator.getByRole('button', { name: 'Create the distribution' }).first().click();
  await expect(operator).toHaveURL(/\/issuer\/distributions\/[0-9a-f-]+$/);
  const distributionId = operator.url().split('/').at(-1)!;
  await operator.getByRole('button', { name: 'Calculate' }).click();
  await operator.getByRole('dialog').getByRole('button', { name: 'Calculate' }).click();
  await expect(operator.getByText('Calculated', { exact: true }).first()).toBeVisible();
  const alpine = operator.getByRole('row', { name: /Alpine Capital Partners/ });
  await expect(alpine.getByRole('cell', { name: '€2,500.00' })).toBeVisible();
  await expect(alpine.getByRole('cell', { name: '100', exact: true })).toBeVisible();

  // The total equals the sum of the lines; the rounding difference is shown.
  const lines = await call<{ grossAmount: string }[]>(
    operator,
    'GET',
    `/api/v1/distributions/${distributionId}/lines`,
  );
  const cents = lines.reduce(
    (sum, line) => sum + Number.parseInt(line.grossAmount.replace('.', ''), 10),
    0,
  );
  const distribution = await call<{ totalGrossAmount: string; roundingDifference: string }>(
    operator,
    'GET',
    `/api/v1/distributions/${distributionId}`,
  );
  expect(Number.parseInt(distribution.totalGrossAmount.replace('.', ''), 10)).toBe(cents);
  await expect(operator.getByText('Rounding difference')).toBeVisible();

  await operator.getByRole('button', { name: 'Submit for approval' }).click();
  await operator.getByRole('dialog').getByRole('button', { name: 'Submit for approval' }).click();
  await expect(operator.getByText('Under review', { exact: true }).first()).toBeVisible();
  await expect(operator.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  // Another administrator approves, and checks the calculation from the snapshot.
  await admin1.goto(`/en/issuer/distributions/${distributionId}`);
  await admin1.getByRole('button', { name: 'Approve' }).click();
  await admin1.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(admin1.getByText('Approved', { exact: true }).first()).toBeVisible();
  await admin1.getByRole('button', { name: 'Calculate again from the snapshot' }).click();
  await expect(admin1.getByText('Same result: the calculation is reproducible.')).toBeVisible();

  // The fictitious payment instruction and its CSV.
  await operator.reload();
  await operator.getByRole('button', { name: 'Generate the payment instruction' }).click();
  await operator
    .getByRole('dialog')
    .getByRole('button', { name: 'Generate the payment instruction' })
    .click();
  await expect(operator.getByRole('link', { name: 'Download the CSV' })).toBeVisible();
  const csv = await operator.request.get(
    `/api/v1/distributions/${distributionId}/payment-instruction/csv`,
  );
  const text = await csv.text();
  expect(text.split('\n')[0]).toBe(
    '# DEMONSTRATION - fictitious payment instruction - no real payment',
  );
  expect(text).toMatch(/Alpine Capital Partners SAS \(demo\),2500\.00,EUR/);

  // Prepared by the operator, confirmed by another administrator: paid.
  await operator.getByRole('button', { name: 'Prepare the payment' }).click();
  await operator.getByRole('dialog').getByRole('button', { name: 'Prepare the payment' }).click();
  await admin2.goto(`/en/issuer/distributions/${distributionId}`);
  await admin2.getByRole('button', { name: 'Confirm the payment' }).click();
  await admin2.getByRole('dialog').getByRole('button', { name: 'Confirm the payment' }).click();
  await expect(admin2.getByText('Paid', { exact: true }).first()).toBeVisible();

  for (const page of Object.values(pages)) await page.context().close();
});
