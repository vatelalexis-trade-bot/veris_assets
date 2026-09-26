// Scenario 3 of SPEC §29 — allocation, in a real browser (docs/BACKLOG.md P12-8).
// Given a closed issuance of 1 000 units with 1 200 units requested by approved subscriptions,
// when the issuer enters a manual allocation of 1 000 units in total and an administrator
// validates it, then the positions and ALLOCATION movements are created in one transaction, the
// positions add up to 1 000, and an allocation of 1 001 units is refused.
// The issuance and its subscriptions are prepared through the API, with a new code at each run:
// the scenario can be played again on the same database.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './helpers';

const HEADERS = { Origin: 'http://localhost:3000' };

/** A call of the API with the session of the page; fails the test on an unexpected answer. */
async function call<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: { data?: object; version?: number } = {},
): Promise<T> {
  const request: APIRequestContext = page.request;
  const response = await request.fetch(path, {
    method,
    headers: {
      ...HEADERS,
      ...(method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
      ...(options.version !== undefined ? { 'If-Match': `"${options.version}"` } : {}),
    },
    ...(options.data ? { data: options.data } : {}),
  });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

interface Issuance {
  id: string;
  version: number;
  terms: { version: number };
  eligibilityRules: { version: number };
}

/** Today in the organisation's time zone (Europe/Paris, D-015), as YYYY-MM-DD. */
function parisDate(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);
}

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

  // An issuance of 1 000 units of 1 000 €, approved (four eyes) and open to subscriptions.
  const created = await call<Issuance>(operator, 'POST', '/api/v1/issuances', {
    data: { name, code },
  });
  const general = await call<Issuance>(operator, 'PATCH', `/api/v1/issuances/${created.id}`, {
    version: created.version,
    data: {
      assetCategory: 'INFRASTRUCTURE',
      countryCode: 'FR',
      currency: 'EUR',
      legalIssuerName: 'Northwind Allocation Notes SAS (demo)',
    },
  });
  const terms = await call<Issuance>(operator, 'PATCH', `/api/v1/issuances/${created.id}/terms`, {
    version: general.terms.version,
    data: {
      targetAmount: '1000000.00',
      minimumAmount: '500000.00',
      maximumAmount: '1000000.00',
      nominalValue: '1000.00',
      totalUnits: '1000',
      interestRate: '0.04',
      rateType: 'FIXED',
      distributionFrequency: 'ANNUAL',
      dayCount: '30E_360',
      subscriptionStartDate: parisDate(),
      subscriptionEndDate: parisDate(30),
      issueDate: parisDate(45),
      maturityDate: parisDate(45 + 3 * 365),
      minSubscriptionAmount: '100000.00',
      maxAmountPerInvestor: '700000.00',
    },
  });
  await call(operator, 'PATCH', `/api/v1/issuances/${created.id}/eligibility-rules`, {
    version: terms.eligibilityRules.version,
    data: { kycMinRemainingValidityDays: 30 },
  });
  await call(operator, 'POST', `/api/v1/issuances/${created.id}/submit`);
  await call(admin1, 'POST', `/api/v1/issuances/${created.id}/approve`);
  await call(admin1, 'POST', `/api/v1/issuances/${created.id}/open-subscription`);

  // Alpine asks 700 units and Baltic 500: 1 200 units for 1 000.
  const requests: [string, string, string][] = [
    ['investor.a@example.com', 'Alpine', '700'],
    ['investor.b@example.com', 'Baltic', '500'],
  ];
  for (const [email, investorName, units] of requests) {
    const found = await call<{ data: { id: string }[] }>(
      operator,
      'GET',
      `/api/v1/investors?q=${investorName}`,
    );
    await call(operator, 'POST', `/api/v1/issuances/${created.id}/invitations`, {
      data: { investorId: found.data[0]!.id },
    });
    const investor = pages[email]!;
    const draft = await call<{ id: string }>(investor, 'POST', '/api/v1/subscriptions', {
      data: { issuanceId: created.id, requestedUnits: units, requestedAmount: `${units}000.00` },
    });
    await call(investor, 'POST', `/api/v1/subscriptions/${draft.id}/submit`, {
      data: { documentsAccepted: true, eligibilityDeclared: true },
    });
    await call(operator, 'POST', `/api/v1/subscriptions/${draft.id}/start-review`);
    await call(admin1, 'POST', `/api/v1/subscriptions/${draft.id}/approve`);
  }
  await call(admin1, 'POST', `/api/v1/issuances/${created.id}/close-subscription`);

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
