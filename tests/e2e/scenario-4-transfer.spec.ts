// Scenario 4 of SPEC §29 — transfer, in a real browser (docs/BACKLOG.md P13-4).
// Given investor A holding 100 units and an eligible investor B, when A asks to transfer 40 units
// to B and a Compliance Officer approves, then A holds 60 units and B 40, the ledger holds BLOCK,
// UNBLOCK and TRANSFER, and a request of 70 more units is refused for insufficient quantity.
// Sending the same request again with the same idempotency key creates no extra movement.
// The holding of A is prepared through the API, with a new issuance at each run.
import { expect, test, type Page } from '@playwright/test';
import { call, closedIssuance, signIn } from './helpers';

test('scenario 4 — transfer of 40 units approved by compliance', async ({ browser }) => {
  const code = `TRF-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const name = `Northwind Transfer Notes ${code}`;
  const pages: Record<string, Page> = {};
  for (const email of [
    'northwind.operator@example.com',
    'northwind.admin1@example.com',
    'northwind.admin2@example.com',
    'northwind.compliance@example.com',
    'investor.a@example.com',
    'investor.c@example.com',
  ]) {
    pages[email] = await (await browser.newContext()).newPage();
    await signIn(pages[email], email);
  }
  const operator = pages['northwind.operator@example.com']!;
  const admin1 = pages['northwind.admin1@example.com']!;
  const admin2 = pages['northwind.admin2@example.com']!;
  const compliance = pages['northwind.compliance@example.com']!;
  const investorA = pages['investor.a@example.com']!;

  // A (Alpine) holds 100 paid units: subscribed, allocated, payment confirmed.
  const issuance = await closedIssuance(pages, {
    code,
    name,
    minimumAmount: '100000.00',
    requests: [['investor.a@example.com', 'Alpine', '100']],
  });
  const round = await call<{ id: string }>(
    operator,
    'POST',
    `/api/v1/issuances/${issuance.id}/allocation-rounds`,
  );
  await call(operator, 'POST', `/api/v1/allocations/${round.id}/propose`);
  await call(admin2, 'POST', `/api/v1/allocations/${round.id}/validate`);
  const subscription = issuance.subscriptions.Alpine!;
  await call(operator, 'POST', `/api/v1/subscriptions/${subscription}/payment/prepare`);
  await call(admin1, 'POST', `/api/v1/subscriptions/${subscription}/payment/confirm`);

  // B (Cedar) gives A its recipient code (D-010).
  const recipient = await call<{ recipientCode: string }>(
    pages['investor.c@example.com']!,
    'GET',
    '/api/v1/me/investor',
  );

  // A asks to transfer 40 units to B.
  await investorA.goto('/en/portal/portfolio');
  const row = investorA.getByRole('row', { name: new RegExp(name) });
  await expect(row.getByRole('cell', { name: '100' }).first()).toBeVisible();
  await row.getByRole('link', { name: /^Transfer / }).click();
  await expect(investorA.getByText(`${name}: 100 units available out of 100 held.`)).toBeVisible();
  await investorA.getByLabel('Recipient code').fill(recipient.recipientCode);
  await investorA.getByLabel('Number of units').fill('40');
  await investorA.getByRole('button', { name: 'Submit the request' }).click();
  await expect(investorA).toHaveURL(/\/portal\/transfers\/[0-9a-f-]+$/);
  await expect(investorA.getByText('Compliance review', { exact: true }).first()).toBeVisible();
  await expect(
    investorA.getByText('The units are blocked while the request is reviewed.'),
  ).toBeVisible();
  const transferId = investorA.url().split('/').at(-1)!;

  // A Compliance Officer approves.
  await compliance.goto('/en/issuer/transfers');
  await compliance
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await expect(compliance).toHaveURL(new RegExp(`/issuer/transfers/${transferId}$`));
  await compliance.getByRole('button', { name: 'Approve and execute' }).click();
  await compliance.getByRole('dialog').getByRole('button', { name: 'Approve and execute' }).click();
  await expect(compliance.getByText('Executed', { exact: true }).first()).toBeVisible();

  // A holds 60 units, B holds 40; the ledger holds BLOCK, UNBLOCK and TRANSFER.
  const positions = await call<{ data: { investorName: string | null; quantityHeld: string }[] }>(
    compliance,
    'GET',
    `/api/v1/positions?issuanceId=${issuance.id}`,
  );
  const held = Object.fromEntries(
    positions.data
      .filter((position) => position.investorName !== null)
      .map((position) => [position.investorName!.split(' ')[0], position.quantityHeld]),
  );
  expect(held).toEqual({ Alpine: '60', Cedar: '40' });
  const ledger = await call<{ data: { type: string }[] }>(
    compliance,
    'GET',
    `/api/v1/ledger?issuanceId=${issuance.id}`,
  );
  expect(ledger.data.slice(0, 3).map((entry) => entry.type)).toEqual([
    'TRANSFER',
    'UNBLOCK',
    'BLOCK',
  ]);

  // 70 more units: the screen refuses them, and so does the API (insufficient quantity).
  await investorA.goto(`/en/portal/transfers/new?issuanceId=${issuance.id}`);
  await investorA.getByLabel('Recipient code').fill(recipient.recipientCode);
  await investorA.getByLabel('Number of units').fill('70');
  await expect(
    investorA.getByText('Enter a whole number of units, between 1 and 60.'),
  ).toBeVisible();
  const tooMuch = await call<{ id: string }>(investorA, 'POST', '/api/v1/transfers', {
    data: { issuanceId: issuance.id, recipientCode: recipient.recipientCode, quantity: '70' },
  });
  const refused = await investorA.request.post(`/api/v1/transfers/${tooMuch.id}/submit`, {
    headers: { Origin: 'http://localhost:3000', 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(refused.status()).toBe(422);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
    'INSUFFICIENT_AVAILABLE_QUANTITY',
  );

  // The same submission sent twice with the same key blocks the units once.
  const small = await call<{ id: string }>(investorA, 'POST', '/api/v1/transfers', {
    data: { issuanceId: issuance.id, recipientCode: recipient.recipientCode, quantity: '10' },
  });
  const key = crypto.randomUUID();
  const headers = { Origin: 'http://localhost:3000', 'Idempotency-Key': key };
  const first = await investorA.request.post(`/api/v1/transfers/${small.id}/submit`, { headers });
  const again = await investorA.request.post(`/api/v1/transfers/${small.id}/submit`, { headers });
  expect([first.status(), again.status()]).toEqual([200, 200]);
  expect(again.headers()['idempotent-replayed']).toBe('true');
  const after = await call<{ data: { type: string }[] }>(
    compliance,
    'GET',
    `/api/v1/ledger?issuanceId=${issuance.id}&type=BLOCK`,
  );
  // The allocation's block, the 40 units' block, and one block of 10 units.
  expect(after.data).toHaveLength(3);

  for (const page of Object.values(pages)) await page.context().close();
});
