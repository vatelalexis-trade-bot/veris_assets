// Scenario 1 of SPEC §29 — issuance creation, in a real browser (docs/BACKLOG.md P10-6).
// Given an Issuer Operator, when the operator creates "Helios Solar SPV 2027" with the wizard and submits it,
// then another Issuer Administrator approves it: DRAFT → UNDER_REVIEW → APPROVED, every transition
// is in the audit log, and the approval by the operator is refused.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('scenario 1 — issuance creation with the wizard, four-eyes approval', async ({ browser }) => {
  // A new code at each run: the scenario can be played again on the same database.
  const code = `HELIOS-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const operatorContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  await signIn(operator, 'northwind.operator@example.com');

  // Draft: name and short code.
  await operator.goto('/en/issuer/issuances/new');
  await operator.getByLabel('Name').fill('Helios Solar SPV 2027');
  await operator.getByLabel('Short code').fill(code);
  await operator.getByRole('button', { name: 'Create the draft' }).click();
  await expect(operator).toHaveURL(/\/issuer\/issuances\/[0-9a-f-]+\/edit$/);
  const issuanceId = operator.url().split('/').at(-2)!;

  // Step 1 — general information.
  await operator.getByLabel('Asset category').selectOption({ label: 'Renewable energy' });
  await operator.getByLabel('Country of issuance').selectOption({ label: 'France' });
  await operator.getByLabel('Currency').selectOption('EUR');
  await operator.getByLabel('Legal issuer').fill('Helios Solar SPV SAS (demo)');
  await operator.getByRole('button', { name: 'Next step' }).click();

  // Step 2 — financial terms.
  await operator.getByLabel('Nominal value of a unit').fill('1000');
  await operator.getByLabel('Total number of units').fill('5000');
  await operator.getByLabel('Target amount').fill('5000000');
  await operator.getByLabel('Minimum amount').fill('2000000');
  await operator.getByLabel('Maximum amount').fill('6000000');
  await operator.getByLabel('Interest rate (%)').fill('5');
  await operator.getByLabel('Distribution frequency').selectOption({ label: 'Semi-annual' });
  await operator.getByLabel('Subscriptions open on').fill('2026-10-01');
  await operator.getByLabel('Subscriptions close on').fill('2026-12-31');
  await operator.getByLabel('Issue date').fill('2027-01-15');
  await operator.getByLabel('Maturity date').fill('2032-01-15');
  await operator.getByLabel('Minimum subscription').fill('100000');
  await operator.getByLabel('Maximum per investor').fill('1000000');
  await operator.getByRole('button', { name: 'Next step' }).click();

  // Step 3 — eligibility: US investors excluded.
  await operator.getByLabel('Excluded countries').selectOption({ label: 'United States' });
  await operator.getByRole('button', { name: 'Next step' }).click();

  // Step 4 — servicing.
  await operator.getByLabel('Day count convention').selectOption({ label: '30E/360' });
  await operator.getByRole('button', { name: 'Next step' }).click();

  // Step 5 — documents (none in this scenario), step 6 — review and submission.
  await operator.getByRole('button', { name: 'Next step' }).click();
  await expect(
    operator.getByText('Everything is consistent: the issuance can be submitted.'),
  ).toBeVisible();
  await operator.getByRole('button', { name: 'Submit for approval' }).click();
  await operator.getByRole('dialog').getByRole('button', { name: 'Submit for approval' }).click();
  await expect(operator).toHaveURL(new RegExp(`/issuer/issuances/${issuanceId}$`));
  await expect(operator.getByText('Under review', { exact: true })).toBeVisible();

  // The operator has no approval action, and the API refuses the approval.
  await expect(operator.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  const refused = await operator.request.post(`/api/v1/issuances/${issuanceId}/approve`, {
    headers: { 'Idempotency-Key': crypto.randomUUID(), Origin: 'http://localhost:3000' },
  });
  expect(refused.status()).toBe(403);

  // Another Issuer Administrator approves.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, 'northwind.admin2@example.com');
  await admin.goto(`/en/issuer/issuances/${issuanceId}`);
  await admin.getByRole('button', { name: 'Approve' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Approved', { exact: true }).first()).toBeVisible();

  // History of the statuses, in the History tab.
  await admin.getByRole('tab', { name: 'History' }).click();
  await expect(admin.getByText('Draft → Under review')).toBeVisible();
  await expect(admin.getByText('Under review → Approved')).toBeVisible();

  // Every transition is in the audit log.
  const audit = await admin.request.get(
    `/api/v1/audit-events?resourceId=${issuanceId}&pageSize=100`,
  );
  const actions = ((await audit.json()) as { data: { action: string }[] }).data.map(
    (row) => row.action,
  );
  expect(actions).toEqual(
    expect.arrayContaining(['ISSUANCE_CREATED', 'ISSUANCE_UNDER_REVIEW', 'ISSUANCE_APPROVED']),
  );

  await operatorContext.close();
  await adminContext.close();
});
