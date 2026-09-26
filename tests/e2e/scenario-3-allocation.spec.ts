// Scenario 3 of SPEC §29 — allocation, in a real browser (docs/BACKLOG.md P12-8).
// Given a closed issuance of 1 000 units with 1 200 units requested by approved subscriptions,
// when the issuer enters a manual allocation of 1 000 units in total and an administrator
// validates it, then the positions and ALLOCATION movements are created in one transaction, the
// positions add up to 1 000, and an allocation of 1 001 units is refused.
// The issuance and its subscriptions are prepared through the API, with a new code at each run:
// the scenario can be played again on the same database.
import { expect, test, type Page } from '@playwright/test';
import { call, closedIssuance, signIn } from './helpers';

test('scenario 3 — manual allocation of an oversubscribed issuance, four eyes', async ({
  browser,
}) => {
  const code = `ALLOC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const name = `Northwind Allocation Notes ${code}`;
  const pages: Record<string, Page> = {};
  for (const email of [
    'northwind.operator@example.com',
    'northwind.admin1@example.com',
    'northwind.admin2@example.com',
    'investor.a@example.com',
    'investor.b@example.com',
  ]) {
    pages[email] = await (await browser.newContext()).newPage();
    await signIn(pages[email], email);
  }
  const operator = pages['northwind.operator@example.com']!;
  const admin1 = pages['northwind.admin1@example.com']!;
  const admin2 = pages['northwind.admin2@example.com']!;

  // An issuance of 1 000 units, closed with 1 200 units requested and approved.
  const created = await closedIssuance(pages, {
    code,
    name,
    requests: [
      ['investor.a@example.com', 'Alpine', '700'],
      ['investor.b@example.com', 'Baltic', '500'],
    ],
  });

  // The operator prepares the allocation, prefilled with the requests.
  await operator.goto(`/en/issuer/issuances/${created.id}`);
  await operator.getByRole('tab', { name: 'Allocation' }).click();
  await operator.getByRole('button', { name: 'Prepare the allocation' }).click();
  await expect(operator.getByText('1200 of 1000')).toBeVisible();
  const alpineUnits = operator.getByLabel(/^Units allocated to Alpine/);
  const balticUnits = operator.getByLabel(/^Units allocated to Baltic/);

  // 1 001 units are refused.
  await alpineUnits.fill('600');
  await balticUnits.fill('401');
  await operator.getByRole('button', { name: 'Save' }).click();
  await expect(operator.getByText('(1001 units for 1000 available)')).toBeVisible();
  await operator.getByRole('button', { name: 'Propose for validation' }).click();
  await operator
    .getByRole('dialog')
    .getByRole('button', { name: 'Propose for validation' })
    .click();
  await operator.keyboard.press('Escape');
  await expect(
    operator.getByText('The allocation exceeds the total number of units.').first(),
  ).toBeVisible();

  // 1 000 units in total are proposed.
  await balticUnits.fill('400');
  await expect(operator.getByText('1000 of 1000')).toBeVisible();
  await operator.getByRole('button', { name: 'Save' }).click();
  await expect(operator.getByRole('button', { name: 'Save' })).toBeDisabled();
  await operator.getByRole('button', { name: 'Propose for validation' }).click();
  await operator
    .getByRole('dialog')
    .getByRole('button', { name: 'Propose for validation' })
    .click();
  await expect(operator.getByText('Proposed', { exact: true })).toBeVisible();
  await expect(operator.getByRole('button', { name: 'Validate the allocation' })).toHaveCount(0);

  // An administrator validates.
  await admin2.goto(`/en/issuer/issuances/${created.id}`);
  await admin2.getByRole('tab', { name: 'Allocation' }).click();
  await admin2.getByRole('button', { name: 'Validate the allocation' }).click();
  await admin2.getByRole('dialog').getByRole('button', { name: 'Validate the allocation' }).click();
  await expect(admin2.getByText('Validated', { exact: true })).toBeVisible();

  // The registry: 1 000 units held by the investors, blocked until payment, and the movements.
  await admin2.reload();
  await admin2.getByRole('tab', { name: 'Registry' }).click();
  await expect(admin2.getByText('1000 of 1000 units held by investors.')).toBeVisible();
  await expect(admin2.getByRole('cell', { name: 'Issuance of units' })).toBeVisible();
  await expect(admin2.getByRole('cell', { name: 'Allocation', exact: true })).toHaveCount(2);

  const positions = await call<{
    data: { accountType: string; quantityHeld: string; quantityBlocked: string }[];
  }>(admin2, 'GET', `/api/v1/positions?issuanceId=${created.id}`);
  const held = positions.data
    .filter((row) => row.accountType === 'INVESTOR')
    .map((row) => row.quantityHeld)
    .sort();
  expect(held).toEqual(['400', '600']);
  const ledger = await call<{ data: { type: string }[] }>(
    admin2,
    'GET',
    `/api/v1/ledger?issuanceId=${created.id}`,
  );
  expect(ledger.data.map((row) => row.type).sort()).toEqual([
    'ALLOCATION',
    'ALLOCATION',
    'BLOCK',
    'BLOCK',
    'ISSUANCE',
  ]);

  for (const page of Object.values(pages)) await page.context().close();
});
